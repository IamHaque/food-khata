"""Authentication core package (AC-06)."""

from .csrf import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    STATE_CHANGING_METHODS,
    generate_csrf_token,
    validate_csrf_token,
)
from .passwords import dummy_verify, hash_password, verify_password
from .sessions import (
    IDLE_TIMEOUT_SECONDS,
    SESSION_COOKIE_NAME,
    clear_session_cookies,
    connect_app_db,
    create_session,
    create_test_user_session,
    delete_session,
    get_session,
    init_app_db,
    rotate_session,
    set_csrf_cookie,
    set_session_cookie,
)
from .throttle import (
    INVALID_CREDENTIALS_MESSAGE,
    THROTTLE_ERROR_MESSAGE,
    check_throttle,
    record_failed_login,
    reset_failed_logins,
)

__all__ = [
    "CSRF_COOKIE_NAME",
    "CSRF_HEADER_NAME",
    "IDLE_TIMEOUT_SECONDS",
    "INVALID_CREDENTIALS_MESSAGE",
    "SESSION_COOKIE_NAME",
    "STATE_CHANGING_METHODS",
    "check_throttle",
    "clear_session_cookies",
    "connect_app_db",
    "create_session",
    "create_test_user_session",
    "delete_session",
    "dummy_verify",
    "generate_csrf_token",
    "get_session",
    "hash_password",
    "init_app_db",
    "record_failed_login",
    "reset_failed_logins",
    "rotate_session",
    "set_csrf_cookie",
    "set_session_cookie",
    "THROTTLE_ERROR_MESSAGE",
    "validate_csrf_token",
    "verify_password",
]
