"""Provider factory and shared base helpers."""

from __future__ import annotations

import os
from typing import Any

from ..contracts import KhataError


def get_provider(name: str, session: dict[str, Any] | None = None) -> Any:
    """Instantiate a provider by name, optionally restoring a session."""
    if name == "zomato":
        from .zomato import Zomato

        return Zomato(session)
    if name == "swiggy":
        from .swiggy import Swiggy

        return Swiggy(session)
    if name == "fake" and fake_enabled():
        from .fake import FakeProvider

        return FakeProvider(name="fake", session=session)
    raise KhataError(f"Unknown provider: {name}")


def fake_enabled() -> bool:
    # Test-only switch; never settable over HTTP.
    return os.environ.get("FOOD_KHATA_ENABLE_FAKE_PROVIDER") == "1"


def provider_names() -> tuple[str, ...]:
    return ("zomato", "swiggy", "fake") if fake_enabled() else ("zomato", "swiggy")


def is_provider(name: Any) -> bool:
    return isinstance(name, str) and name in provider_names() or hasattr(name, "name")
