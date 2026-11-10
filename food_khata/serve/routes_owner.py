"""Owner, setup, and registration management routes (AC-07)."""

import ipaddress
import sqlite3
from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from food_khata.auth import (
    MAX_USERS,
    OwnerAlreadyExistsError,
    SetupForbiddenError,
    claim_owner,
    close_registration_window,
    connect_app_db,
    get_registration_window,
    get_user_count,
    has_join_code,
    has_owner,
    list_users,
    open_registration_window,
    reset_user_password,
    rotate_join_code,
    rotate_session,
    set_csrf_cookie,
    set_session_cookie,
    set_user_disabled,
    transfer_ownership,
)

router = APIRouter(prefix="/api/owner", tags=["owner"])


def get_auth_db(request: Request) -> Iterator[sqlite3.Connection]:
    """Dependency that yields a connection to app.db."""
    app_db_path = getattr(request.app.state, "app_db_path", "app.db")
    conn = connect_app_db(app_db_path)
    try:
        yield conn
    finally:
        conn.close()


def _get_client_ip(request: Request) -> str:
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
    if getattr(request.app.state, "is_https", False):
        return True
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


def require_owner(request: Request) -> dict[str, Any]:
    """Dependency enforcing that the caller is logged in as the owner."""
    session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    if not session.get("is_owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner access required.",
        )
    return session


# --- Schemas ---


class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    setup_code: str | None = None
    adopt_data: bool = True


class UserResponse(BaseModel):
    id: str
    username: str
    is_owner: bool
    disabled: bool = False
    created_at: str


class SetupCheckResponse(BaseModel):
    has_owner: bool
    is_loopback: bool


class WindowRequest(BaseModel):
    duration_seconds: int | None = None
    duration_minutes: int | None = None
    action: str | None = None  # "open", "close"


class WindowStatusResponse(BaseModel):
    is_open: bool
    remaining_seconds: float | None = None
    until_closed: bool = False


class OwnerStatusResponse(BaseModel):
    window: WindowStatusResponse
    has_join_code: bool
    user_count: int
    max_users: int = MAX_USERS


class RotateJoinCodeResponse(BaseModel):
    join_code: str


class DisableUserRequest(BaseModel):
    disabled: bool = True


class ResetUserPasswordRequest(BaseModel):
    owner_password: str
    new_password: str | None = None


class ResetUserPasswordResponse(BaseModel):
    status: str
    user_id: str
    temporary_password: str | None = None


class TransferOwnershipRequest(BaseModel):
    owner_password: str
    to_username: str | None = None
    to_user_id: str | None = None


class StatusResponse(BaseModel):
    status: str


# --- Endpoints ---


@router.get("/setup", response_model=SetupCheckResponse)
def get_setup(
    request: Request,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """Check setup status. Returns 404 once owner exists."""
    if has_owner(conn):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Setup already completed.",
        )
    return SetupCheckResponse(
        has_owner=False,
        is_loopback=_is_loopback_client(request),
    )


@router.post("/setup", response_model=UserResponse)
def post_setup(
    data: SetupRequest,
    request: Request,
    response: Response,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
):
    """First claim endpoint.

    Must come from loopback or carry the one-time setup code. Returns 404 after claim.
    """
    if has_owner(conn):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Setup already completed.",
        )

    is_loop = _is_loopback_client(request)
    data_root = getattr(request.app.state, "data_root", None) if data.adopt_data else None

    try:
        user = claim_owner(
            conn,
            username=data.username,
            password=data.password,
            is_loopback=is_loop,
            setup_code=data.setup_code,
            data_root=data_root,
        )
    except OwnerAlreadyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Setup already completed.",
        ) from exc
    except SetupForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    from food_khata.users.context import UserContext

    context = UserContext(request.app.state.data_root, user["id"]).unlock(data.password)
    # Establish initial session for the new owner
    session_id, csrf_token = rotate_session(conn, None, user["id"])
    request.app.state.unlocked_sessions[session_id] = (user["id"], context.cipher)
    secure = _is_secure_request(request)
    set_session_cookie(response, session_id, secure=secure)
    set_csrf_cookie(response, csrf_token, secure=secure)

    return UserResponse(
        id=user["id"],
        username=user["username"],
        is_owner=True,
        disabled=False,
        created_at=user["created_at"],
    )


@router.get("/status", response_model=OwnerStatusResponse)
def get_owner_status(
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
    _: Annotated[dict[str, Any], Depends(require_owner)],
):
    """Retrieve owner dashboard status: window, join code, user count."""
    win = get_registration_window(conn)
    return OwnerStatusResponse(
        window=WindowStatusResponse(
            is_open=win["is_open"],
            remaining_seconds=win["remaining_seconds"],
            until_closed=win["until_closed"],
        ),
        has_join_code=has_join_code(conn),
        user_count=get_user_count(conn),
        max_users=MAX_USERS,
    )


@router.post("/window", response_model=WindowStatusResponse)
def set_registration_window(
    data: WindowRequest,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
    _: Annotated[dict[str, Any], Depends(require_owner)],
):
    """Open or close the timed registration window (15 min, 1 hour, or until closed)."""
    if data.action == "close":
        close_registration_window(conn)
    else:
        seconds = data.duration_seconds
        if seconds is None and data.duration_minutes is not None:
            seconds = data.duration_minutes * 60
        open_registration_window(conn, seconds)

    win = get_registration_window(conn)
    return WindowStatusResponse(
        is_open=win["is_open"],
        remaining_seconds=win["remaining_seconds"],
        until_closed=win["until_closed"],
    )


@router.post("/join-code/rotate", response_model=RotateJoinCodeResponse)
def post_rotate_join_code(
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
    _: Annotated[dict[str, Any], Depends(require_owner)],
):
    """Rotate the household join code. The new plaintext code is returned once."""
    new_code = rotate_join_code(conn)
    return RotateJoinCodeResponse(join_code=new_code)


@router.get("/users", response_model=list[UserResponse])
def get_users(
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
    _: Annotated[dict[str, Any], Depends(require_owner)],
):
    """List all registered users with status."""
    raw_users = list_users(conn)
    return [
        UserResponse(
            id=u["id"],
            username=u["username"],
            is_owner=u["is_owner"],
            disabled=u["disabled"],
            created_at=u["created_at"],
        )
        for u in raw_users
    ]


@router.post("/users/{user_id}/disable", response_model=UserResponse)
def disable_user_endpoint(
    user_id: str,
    data: DisableUserRequest,
    request: Request,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
    _: Annotated[dict[str, Any], Depends(require_owner)],
):
    """Disable or enable a user. Disabling terminates active sessions and running jobs."""
    try:
        res = set_user_disabled(conn, user_id, data.disabled, data_root=request.app.state.data_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    if data.disabled:
        for session_id, (uid, _) in list(request.app.state.unlocked_sessions.items()):
            if uid == user_id:
                request.app.state.unlocked_sessions.pop(session_id, None)
    user_row = conn.execute("SELECT created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    return UserResponse(
        id=res["id"],
        username=res["username"],
        is_owner=res["is_owner"],
        disabled=res["disabled"],
        created_at=user_row["created_at"] if user_row else "",
    )


@router.post("/users/{user_id}/reset-password", response_model=ResetUserPasswordResponse)
def reset_password_endpoint(
    user_id: str,
    data: ResetUserPasswordRequest,
    request: Request,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
    owner: Annotated[dict[str, Any], Depends(require_owner)],
):
    """Sensitive action: reset user password.

    Requires owner's password again. Wipes provider sessions and cancels jobs.
    """
    data_root = getattr(request.app.state, "data_root", None)
    try:
        res = reset_user_password(
            conn,
            user_id=user_id,
            owner_id=owner["user_id"],
            owner_password=data.owner_password,
            new_password=data.new_password,
            data_root=data_root,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    for session_id, (uid, _) in list(request.app.state.unlocked_sessions.items()):
        if uid == user_id:
            request.app.state.unlocked_sessions.pop(session_id, None)

    return ResetUserPasswordResponse(
        status="ok",
        user_id=res["user_id"],
        temporary_password=res["temporary_password"],
    )


@router.post("/transfer", response_model=StatusResponse)
def transfer_owner_endpoint(
    data: TransferOwnershipRequest,
    conn: Annotated[sqlite3.Connection, Depends(get_auth_db)],
    owner: Annotated[dict[str, Any], Depends(require_owner)],
):
    """Sensitive action: transfer ownership to another user."""
    target = data.to_user_id or data.to_username
    if not target:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Destination user id or username required.",
        )
    try:
        transfer_ownership(
            conn,
            current_owner_id=owner["user_id"],
            target_username_or_id=target,
            owner_password=data.owner_password,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return StatusResponse(status="ok")
