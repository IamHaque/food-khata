"""Small shared interface between the CLI, sync engine and providers."""

from collections.abc import Callable, Iterator
from typing import Any, Protocol


class KhataError(RuntimeError):
    """An actionable error safe to show without exposing credentials."""

    def __init__(self, message: str = "", code: str | None = None) -> None:
        super().__init__(message)
        self.message = str(message)
        self.code = code


class AuthenticationError(KhataError):
    """Authentication was explicitly rejected by a provider."""


class Provider(Protocol):
    name: str

    def profile(self) -> str:
        """Return the authenticated provider account ID."""
        ...

    def login(self, phone: str, get_otp: Callable[[], str]) -> str: ...

    def logout(self) -> None: ...

    def refresh_session(self) -> bool: ...

    def dump_session(self) -> dict[str, Any]: ...

    def pages(self) -> Iterator[list[dict[str, Any]]]:
        """Yield validated records with order_id and history; raise on stalls."""
        ...

    def details(self, order_id: str) -> dict[str, Any]: ...

    def valid_details(self, order_id: str, value: Any) -> bool: ...

    def close(self) -> None: ...
