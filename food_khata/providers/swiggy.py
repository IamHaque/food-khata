"""Swiggy mobile authentication, history and detail validation."""

import gzip
import json
import platform
import re
import time
import uuid
from collections.abc import Callable, Iterator
from typing import Any

import requests

from ..contracts import AuthenticationError, KhataError
from .http import redact, request_json

ROUTES = {
    "bootstrap": ("POST", "https://disc.swiggy.com/api/v2/launch"),
    "check": ("GET", "https://profile.swiggy.com/api/v2/app/login_check"),
    "send_otp": ("GET", "https://profile.swiggy.com/api/v3/app/sms_otp"),
    "verify_otp": ("POST", "https://profile.swiggy.com/api/v3/app/login/verify"),
    "profile": ("GET", "https://profile.swiggy.com/api/v3/user/profile"),
    "history": ("GET", "https://disc.swiggy.com/api/v1/json/account/orders"),
    "details": ("GET", "https://chkout.swiggy.com/api/v1/order/getSingleOrder"),
}


class Client:
    def __init__(
        self, headers: dict[str, str] | None = None, cookies: list[dict[str, Any]] | None = None
    ) -> None:
        client_id = uuid.uuid4().hex
        self.http = requests.Session()
        self.http.headers.update(
            {
                "User-Agent": "Swiggy-Android",
                "Accept": "application/json",
                "Content-Type": "application/json; charset=utf-8",
                "app-version": "4.120.3",
                "version-code": "1875",
                "pl-version": "146",
                "faw-flags": "1354",
                "latitude": "0",
                "longitude": "0",
                "manufacturer": platform.system().upper(),
                "model-name": platform.machine(),
                "os-version": platform.release(),
                "deviceId": client_id,
                "swuid": client_id,
            }
        )
        self.http.headers.update(headers or {})
        try:
            for cookie in cookies or []:
                self.http.cookies.set_cookie(requests.cookies.create_cookie(**cookie))
        except (TypeError, ValueError, KeyError, AttributeError):
            self.http.close()
            raise KhataError(
                "Invalid Swiggy session cookies; restore or remove the session file."
            ) from None

    def call(
        self, stage: str, params: dict[str, Any] | None = None, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        method, url = ROUTES[stage]
        options = {"params": params}
        if stage == "bootstrap":
            options.update(
                data=gzip.compress(json.dumps(body).encode()), headers={"Content-Encoding": "gzip"}
            )
        elif body is not None:
            options["json"] = body
        response_headers: dict[str, str] = {}
        data = request_json(
            self.http,
            method,
            url,
            retry=stage in ("profile", "history", "details"),
            response_headers=response_headers,
            **options,
        )
        envelope = data.get("food") if stage == "bootstrap" else data
        if not isinstance(envelope, dict):
            raise KhataError(f"{stage}: missing response envelope.")
        status = data if stage == "bootstrap" else envelope
        if stage == "history":
            if "failure" in data or not isinstance(data.get("success"), dict):
                raise KhataError("History request did not return a successful widget response.")
        else:
            if status.get("statusCode") == 999:
                raise AuthenticationError("Swiggy session invalid; log in again.")
            if (
                type(status.get("statusCode")) is not int
                or status["statusCode"] != 0
                or status.get("errorCode") not in (None, 0)
            ):
                raise KhataError(f"{stage}: Swiggy did not confirm success.")
        if stage == "bootstrap" and (
            envelope.get("statusCode", 0) != 0 or envelope.get("errorCode") not in (None, 0)
        ):
            raise KhataError("Bootstrap did not establish a Food session.")
        for key in ("tid", "sid", "x-swiggy-auth"):
            value = response_headers.get(key) or envelope.get(key)
            if isinstance(value, str) and value:
                self.http.headers[key] = value
        if response_headers.get("x-clear-swiggy-auth"):
            self.http.headers.pop("x-swiggy-auth", None)
        if stage == "verify_otp":
            account = data.get("data")
            if (
                isinstance(account, dict)
                and isinstance(account.get("token"), str)
                and account["token"]
            ):
                self.http.headers["token"] = account["token"]
        return data

    def profile(self) -> dict[str, Any]:
        account = self.call("profile", params={"silentSession": "true"}).get("data")
        if not isinstance(account, dict) or not account.get("customer_id"):
            raise AuthenticationError(
                "Swiggy did not confirm an authenticated account; log in again."
            )
        return account

    def request_otp(self, phone: str) -> None:
        if not re.fullmatch(r"[6-9][0-9]{9}", phone):
            raise KhataError("Enter a 10-digit Indian mobile number, without +91.")
        self.call(
            "bootstrap",
            body={
                "food": {"options": {}, "track_enabled": False, "feedback_enabled": False},
                "appConfigList": [],
            },
        )
        check = self.call("check", params={"mobile": phone}).get("data")
        if not isinstance(check, dict) or check.get("registered") not in (
            True,
            1,
            "1",
            "true",
            "TRUE",
        ):
            raise KhataError(
                "Existing Swiggy account not confirmed; account creation is not supported."
            )
        self.call("send_otp", params={"mobile": phone})

    def verify_otp(self, otp: str) -> dict[str, Any]:
        if not re.fullmatch(r"[0-9]{4,8}", otp):
            raise KhataError("Enter the numeric SMS OTP.")
        self.call("verify_otp", params={"otp_source": "sms"}, body={"otp": otp})
        account = self.profile()
        return account


def history_orders(page: dict[str, Any]) -> list[dict[str, Any]]:
    success = page.get("success")
    if not isinstance(success, dict):
        raise KhataError("History has no successful widget envelope.")
    # Wire JSON omits empty repeated fields on the final page.
    cards = success.get("cards", [])
    if not isinstance(cards, list):
        raise KhataError("History cards have an unexpected format.")
    orders = []
    for entry in cards:
        wrapper = entry.get("card") if isinstance(entry, dict) else None
        card = wrapper.get("card") if isinstance(wrapper, dict) else None
        if (
            not isinstance(card, dict)
            or not isinstance(card.get("@type"), str)
            or card["@type"].rsplit(".", 1)[-1] != "OrderDetails"
        ):
            raise KhataError("History contains an unrecognized order card.")
        order_id = card.get("orderId", card.get("order_id"))
        if not isinstance(order_id, str) or not re.fullmatch(r"[0-9]{1,30}", order_id):
            raise KhataError("An order card has no usable order ID.")
        orders.append({"order_id": order_id, "history": redact(card), "details": None})
    return orders


def order_details(client: Client, order_id: str) -> dict[str, Any]:
    data = client.call("details", params={"order_id": order_id}).get("data")
    orders = data.get("orders") if isinstance(data, dict) else None
    if not isinstance(orders, list) or not any(
        isinstance(order, dict)
        and str(order.get("order_id")) == order_id
        and isinstance(order.get("order_items"), list)
        for order in orders
    ):
        raise KhataError("Order details do not match the requested order or lack item data.")
    return redact(data)


class Swiggy:
    name = "swiggy"

    def __init__(self, session: dict[str, Any] | None = None) -> None:
        if session is not None and (
            not isinstance(session, dict)
            or not isinstance(session.get("headers"), dict)
            or not isinstance(session.get("cookies"), list)
            or set(session) != {"headers", "cookies"}
            or any(
                not isinstance(k, str) or not isinstance(v, str)
                for k, v in session["headers"].items()
            )
            or any(not isinstance(cookie, dict) for cookie in session["cookies"])
        ):
            raise KhataError("Invalid Swiggy session.")
        try:
            self.client = Client(**(session or {}))
        except (TypeError, ValueError, KeyError):
            raise KhataError("Invalid Swiggy session.") from None

    def profile(self) -> str:
        account = self.client.profile().get("customer_id")
        if (
            isinstance(account, bool)
            or not isinstance(account, (str, int))
            or not str(account).strip()
        ):
            raise KhataError("Swiggy did not confirm an authenticated account.")
        return str(account)

    def login(self, phone: str, get_otp: Callable[[], str]) -> str:
        self.client.request_otp(phone)
        self.client.verify_otp(get_otp().strip())
        return self.profile()

    def logout(self) -> None:
        self.client.http.headers.clear()
        self.client.http.cookies.clear()

    def refresh_session(self) -> bool:
        try:
            self.profile()
            return True
        except Exception:
            return False

    def dump_session(self) -> dict[str, Any]:
        return {
            "headers": dict(self.client.http.headers),
            "cookies": [
                {
                    key: getattr(cookie, key)
                    for key in ("name", "value", "domain", "path", "secure", "expires")
                }
                for cookie in self.client.http.cookies
            ],
        }

    def pages(self) -> Iterator[list[dict[str, Any]]]:
        seen, cursor = set(), None
        while True:
            params = {"order_count": 5}
            if cursor:
                params["order_id"] = cursor
            batch = history_orders(self.client.call("history", params=params))
            if not batch:
                return
            ids = [item["order_id"] for item in batch]
            fresh = [item for item in batch if item["order_id"] not in seen]
            if len(ids) != len(set(ids)) or not fresh or ids[-1] == cursor:
                raise KhataError("History pagination stalled.")
            seen.update(ids)
            cursor = ids[-1]
            yield fresh
            time.sleep(1)

    def valid_details(self, order_id: str, value: Any) -> bool:
        orders = value.get("orders") if isinstance(value, dict) else None
        return isinstance(orders, list) and any(
            isinstance(order, dict)
            and str(order.get("order_id")) == order_id
            and isinstance(order.get("order_items"), list)
            for order in orders
        )

    def details(self, order_id: str) -> dict[str, Any]:
        if not isinstance(order_id, str) or not re.fullmatch(r"[0-9]{1,30}", order_id):
            raise KhataError("Invalid order ID.")
        value = order_details(self.client, order_id)
        time.sleep(1)
        return value

    def close(self) -> None:
        self.client.http.close()
