"""Authentication routes for Food Khata API (AC-06)."""

import ipaddress
import re
import sqlite3
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from food_khata.auth import (
    INVALID_CREDENTIALS_MESSAGE,
    SESSION_COOKIE_NAME,
    THROTTLE_ERROR_MESSAGE,
    can_register,
    check_registration_throttle,
    check_throttle,
    clear_session_cookies,
    clear_setup_code,
    connect_app_db,
    delete_session,
    dummy_verify,
    generate_csrf_token,
    has_owner,
    hash_password,
    is_registration_window_open,
    record_failed_login,
    record_registration_attempt,
    reset_failed_logins,
    reset_registration_throttle,
    rotate_session,
    set_csrf_cookie,
    set_session_cookie,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def get_auth_db(request: Request) -> Iterator[sqlite3.Connection]:
    """Dependency that yields a connection to app.db."""
    app_db_path = getattr(request.app.state, "app_db_path", "app.db")
    conn = connect_app_db(app_db_path)
    try:
        yield conn
    finally:
        conn.close()


class SetupStatusResponse(BaseModel):
    has_owner: bool = Field(description="True if an owner account exists")
    registration_open: bool = Field(description="True if registration is currently open")


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    join_code: str | None = None


class UserResponse(BaseModel):
    id: str
    username: str
    is_owner: bool
    created_at: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    user: UserResponse
    csrf_token: str


class CsrfResponse(BaseModel):
    csrf_token: str


class StatusResponse(BaseModel):
    status: str


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def _is_loopback_client(request: Request) -> bool:
    host = request.client.host if request.client else "127.0.0.1"
    if host in {"testclient", "localhost", "127.0.0.1", "::1"}:
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _is_secure_request(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


@router.get("/setup-status", response_model=SetupStatusResponse)
def setup_status(conn: Annotated[sqlite3.Connection, Depends(get_auth_db)]):
    """Check whether server setup is needed and if registration is open."""
    has_own = has_owner(conn)
    if not has_own:
        reg_open = True
    else:
        reg_open = is_registration_window_open(conn)
    return SetupStatusResponse(has_owner=has_own, registration_open=reg_open)


@router.post("/register", response_model=UserResponse)
def register(
    data: RegisterRequest,
    request: Request,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """Register a new user.

    The first registered user automatically becomes the owner (via loopback or setup code).
    Subsequent registrations require an open window or valid join code, capped at 8 users.
    """
    ip = _get_client_ip(request)

    # 1. Registration rate limit (5 attempts per 10 min per IP)
    is_throttled, retry_after = check_registration_throttle(conn, ip)
    if is_throttled:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    # Record registration attempt
    record_registration_attempt(conn, ip)

    # 2. Check if registration is allowed (first claim, 8 user cap, window / join code)
    is_loop = _is_loopback_client(request)
    allowed, err_msg, status_code = can_register(
        conn,
        join_code=data.join_code,
        is_loopback=is_loop,
        setup_code=data.join_code,
    )
    if not allowed:
        raise HTTPException(
            status_code=status_code,
            detail=err_msg or "Registration is closed.",
        )

    username = data.username.strip()
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", username):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username must contain only alphanumeric characters, underscores, or hyphens.",
        )

    # Check if user already exists
    existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists.",
        )

    has_own = has_owner(conn)
    is_owner = 1 if not has_own else 0

    user_id = str(uuid.uuid4())
    pw_hash = hash_password(data.password)
    created_at = datetime.now(UTC).isoformat()

    conn.execute(
        "INSERT INTO users (id, username, password_hash, is_owner, disabled, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, username, pw_hash, is_owner, 0, created_at),
    )
    conn.commit()

    # Successful registration resets attempt counter for this IP
    reset_registration_throttle(conn, ip)

    if is_owner:
        clear_setup_code(conn)
        data_root = getattr(request.app.state, "data_root", None)
        if data_root:
            try:
                from food_khata.users import adopt_legacy_root

                adopt_legacy_root(data_root, user_id)
            except Exception:
                pass

    return UserResponse(
        id=user_id,
        username=username,
        is_owner=bool(is_owner),
        created_at=created_at,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """Authenticate with username and password, returning user info and session cookies."""
    username = data.username.strip()
    ip = _get_client_ip(request)

    # 1. Check login throttle (5 failed attempts within 10 min window)
    is_throttled, retry_after = check_throttle(conn, username, ip)
    if is_throttled:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=THROTTLE_ERROR_MESSAGE,
            headers={"Retry-After": str(retry_after)},
        )

    # 2. Look up user
    user = conn.execute(
        "SELECT id, username, password_hash, is_owner, disabled, created_at FROM users WHERE username = ?",
        (username,),
    ).fetchone()

    # Generic error text never reveals whether username exists
    if user is None:
        dummy_verify()
        record_failed_login(conn, username, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS_MESSAGE,
        )

    # 3. Verify password
    if not verify_password(data.password, user["password_hash"]) or user["disabled"]:
        record_failed_login(conn, username, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS_MESSAGE,
        )

    # 4. Successful login: reset failed login attempts
    reset_failed_logins(conn, username, ip)

    # 5. Rotate session ID on login
    old_session_id = request.cookies.get(SESSION_COOKIE_NAME)
    session_id, csrf_token = rotate_session(conn, old_session_id, user["id"])

    # 6. Set HttpOnly/SameSite=Lax session cookie (Secure when HTTPS) and CSRF cookie
    secure = _is_secure_request(request)
    set_session_cookie(response, session_id, secure=secure)
    set_csrf_cookie(response, csrf_token, secure=secure)

    return LoginResponse(
        user=UserResponse(
            id=user["id"],
            username=user["username"],
            is_owner=bool(user["is_owner"]),
            created_at=user["created_at"],
        ),
        csrf_token=csrf_token,
    )


@router.post("/logout", response_model=StatusResponse)
def logout(
    request: Request,
    response: Response,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """Invalidate current session and delete cookies."""
    session = getattr(request.state, "session", None)
    if session:
        delete_session(conn, session["id"])
    clear_session_cookies(response)
    return StatusResponse(status="ok")


@router.get("/csrf", response_model=CsrfResponse)
def get_csrf(request: Request, response: Response):
    """Retrieve or generate a CSRF token."""
    session = getattr(request.state, "session", None)
    if session and session.get("csrf_token"):
        csrf = session["csrf_token"]
    else:
        csrf = request.cookies.get("csrf_token") or generate_csrf_token()

    secure = _is_secure_request(request)
    set_csrf_cookie(response, csrf, secure=secure)
    return CsrfResponse(csrf_token=csrf)


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    request: Request,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """Get the currently authenticated user's profile."""
    session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    user = conn.execute(
        "SELECT id, username, is_owner, created_at FROM users WHERE id = ?",
        (session["user_id"],),
    ).fetchone()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    return UserResponse(
        id=user["id"],
        username=user["username"],
        is_owner=bool(user["is_owner"]),
        created_at=user["created_at"],
    )
