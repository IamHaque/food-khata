"""Bounded requests and archive redaction shared by provider clients."""

import re
import time
from typing import Any

import requests

from ..contracts import AuthenticationError, KhataError


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: "[redacted]"
            if re.sub(r"[^a-z]", "", key.lower())
            in {
                "tid",
                "sid",
                "otp",
                "cookie",
                "setcookie",
                "authorization",
                "xswiggyauth",
                "xoztok",
            }
            or "token" in re.sub(r"[^a-z]", "", key.lower())
            else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def request_json(
    session: requests.Session,
    method: str,
    url: str,
    *,
    retry: bool = True,
    response_headers: dict[str, str] | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    for attempt in range(3 if retry else 1):
        try:
            response = session.request(method, url, timeout=25, allow_redirects=False, **kwargs)
        except requests.RequestException:
            if retry and attempt < 2:
                time.sleep(2**attempt)
                continue
            raise KhataError("Network request failed; saved data is preserved.") from None
        if response.status_code in (429, 500, 502, 503, 504) and retry and attempt < 2:
            try:
                delay = float(response.headers.get("Retry-After", 2**attempt))
            except ValueError:
                delay = 2**attempt
            time.sleep(max(0, min(delay, 30)))
            continue
        if response.status_code == 401:
            raise AuthenticationError("Session expired; log in again.")
        if response.status_code != 200:
            raise KhataError(
                f"Provider returned HTTP {response.status_code}; access may be blocked."
            )
        try:
            data = response.json()
        except ValueError:
            raise KhataError("Provider returned invalid JSON.") from None
        if not isinstance(data, dict):
            raise KhataError("Provider returned an unexpected response format.")
        if response_headers is not None:
            response_headers.update({key.lower(): value for key, value in response.headers.items()})
        return data
    raise AssertionError("Unreachable retry state")
