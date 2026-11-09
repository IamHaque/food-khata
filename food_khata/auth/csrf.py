"""CSRF protection utilities (AC-06)."""

import hmac
import secrets

CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"
STATE_CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def generate_csrf_token() -> str:
    """Generate a cryptographically secure random CSRF token."""
    return secrets.token_urlsafe(32)


def validate_csrf_token(token: str | None, expected: str | None) -> bool:
    """Validate CSRF token against expected value using constant-time comparison."""
    if not token or not expected or not isinstance(token, str) or not isinstance(expected, str):
        return False
    return hmac.compare_digest(token, expected)
