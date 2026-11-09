"""Zomato phone authentication and account order-history endpoints."""

import base64
import hashlib
import re
import secrets
import time
from collections.abc import Callable, Iterator
from typing import Any
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import requests
from curl_cffi import requests as curl_requests

from ..contracts import AuthenticationError, KhataError
from .http import redact, request_json
from .zomato_headers import AUTH_HEADERS, ZOMATO_CLIENT_ID

CLIENT_ID = ZOMATO_CLIENT_ID
ACCOUNTS = "https://accounts.zomato.com"
CALLBACK = ACCOUNTS + "/zoauth/callback"
API = "https://api.zomato.com/"


def order_id(action: Any) -> str | None:
    if isinstance(action, dict):
        for key in ("tab_id", "order_id"):
            if re.fullmatch(r"[0-9]+", str(action.get(key, ""))):
                return str(action[key])
        for value in action.values():
            found = order_id(value)
            if found:
                return found
    elif isinstance(action, list):
        for value in action:
            found = order_id(value)
            if found:
                return found
    elif isinstance(action, str) and "://" in action:
        parsed = urlparse(action)
        if parsed.scheme == "zomato" and parsed.netloc == "delivery":
            match = re.fullmatch(r"/([0-9]+)/?", parsed.path)
            if match:
                return match[1]
        for key, values in parse_qs(parsed.query).items():
            if key.lower().replace("_", "") in ("tabid", "orderid"):
                if values and re.fullmatch(r"[0-9]+", values[0]):
                    return values[0]
    return None


class Zomato:
    name = "zomato"

    def __init__(self, session: dict[str, Any] | None = None) -> None:
        self.http = requests.Session()
        self.tokens: dict[str, str] = {}
        if session is not None:
            if (
                not isinstance(session, dict)
                or not isinstance(session.get("access_token"), str)
                or not session["access_token"]
                or not isinstance(session.get("refresh_token", ""), str)
            ):
                self.http.close()
                raise KhataError(
                    "Invalid Zomato session file; restore or remove it to log in again."
                )
            self.tokens = {key: session.get(key, "") for key in ("access_token", "refresh_token")}
        self.http.headers.update(
            {
                key: AUTH_HEADERS[key]
                for key in (
                    "X-Zomato-API-Key",
                    "X-Zomato-App-Version",
                    "X-Zomato-App-Version-Code",
                    "X-Zomato-Client-Id",
                    "X-Zomato-UUID",
                )
            }
        )
        self.http.headers["Accept"] = "application/json"
        self.http.headers["X-Zomato-Access-Token"] = self.tokens.get("access_token", "")

    def _api(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.tokens.get("access_token"):
            raise AuthenticationError("Log in to Zomato first.")
        return request_json(self.http, method, API + path, **kwargs)

    def profile(self) -> str:
        data = self._api("GET", "gw/user/info")
        # The mobile endpoint returns a top-level user_id, unlike Swiggy's data envelope.
        identity = data.get("user_id") or data.get("id")
        if (
            isinstance(identity, bool)
            or not isinstance(identity, (str, int))
            or not str(identity).strip()
        ):
            raise KhataError(
                "Zomato profile is missing an account ID; response format needs inspection."
            )
        return str(identity)

    @staticmethod
    def _auth_url(url: str) -> str:
        parsed = urlparse(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname != "accounts.zomato.com"
            or parsed.port not in (None, 443)
            or parsed.username
            or parsed.password
        ):
            raise KhataError("Zomato returned an unsafe authentication redirect.")
        return url

    def _auth_request(self, auth: Any, method: str, url: str, **kwargs: Any) -> Any:
        url = self._auth_url(url)
        stage = {
            "/oauth2/auth": "authorization",
            "/login/phone": "OTP verification"
            if kwargs.get("data", {}).get("type") == "verify"
            else "OTP request",
            "/consent": "consent",
            "/token": "token exchange",
        }.get(urlparse(url).path, "authentication redirect")
        for _ in range(10):
            try:
                response = auth.request(method, url, timeout=25, allow_redirects=False, **kwargs)
            except curl_requests.RequestsError:
                raise KhataError(
                    f"Zomato authentication network failure during {stage}; no request was retried."
                ) from None
            if response.status_code in (301, 302, 303, 307, 308):
                target = response.headers.get("Location")
                if not target:
                    raise KhataError("Zomato authentication redirect is missing its destination.")
                url = self._auth_url(urljoin(url, target))
                if response.status_code in (301, 302, 303):
                    method, kwargs = "GET", {}
                continue
            if response.status_code != 200:
                raise KhataError(
                    f"Zomato authentication returned HTTP {response.status_code} during {stage}."
                )
            return response
        raise KhataError("Zomato authentication redirected too many times.")

    def _auth_json(self, auth: Any, path: str, data: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/x-www-form-urlencoded"}
        if path == "/token":
            headers["Accept"] = "application/json, text/plain, */*"
        response = self._auth_request(auth, "POST", ACCOUNTS + path, data=data, headers=headers)
        try:
            result = response.json()
        except ValueError:
            raise KhataError("Zomato authentication returned invalid JSON.") from None
        if not isinstance(result, dict) or result.get("status") is not True:
            raise KhataError("Zomato did not confirm authentication; check the OTP or try later.")
        return result

    def start_login(self, phone: str) -> None:
        if not re.fullmatch(r"[6-9][0-9]{9}", phone):
            raise KhataError("Enter a valid 10-digit Indian mobile number.")
        self._pending_phone = phone

    def verify_otp(self, code: str) -> str:
        if not getattr(self, "_pending_phone", None):
            raise KhataError("No login in progress; start login first.")
        phone = self._pending_phone
        del self._pending_phone
        return self.login(phone, lambda: code)

    def login(self, phone: str, get_otp: Callable[[], str]) -> str:
        if not re.fullmatch(r"[6-9][0-9]{9}", phone):
            raise KhataError("Enter a valid 10-digit Indian mobile number.")
        verifier = secrets.token_urlsafe(32)
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .decode()
            .rstrip("=")
        )
        state = secrets.token_urlsafe(32)
        with curl_requests.Session(
            impersonate="chrome99_android",
            default_headers=False,
            akamai="1:65536;3:1000;4:6291456|15663105|0|m,a,s,p",
        ) as auth:
            auth.headers.update(AUTH_HEADERS)
            auth.cookies.set("zxcv", verifier, domain=".zomato.com")
            auth.cookies.set("cid", CLIENT_ID, domain=".zomato.com")
            auth.cookies.set("rurl", CALLBACK, domain=".zomato.com")
            params = {
                "urlAuthorize": ACCOUNTS + "/oauth/auth",
                "approval_prompt": "auto",
                "scope": "offline openid",
                "response_type": "code",
                "code_challenge_method": "S256",
                "redirect_uri": CALLBACK,
                "state": state,
                "client_id": CLIENT_ID,
                "code_challenge": challenge,
            }
            response = self._auth_request(
                auth, "GET", ACCOUNTS + "/oauth2/auth?" + urlencode(params)
            )
            lc = parse_qs(urlparse(response.url).query).get("login_challenge", [None])[0]
            if not lc:
                raise KhataError("Zomato did not supply a login challenge.")
            self._auth_json(
                auth,
                "/login/phone",
                {
                    "number": phone,
                    "country_id": "1",
                    "lc": lc,
                    "type": "initiate",
                    "verification_type": "sms",
                    "package_name": "com.application.zomato",
                    "message_uuid": "",
                },
            )
            otp = get_otp().strip()
            if not re.fullmatch(r"[0-9]{4,8}", otp):
                raise KhataError("Enter the numeric OTP (4–8 digits).")
            verified = self._auth_json(
                auth,
                "/login/phone",
                {
                    "number": phone,
                    "otp": otp,
                    "country_id": "1",
                    "lc": lc,
                    "type": "verify",
                    "trust_this_device": "true",
                    "device_token": "",
                },
            )
            response = self._follow_result(auth, verified)
            consent = parse_qs(urlparse(response.url).query).get("consent_challenge", [None])[0]
            if not consent:
                raise KhataError("Zomato did not supply a consent challenge.")
            approved = self._auth_json(auth, "/consent", {"cc": consent})
            response = self._follow_result(auth, approved)
            query = parse_qs(urlparse(response.url).query)
            if urlparse(response.url).path != "/zoauth/callback" or query.get("state") != [state]:
                raise KhataError("Zomato OAuth callback or state did not match this login.")
            code = query.get("code", [None])[0]
            if not code:
                raise KhataError("Zomato authorization code is missing.")
            result = self._auth_json(
                auth,
                "/token",
                {
                    "grant_type": "authorization_code",
                    "code": code,
                    "state": state,
                    "scope": query.get("scope", ["offline openid"])[0],
                    "code_verifier": verifier,
                    "client_id": CLIENT_ID,
                    "redirect_uri": CALLBACK,
                },
            )
            tokens = result.get("token")
            if (
                not isinstance(tokens, dict)
                or not isinstance(tokens.get("access_token"), str)
                or not tokens["access_token"]
                or not isinstance(tokens.get("refresh_token", ""), str)
            ):
                raise KhataError("Zomato token response is incomplete.")
            self.tokens = {key: tokens.get(key, "") for key in ("access_token", "refresh_token")}
            self.http.headers["X-Zomato-Access-Token"] = self.tokens["access_token"]
        return self.profile()

    def _follow_result(self, auth: Any, result: dict[str, Any]) -> Any:
        target = result.get("redirect_to")
        if not isinstance(target, str):
            raise KhataError("Zomato authentication redirect is missing.")
        return self._auth_request(auth, "GET", target)

    def logout(self) -> None:
        result = request_json(
            self.http,
            "POST",
            ACCOUNTS + "/signout",
            retry=False,
            headers={
                "X-Zomato-Refresh-Token": self.tokens.get("refresh_token", ""),
                "User-Agent": AUTH_HEADERS["User-Agent"],
            },
            cookies={"cid": CLIENT_ID, "rurl": CALLBACK, "zxcv": ""},
        )
        if result.get("status") is not True:
            raise KhataError("Zomato logout was not confirmed; saved session retained.")
        self.tokens.clear()
        self.http.headers.pop("X-Zomato-Access-Token", None)

    def refresh_session(self) -> bool:
        refresh_token = self.tokens.get("refresh_token")
        if not refresh_token:
            return False
        with curl_requests.Session(
            impersonate="chrome99_android",
            default_headers=False,
            akamai="1:65536;3:1000;4:6291456|15663105|0|m,a,s,p",
        ) as auth:
            auth.headers.update(AUTH_HEADERS)
            try:
                result = self._auth_json(
                    auth,
                    "/token",
                    {
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                        "client_id": CLIENT_ID,
                    },
                )
            except Exception:
                return False
            tokens = result.get("token")
            if (
                not isinstance(tokens, dict)
                or not isinstance(tokens.get("access_token"), str)
                or not tokens["access_token"]
            ):
                return False
            self.tokens["access_token"] = tokens["access_token"]
            if isinstance(tokens.get("refresh_token"), str) and tokens["refresh_token"]:
                self.tokens["refresh_token"] = tokens["refresh_token"]
            self.http.headers["X-Zomato-Access-Token"] = self.tokens["access_token"]
            try:
                self.profile()
                return True
            except Exception:
                return False

    def dump_session(self) -> dict[str, Any]:
        return dict(self.tokens)

    def _location(self) -> dict[str, str]:
        data = self._api(
            "POST",
            "gw/user/location/selection",
            json={
                "android_country": "",
                "location_permissions": {
                    "device_location_on": False,
                    "location_permission_available": False,
                    "precise_location_permission_available": False,
                },
                "current_app_address_id": None,
                "incremental_call": False,
                "source": "delivery_home",
                "lang": "en",
                "android_language": "en",
                "postback_params": "{}",
                "recent_locations": [],
                "city_id": "1",
            },
        )
        response = data.get("response")
        results = response.get("results") if isinstance(response, dict) else None
        if not isinstance(results, list):
            raise KhataError("Zomato saved locations response is invalid.")
        for result in results:
            try:
                address = result["location_address_snippet"]["click_action"][
                    "update_location_result"
                ]["address"]
                place = address.get("place") or {}
                if not address.get("id"):
                    continue
                return {
                    "address_id": str(address["id"]),
                    **{
                        key: str(place.get(key) or address.get(key) or "")
                        for key in (
                            "entity_type",
                            "entity_id",
                            "place_type",
                            "place_id",
                            "place_name",
                            "cell_id",
                            "city_id",
                        )
                    },
                }
            except (KeyError, TypeError, AttributeError):
                continue
        raise KhataError("Add a saved address in Zomato before syncing order history.")

    def pages(self) -> Iterator[list[dict[str, Any]]]:
        body = {
            "load_more": False,
            "page_index": "1",
            "count": 10,
            "location": self._location(),
            "postback_params": "{}",
            "previous_search_params": "{}",
            "request_type": "initial",
            "is_gold_mode_on": False,
        }
        seen: set[str] = set()
        while True:
            data = self._api("POST", "gw/order/history/online_order", json=body)
            if (
                data.get("status") != "success"
                or not isinstance(data.get("results"), list)
                or type(data.get("has_more")) is not bool
            ):
                raise KhataError("Zomato history has an invalid success or pagination response.")
            batch = []
            recognized = False
            for result in data["results"]:
                if not isinstance(result, dict):
                    raise KhataError("Invalid Zomato history snippet.")
                for key, card in result.items():
                    if not key.startswith("order_history_snippet_type_"):
                        continue
                    identity = (
                        order_id(card.get("click_action")) if isinstance(card, dict) else None
                    )
                    if (
                        not identity
                        and key == "order_history_snippet_type_2"
                        and isinstance(card, dict)
                    ):
                        # Older order cards omit navigation; their top-level identifier is the order ID.
                        identifier = str(card.get("identifier", ""))
                        if re.fullmatch(r"[0-9]+", identifier):
                            identity = identifier
                    if not identity:
                        raise KhataError("Zomato order card is missing a usable order ID.")
                    recognized = True
                    if identity not in seen:
                        seen.add(identity)
                        batch.append({"order_id": identity, "history": redact(card)})
            if not recognized and data["results"]:
                raise KhataError("Zomato history contains no recognized orders.")
            yield batch
            if not data["has_more"]:
                return
            if (
                not batch
                or not isinstance(data.get("postback_params"), str)
                or not data["postback_params"]
            ):
                raise KhataError("Zomato history pagination stalled.")
            body.update(
                load_more=True,
                page_index=str(int(body["page_index"]) + 1),
                request_type="load_more",
            )
            for key in (
                "postback_params",
                "postback_params_v2",
                "previous_search_params",
                "previous_search_params_v2",
            ):
                if key in data:
                    body[key] = data[key]
            time.sleep(0.25)

    def valid_details(self, order_id: str, value: Any) -> bool:
        return (
            isinstance(value, dict)
            and str(value.get("id")) == order_id
            and isinstance(value.get("order"), dict)
            and isinstance(value["order"].get("items"), list)
        )

    def details(self, order_id: str) -> dict[str, Any]:
        if not re.fullmatch(r"[0-9]+", order_id):
            raise KhataError("Invalid Zomato order ID.")
        data = self._api("GET", "v2/order/tab.json/" + order_id).get("response")
        if not self.valid_details(order_id, data):
            raise KhataError("Zomato order details do not match or lack item data.")
        time.sleep(0.25)
        return redact(data)

    def close(self) -> None:
        self.http.close()
