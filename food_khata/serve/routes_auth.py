"""Authentication routes for Food Khata API (AC-06)."""

import re
import sqlite3
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from food_khata import audit
from food_khata.auth import (
    INVALID_CREDENTIALS_MESSAGE,
    SESSION_COOKIE_NAME,
    THROTTLE_ERROR_MESSAGE,
    can_register,
    check_registration_throttle,
    check_throttle,
    clear_session_cookies,
    create_session,
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
from food_khata.auth.passwords import check_password_rules

from .deps import _get_client_ip, _is_loopback_client, _is_secure_request, get_auth_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SetupStatusResponse(BaseModel):
    has_owner: bool = Field(description="True if an owner account exists")
    registration_open: bool = Field(description="True if registration is currently open")
    insecure_transport: bool = Field(
        default=False, description="True if running on insecure HTTP transport"
    )


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




@router.get("/setup-status", response_model=SetupStatusResponse)
def setup_status(
    request: Request,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """Check whether server setup is needed and if registration is open."""
    has_own = has_owner(conn)
    if not has_own:
        reg_open = True
    else:
        reg_open = is_registration_window_open(conn)
    is_secure = _is_secure_request(request)
    return SetupStatusResponse(
        has_owner=has_own,
        registration_open=reg_open,
        insecure_transport=not is_secure,
    )


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
        conn, join_code=data.join_code, is_loopback=is_loop
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

    if (problem := check_password_rules(data.password, username)) is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=problem)
    is_owner = 0

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
        audit.record(conn, None, "login_failed", username, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS_MESSAGE,
        )

    # 3. Verify password
    if not verify_password(data.password, user["password_hash"]) or user["disabled"]:
        record_failed_login(conn, username, ip)
        audit.record(conn, None, "login_failed", username, ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS_MESSAGE,
        )

    from food_khata.users.context import UserContext

    context = UserContext(request.app.state.data_root, user["id"]).unlock(data.password)

    # 4. Successful login: reset failed login attempts
    reset_failed_logins(conn, username, ip)
    audit.record(conn, user["id"], "login", None, ip)

    # 5. Rotate session ID on login
    old_session_id = request.cookies.get(SESSION_COOKIE_NAME)
    session_id, csrf_token = rotate_session(conn, old_session_id, user["id"])
    request.app.state.unlocked_sessions.pop(old_session_id, None)
    request.app.state.unlocked_sessions[session_id] = (user["id"], context.cipher)

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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/password", response_model=LoginResponse)
def change_password(
    data: ChangePasswordRequest,
    request: Request,
    response: Response,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """Change the signed-in user's own password: the vault is re-wrapped (provider sessions stay readable),
    every other session of the user ends, and a new session is issued."""
    from food_khata.users.context import UserContext

    user_id = request.state.session["user_id"]
    user = conn.execute(
        "SELECT id, username, password_hash, is_owner, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    ip = _get_client_ip(request)
    throttled, retry_after = check_throttle(conn, user["username"], ip)
    if throttled:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=THROTTLE_ERROR_MESSAGE,
            headers={"Retry-After": str(retry_after)},
        )
    if not verify_password(data.current_password, user["password_hash"]):
        record_failed_login(
            conn, user["username"], ip
        )  # a wrong current password counts as a failed login
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "WRONG_PASSWORD", "message": "Current password is incorrect."},
        )
    if (problem := check_password_rules(data.new_password, user["username"])) is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=problem)

    context = UserContext(request.app.state.data_root, user_id).unlock(data.current_password)
    context.change_password(data.current_password, data.new_password)
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (hash_password(data.new_password), user_id),
    )
    conn.commit()
    reset_failed_logins(conn, user["username"], ip)
    audit.record(conn, user_id, "password_change", None, ip)

    _end_sessions(request, conn, user_id)
    session_id, csrf_token = create_session(conn, user_id)
    request.app.state.unlocked_sessions[session_id] = (user_id, context.cipher)
    secure = _is_secure_request(request)
    set_session_cookie(response, session_id, secure=secure)
    set_csrf_cookie(response, csrf_token, secure=secure)
    return LoginResponse(
        user=UserResponse(
            id=user_id,
            username=user["username"],
            is_owner=bool(user["is_owner"]),
            created_at=user["created_at"],
        ),
        csrf_token=csrf_token,
    )


def _end_sessions(request: Request, conn: sqlite3.Connection, user_id: str) -> None:
    """Delete every session of the user and drop their keys from memory."""
    for (session_id,) in conn.execute(
        "SELECT id FROM sessions WHERE user_id = ?", (user_id,)
    ).fetchall():
        request.app.state.unlocked_sessions.pop(session_id, None)
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    conn.commit()


@router.post("/logout-all", response_model=StatusResponse)
def logout_everywhere(
    request: Request,
    response: Response,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """End every session of the signed-in user, on every device."""
    _end_sessions(request, conn, request.state.session["user_id"])
    audit.record(conn, request.state.session["user_id"], "logout_all", None, _get_client_ip(request))
    clear_session_cookies(response)
    return StatusResponse(status="ok")


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
        request.app.state.unlocked_sessions.pop(session["id"], None)
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
