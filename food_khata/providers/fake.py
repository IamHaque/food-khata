"""Deterministic in-memory provider test double (no network)."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

from ..contracts import AuthenticationError, KhataError

RATE_LIMIT_STATUS = 429
EXPIRED_STATUS = 401


class RateLimitError(KhataError):
    status_code = RATE_LIMIT_STATUS


class ExpiredSessionError(AuthenticationError):
    status_code = EXPIRED_STATUS


class FakeProvider:
    def __init__(
        self,
        provider: str = "zomato",
        *,
        name: str | None = None,
        phone: str = "9876543210",
        account_id: str = "fake-account-1",
        otp_code: str = "123456",
        wrong_code: bool = False,
        rate_limit: bool = False,
        expired: bool = False,
        partial: bool = False,
        total_orders: int = 6,
        page_size: int = 2,
        orders: list[dict[str, Any]] | None = None,
        session: dict[str, Any] | None = None,
    ) -> None:
        self.name = name or provider
        self.phone = phone
        self.account_id = account_id
        self.otp_code = otp_code
        self.wrong_code = wrong_code
        self.rate_limit = rate_limit
        self.expired = expired
        self.partial = partial
        self.total_orders = total_orders
        self.page_size = page_size
        self._orders = orders
        self._session_valid = (session is not None or True) and not expired
        self._pending_phone: str | None = None
        self.closed = False

    # --- Provider protocol ---
    def profile(self) -> str:
        if self.expired or not self._session_valid:
            raise ExpiredSessionError("Session expired; log in again.")
        return self.account_id

    def start_login(self, phone: str) -> None:
        if not isinstance(phone, str) or not phone.strip():
            raise KhataError("Enter a valid phone number.")
        self._pending_phone = phone.strip()

    def verify_otp(self, code: str) -> str:
        if self.rate_limit:
            raise RateLimitError("Provider rate limited the request.")
        if self.wrong_code or str(code).strip() != self.otp_code:
            raise KhataError("Invalid OTP code.")
        if not self._pending_phone:
            raise KhataError("No login in progress; start login first.")
        self._pending_phone = None
        self._session_valid = True
        self.expired = False
        return self.account_id

    def login(self, phone: str, get_otp: Callable[[], str]) -> str:
        self.start_login(phone)
        return self.verify_otp(get_otp())

    def logout(self) -> None:
        self._session_valid = False

    def refresh_session(self) -> bool:
        if self.expired:
            return False
        self._session_valid = True
        return True

    def dump_session(self) -> dict[str, Any]:
        return {"access_token": "fake-token", "provider": self.name}

    def _order_list(self) -> list[dict[str, Any]]:
        if self._orders is not None:
            return [dict(item) for item in self._orders]
        result = []
        for i in range(self.total_orders):
            oid = str(1000 + i)
            result.append({"order_id": oid, "history": {"id": oid, "token": "secret"}, "details": None})
        return result

    def pages(self) -> Iterator[list[dict[str, Any]]]:
        orders = self._order_list()
        page_size = max(1, self.page_size)
        yielded = 0
        for start in range(0, len(orders), page_size):
            if self.partial and yielded > 0 and start >= page_size:
                raise KhataError("Partial failure during sync.")
            batch = [dict(item) for item in orders[start : start + page_size]]
            yielded += len(batch)
            yield batch
        if self.partial and len(orders) == 0:
            raise KhataError("Partial failure during sync.")

    def valid_details(self, order_id: str, value: Any) -> bool:
        if not isinstance(value, dict):
            return False
        orders = value.get("orders") if "orders" in value else value.get("order")
        if isinstance(value.get("id"), str) and str(value.get("id")) == order_id:
            return isinstance(value.get("order"), dict)
        if isinstance(orders, list):
            return any(
                isinstance(o, dict) and str(o.get("order_id", o.get("id"))) == str(order_id)
                for o in orders
            )
        return False

    def details(self, order_id: str) -> dict[str, Any]:
        if self.partial and str(order_id).endswith("3"):
            raise KhataError("Partial failure fetching details.")
        oid = str(order_id)
        return {"id": oid, "order": {"id": oid, "items": [{"name": "Item", "price": 100}]}}

    def close(self) -> None:
        self.closed = True
