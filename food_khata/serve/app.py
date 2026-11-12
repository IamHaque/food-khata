"""Local, read-only dashboard API."""

import inspect
import json
import logging
import math
import sqlite3
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from food_khata.auth import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    SESSION_COOKIE_NAME,
    STATE_CHANGING_METHODS,
    connect_app_db,
    create_test_user_session,
    delete_session,
    get_session,
    init_app_db,
    validate_csrf_token,
)
from food_khata.logging import request_id, user_id
from food_khata.maintenance import Maintenance
from food_khata.migrations import MIGRATIONS, run_migrations
from food_khata.providers.base import fake_enabled
from food_khata.users.context import user_root

from .behavior import behavior
from .charts import kpi_history, overview, remaining
from .db import connect_readonly, database_version, resolve_user_database
from .filters import NEEDS_REVIEW_SQL, build_where
from .food import food
from .metrics import FEES_SQL, compute_metrics, monthly_totals
from .places import places
from .routes_accounts import router as accounts_router
from .routes_auth import router as auth_router
from .routes_owner import router as owner_router
from .routes_sync import router as sync_router
from .schemas import (
    Bill,
    Dashboard,
    DashboardRequest,
    FilterOptions,
    Filters,
    Health,
    Leaders,
    Orders,
    Slim,
)
from .security import MAX_BODY_BYTES, SECURITY_HEADERS, get_allowed_hosts, validate_host_and_origin
from .spending import spending


def create_app(
    db_path: Path | str,
    dev: bool = False,
    dist_path: Path | str | None = None,
    app_db_path: Path | str | None = None,
    data_root: Path | str | None = None,
    lan: bool = False,
    allow_hosts: list[str] | set[str] | None = None,
    is_https: bool = False,
    legacy_single_db: bool = False,
    provider_concurrency: dict[str, int] | None = None,
    trusted_proxy: str | None = None,
    behind_https_proxy: bool = False,
) -> FastAPI:
    if fake_enabled():
        logging.getLogger(__name__).warning(
            "FOOD_KHATA_ENABLE_FAKE_PROVIDER is on: fake provider enabled (testing only)"
        )

    @asynccontextmanager
    async def lifespan(app):
        app.state.job_runner.start()
        maintenance = app.state.maintenance = Maintenance(app.state.app_db_path, on_run=app.state.prune_unlocked_sessions)
        maintenance.start()
        try:
            yield
        finally:
            maintenance.stop()
            app.state.job_runner.stop(wait=True)
            app.state.unlocked_sessions.clear()

    app = FastAPI(title="Food Khata API", lifespan=lifespan)
    db_path = Path(db_path)
    explicit_data_root = data_root is not None
    if explicit_data_root:
        resolved_data_root = Path(data_root).expanduser().resolve()
        legacy_db: Path | None = None
    elif db_path.exists() and db_path.is_dir():
        # A directory is the per-user data root; no client-controlled selection.
        resolved_data_root = db_path.expanduser().resolve()
        legacy_db = None
    else:
        # Backwards-compatible single-database mode used by the existing CLI
        # and tests until the legacy root is adopted by its owner.
        resolved_data_root = (db_path.parent or Path(".")).expanduser().resolve()
        legacy_db = db_path
    allow_legacy_fallback = legacy_single_db and not explicit_data_root and legacy_db is not None
    dist = (
        Path(dist_path)
        if dist_path is not None
        else Path(__file__).resolve().parents[2] / "dashboard-ui" / "dist"
    )
    if app_db_path is not None:
        resolved_app_db = Path(app_db_path)
    elif explicit_data_root:
        resolved_app_db = resolved_data_root / "app.db"
    else:
        p = Path(db_path)
        if str(db_path) != ":memory:" and not str(db_path).startswith("file:"):
            resolved_app_db = p.parent / "app.db"
        else:
            resolved_app_db = Path("app.db")
    app.state.app_db_path = resolved_app_db
    app.state.data_root = resolved_data_root
    app.state.legacy_db_path = legacy_db
    app.state.lan = lan
    app.state.allow_hosts = get_allowed_hosts(allow_hosts, lan=lan)
    app.state.is_https = is_https or behind_https_proxy
    app.state.trusted_proxy = trusted_proxy
    app.state.unlocked_sessions = {}

    def prune_unlocked_sessions() -> None:
        """Drop in-memory keys whose session row is gone (expired, logged out, removed)."""
        conn = connect_app_db(app.state.app_db_path)
        try:
            live = {row[0] for row in conn.execute("SELECT id FROM sessions")}
        finally:
            conn.close()
        for session_id in list(app.state.unlocked_sessions):
            if session_id not in live:
                app.state.unlocked_sessions.pop(session_id, None)

    app.state.prune_unlocked_sessions = prune_unlocked_sessions
    init_app_db(resolved_app_db)
    run_migrations(resolved_app_db, resolved_data_root)
    from food_khata.users.context import reconcile_trash

    reconcile_trash(resolved_data_root, resolved_app_db)
    # Vault keys live only in memory, so a session that survived a restart can never be unlocked (DEC-P2).
    _conn = connect_app_db(resolved_app_db)
    try:
        _conn.execute("DELETE FROM sessions")
        _conn.commit()
    finally:
        _conn.close()
    from food_khata.jobs import JobControl, JobRunner

    job_runner = JobRunner(
        resolved_app_db, data_root=resolved_data_root, provider_concurrency=provider_concurrency
    )
    job_runner.mark_interrupted_on_startup()
    app.state.job_runner = job_runner
    app.state.job_control = JobControl(
        resolved_app_db, data_root=resolved_data_root, runner=job_runner
    )
    SLIM_LIMIT = 5000
    build_gate = threading.BoundedSemaphore(2)
    SECTIONS = ("overview", "spending", "food", "behavior", "places")
    cache = app.state.dashboard_cache = {}
    cache_lock = threading.Lock()

    def secured(response):
        for name, value in SECURITY_HEADERS.items():
            response.headers[name] = value
        if app.state.is_https:
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        return response

    @app.middleware("http")
    async def safety(request: Request, call_next):
        security_error = validate_host_and_origin(
            request,
            allowed_hosts=app.state.allow_hosts,
            lan=app.state.lan,
        )
        if security_error is not None:
            return security_error
        # Request bodies are small JSON; refuse anything over 64 KB before it is read.
        if request.method in {"POST", "PUT", "PATCH"}:
            length = request.headers.get("content-length")
            if length is None and "chunked" in request.headers.get("transfer-encoding", "").lower():
                # Never buffer a body of unknown size; our own client always sends Content-Length.
                return JSONResponse(
                    {"error": {"code": "length_required", "message": "Content-Length is required."}}, status_code=411
                )
            if (length or "").isdigit() and int(length) > MAX_BODY_BYTES:
                return JSONResponse(
                    {"error": {"code": "payload_too_large", "message": "Request body is too large."}}, status_code=413
                )
        started = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:
            # Response-validation exceptions may contain private row values.
            return JSONResponse(
                {"error": {"code": "internal_error", "message": "Internal server error."}},
                status_code=500,
            )
        if dev and time.monotonic() - started > 0.15:
            logging.getLogger(__name__).info(
                "Slow request %s %.0fms",
                request.scope.get("route").name if request.scope.get("route") else "unknown",
                (time.monotonic() - started) * 1000,
            )
        return response

    UNAUTHENTICATED_ROUTES = frozenset(
        {
            "/health",
            "/health/ready",
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/setup-status",
            "/api/auth/csrf",
            "/api/owner/setup",
        }
    )

    @app.middleware("http")
    async def auth_and_csrf(request: Request, call_next):
        raw_path = request.url.path
        path = raw_path.rstrip("/") if raw_path != "/" else "/"
        is_api = path.startswith("/api/") or path == "/api"

        session_id = request.cookies.get(SESSION_COOKIE_NAME)  # the cookie only, never a header
        session = None
        if session_id:
            conn = connect_app_db(app.state.app_db_path)
            try:
                session = get_session(conn, session_id)
                # A session without its in-memory key is half open: close it so /me and /accounts agree.
                key = app.state.unlocked_sessions.get(session_id)
                if session is not None and (key is None or key[0] != session["user_id"]):
                    delete_session(conn, session_id)
                    session = None
            finally:
                conn.close()

        request.state.session = session
        request.state.user = session
        user_id.set(session["user_id"] if session else "-")  # the id for log lines, never the username
        if session_id and session is None:
            app.state.unlocked_sessions.pop(session_id, None)

        is_unauthenticated = (path in UNAUTHENTICATED_ROUTES) or (not is_api)
        if not is_unauthenticated and session is None:
            code = "SESSION_EXPIRED" if session_id else "unauthorized"
            return JSONResponse(
                {"error": {"code": code, "message": "Authentication required."}},
                status_code=401,
            )

        if is_api and request.method in STATE_CHANGING_METHODS:
            csrf_header = request.headers.get(CSRF_HEADER_NAME)
            expected_csrf = None
            if session:
                expected_csrf = session.get("csrf_token")
            if not expected_csrf:
                expected_csrf = request.cookies.get(CSRF_COOKIE_NAME)

            if not validate_csrf_token(csrf_header, expected_csrf):
                return JSONResponse(
                    {"error": {"code": "forbidden", "message": "Invalid or missing CSRF token."}},
                    status_code=403,
                )

        return await call_next(request)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        # Registered last, so it wraps every response, including 401, 403 and 413 from the other middlewares.
        rid = request_id.set(uuid.uuid4().hex[:12])
        try:
            response = secured(await call_next(request))
            response.headers["X-Request-ID"] = request_id.get()
            return response
        finally:
            request_id.reset(rid)

    @app.exception_handler(RequestValidationError)
    @app.exception_handler(ValidationError)
    async def invalid(request, exc):
        return JSONResponse(
            {"error": {"code": "validation_error", "message": "Invalid request parameters."}},
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        codes = {
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            409: "conflict",
            422: "validation_error",
            429: "too_many_requests",
            503: "database_not_found",
        }
        code = getattr(exc, "code", None)
        message = str(exc.detail)
        if isinstance(exc.detail, dict):
            code = exc.detail.get("code", code)
            message = exc.detail.get("message", message)
        if not code:
            code = codes.get(exc.status_code, "request_error")
        error = {"code": code, "message": message}
        if isinstance(exc.detail, dict) and exc.detail.get("job_id"):
            error["job_id"] = exc.detail["job_id"]  # ACCOUNT_BUSY: the job already running
        return JSONResponse(
            {"error": error},
            status_code=exc.status_code,
            headers=dict(exc.headers) if exc.headers else None,
        )

    @app.exception_handler(sqlite3.DatabaseError)
    async def db_error(request, exc):
        # SQLite error text names no user data; logging it keeps a locked or damaged database from being silent.
        logging.getLogger(__name__).error("database error on %s: %s: %s", request.url.path, type(exc).__name__, exc)
        return JSONResponse(
            {
                "error": {
                    "code": "database_unavailable",
                    "message": "Database is unavailable; please retry.",
                }
            },
            status_code=503,
        )

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        return JSONResponse(
            {"error": {"code": "internal_error", "message": "Internal server error."}},
            status_code=500,
        )

    def retry(action):
        for attempt in range(3):
            try:
                return action()
            except sqlite3.OperationalError as exc:
                if attempt == 2 or not any(word in str(exc).lower() for word in ("locked", "busy")):
                    raise
                time.sleep(0.05 * (attempt + 1))

    class RetryingConnection:
        def __init__(self, conn):
            self.conn = conn
            self.metrics_memo = {}

        def execute(self, sql, params=()):
            return retry(lambda: self.conn.execute(sql, params))

    def connection(request: Request):
        # Each request selects only its own authenticated user's database; the
        # client never supplies a path or a user id.
        session = getattr(request.state, "user", None)
        if session is None:
            raise HTTPException(401, "Authentication required.")
        db_file = resolve_user_database(
            resolved_data_root,
            session["user_id"],
            legacy_db,
            allow_legacy_fallback=allow_legacy_fallback,
        )
        # Each request gets its own connection; never share one across requests.
        if not db_file.is_file():
            raise HTTPException(503, "Database not found.")
        version = database_version(db_file)

        def begin():
            conn = connect_readonly(db_file)
            try:
                conn.execute("BEGIN")
                return conn
            except Exception:
                conn.close()
                raise

        try:
            conn = retry(begin)
        except sqlite3.OperationalError as exc:
            # The file may disappear between the check above and the connect.
            if "unable to open database file" in str(exc).lower():
                raise HTTPException(503, "Database not found.") from None
            raise
        try:
            wrapped = RetryingConnection(conn)
            wrapped.version = version
            wrapped.db_path = db_file
            yield wrapped
        finally:
            conn.close()

    def own_accounts(request: Request, filters: Filters) -> Filters:
        # Account ids must be the caller's own; per-user databases already hide other users' rows.
        if filters.account_ids and resolved_data_root is not None and not allow_legacy_fallback:
            own = {
                p.name
                for p in (
                    user_root(resolved_data_root, request.state.user["user_id"]) / "accounts"
                ).glob("*")
            }
            if not set(filters.account_ids) <= own:
                raise HTTPException(
                    422, detail={"code": "INVALID_ACCOUNT", "message": "Unknown account."}
                )
        return filters

    def query_filters(request: Request, **values) -> Filters:
        if values.get("statuses") == [""]:
            values["statuses"] = []
        try:
            return own_accounts(
                request,
                Filters.model_validate(
                    {key: value for key, value in values.items() if value is not None}
                ),
            )
        except ValidationError:
            raise HTTPException(422, "Invalid request parameters.") from None

    query_filters.__signature__ = inspect.Signature(
        parameters=[
            inspect.Parameter("request", inspect.Parameter.KEYWORD_ONLY, annotation=Request),
            *(
                inspect.Parameter(
                    name,
                    inspect.Parameter.KEYWORD_ONLY,
                    default=Query(
                        None,
                        description="Repeat values; statuses= selects all statuses."
                        if name == "statuses"
                        else None,
                    ),
                    annotation=field.annotation,
                )
                for name, field in Filters.model_fields.items()
            ),
        ],
        return_annotation=Filters,
    )

    def metadata(filters):
        return {"filters_applied": filters, "generated_at": datetime.now(UTC)}

    def health(conn, filters):
        where, params = build_where(filters)
        clauses, scope = [], []
        for column, values in (
            ("account_id", filters.account_ids),
            ("platform", filters.platforms),
        ):
            if values:
                clauses.append(f"a.{column} IN ({','.join('?' for _ in values)})")
                scope.extend(values)
        rows = conn.execute(
            "SELECT a.account_id, a.platform, a.history_complete, a.details_complete FROM archive_imports a WHERE "
            + (" AND ".join(clauses) or "1=1"),
            scope,
        ).fetchall()
        base = f" FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN delivery_addresses d ON d.id=o.delivery_address_id WHERE {where}"
        columns = {
            "user_rating": "o.user_rating",
            "payment_method": "o.payment_method",
            "discount_breakdown_json": "o.discount_breakdown_json",
            "source_bill_json": "o.source_bill_json",
            "restaurant_cuisine": "r.cuisine",
            "restaurant_locality": "r.locality",
            "restaurant_city": "r.city",
            "address_latitude": "d.latitude",
            "address_longitude": "d.longitude",
        }
        # One pass over orders for every order-level figure (was 12 separate scans).
        agg = conn.execute(
            "SELECT AVG(CASE WHEN o.financial_verified=1 THEN 100.0 ELSE 0 END), "
            + "".join(f"AVG(CASE WHEN {c} IS NULL THEN 100.0 ELSE 0 END), " for c in columns.values())
            + "COUNT(*) - COUNT(DISTINCT o.account_id || '|' || o.platform || '|' || o.platform_order_id), "
            "COUNT(CASE WHEN ABS(o.reconciliation_difference)>1 THEN 1 END), "
            f"COUNT(CASE WHEN {NEEDS_REVIEW_SQL} THEN 1 END)" + base,
            params,
        ).fetchone()
        verified, duplicates, anomalies, needs_review = agg[0], agg[-3], agg[-2], agg[-1]
        null_rates = {n: (round(v, 2) if v is not None else None) for n, v in zip(columns, agg[1:-3], strict=True)}
        quarantined = conn.execute(
            "SELECT COUNT(*) FROM quarantine a WHERE " + (" AND ".join(clauses) or "1=1"), scope
        ).fetchone()[0]
        item_rates = conn.execute(
            f"SELECT AVG(CASE WHEN i.is_veg IS NULL THEN 100.0 ELSE 0 END), AVG(CASE WHEN i.category IS NULL THEN 100.0 ELSE 0 END) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE {where}",
            params,
        ).fetchone()
        for name, value in zip(("is_veg", "category"), item_rates, strict=True):
            null_rates[name] = round(value, 2) if value is not None else None
        return {
            **metadata(filters),
            "imports": [rounded(r) for r in rows],
            "history_complete": all(r[2] for r in rows),
            "details_complete": all(r[3] for r in rows),
            "verified_percent": round(verified, 2) if verified is not None else None,
            "null_rates": null_rates,
            "duplicate_orders": duplicates,
            "reconciliation_anomalies": anomalies,
            "needs_review_orders": needs_review,
            "quarantined_orders": quarantined,
            "note": "Food orders only; Instamart/Dineout excluded; API-visible history only. Saved details are snapshots; later refunds or status changes may be missing.",
        }

    @app.get("/api/meta/data-health", response_model=Health)
    def data_health(
        filters: Annotated[Filters, Depends(query_filters)],
        conn: Annotated[object, Depends(connection)],
    ):
        return health(conn, filters)

    @app.get("/api/meta/filters", response_model=FilterOptions)
    def options(
        filters: Annotated[Filters, Depends(query_filters)],
        conn: Annotated[object, Depends(connection)],
    ):
        where, params = build_where(Filters(account_ids=filters.account_ids, statuses=[]))
        base = f" FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN delivery_addresses d ON d.id=o.delivery_address_id WHERE {where}"

        def distinct(column):
            return [
                r[0]
                for r in conn.execute(
                    f"SELECT DISTINCT {column} {base} AND {column} IS NOT NULL ORDER BY 1", params
                )
            ]

        accounts = conn.execute(
            "SELECT a.id, a.phone, GROUP_CONCAT(DISTINCT o.platform), COUNT(o.id), MIN(o.order_date), MAX(o.order_date) FROM accounts a LEFT JOIN orders o ON a.id=o.account_id GROUP BY a.id, a.phone ORDER BY a.id"
        )
        account_rows = [
            {
                "id": r[0],
                "label": "Unknown" if r[1] == "Unknown" else "••••" + r[1][-4:],
                "platforms": r[2].split(",") if r[2] else [],
                "order_count": r[3],
                "date_from": r[4],
                "date_to": r[5],
            }
            for r in accounts
        ]
        bounds = conn.execute(
            f"SELECT MIN(o.order_date), MAX(o.order_date), MIN(o.final_amount_paid), MAX(o.final_amount_paid) {base}",
            params,
        ).fetchone()
        return {
            **metadata(filters),
            "accounts": [
                a for a in account_rows if not filters.account_ids or a["id"] in filters.account_ids
            ],
            "all_accounts": account_rows,
            "restaurants": [
                dict(r)
                for r in conn.execute(
                    f"SELECT DISTINCT r.id, r.name {base} AND r.id IS NOT NULL ORDER BY r.name, r.id",
                    params,
                )
            ],
            "platforms": distinct("o.platform"),
            "statuses": distinct("o.order_status"),
            "cities": sorted(set(distinct("r.city") + distinct("d.city"))),
            "localities": distinct("r.locality"),
            "cuisines": distinct("r.cuisine"),
            "payment_methods": distinct("o.payment_method"),
            "date_from": bounds[0],
            "date_to": bounds[1],
            "amount_min": round(bounds[2], 2) if bounds[2] is not None else None,
            "amount_max": round(bounds[3], 2) if bounds[3] is not None else None,
        }

    @app.post("/api/dashboard", response_model=Dashboard)
    def dashboard(
        request: Request,
        body: DashboardRequest,
        conn: Annotated[object, Depends(connection)],
    ):
        sections = set(body.sections or SECTIONS)
        filters = Filters.model_validate(body.model_dump(exclude={"sections"}))
        own_accounts(request, filters)
        # An unreachable account id gives the empty shape of a section without scanning orders.
        nothing = filters.model_copy(update={"account_ids": ["\0none"]})

        def part(name, fn):
            return fn(conn, filters if name in sections else nothing)

        user_id = request.state.user["user_id"]
        database = conn.db_path
        for attempt in range(3):
            key = (user_id, body.model_dump_json(), conn.version)
            with cache_lock:
                cached = cache.get(key)
            if cached is not None and key[2] == database_version(database):
                return cached
            # Cold builds are CPU bound and sqlite3 threads fight over the GIL: two at a time finish sooner than six.
            with build_gate:
                h = health(conn, filters)
                kpis = compute_metrics(conn, filters)
                try:
                    json.dumps(kpis, allow_nan=False)
                except ValueError:
                    raise HTTPException(
                        422, "Dashboard data contains invalid numeric values."
                    ) from None
                calendar, comparison = overview(conn, filters if "overview" in sections else nothing)
                result = {
                    **metadata(filters),
                    "comparison": comparison,
                    "kpis": kpis,
                    "charts": {
                        "kpi_history": part("overview", kpi_history),
                        "food": part("food", food),
                        "spending": part("spending", spending),
                        "behavior": part("behavior", behavior),
                        "places": part("places", places),
                        "monthly": part("overview", monthly_totals),
                        "calendar": calendar,
                        **part("overview", remaining),
                    },
                    "data_complete": h["history_complete"] and h["details_complete"],
                }
            try:
                json.dumps(result, allow_nan=False, default=str)
            except ValueError:
                raise HTTPException(
                    422, "Dashboard data contains invalid numeric values."
                ) from None
            with cache_lock:
                if key[2] == database_version(database):
                    for stale in [k for k in cache if k[0] == user_id and k[2] != key[2]]:
                        cache.pop(stale, None)  # an older database version can never be served again
                    cache.pop(key, None)
                    cache[key] = result  # most recent last
                    mine = [k for k in cache if k[0] == user_id]
                    for old in mine[:-8] + [k for k in cache if k[0] != user_id][: max(0, len(cache) - 64)]:
                        cache.pop(old, None)
                    return result
            if attempt < 2:
                conn.execute("ROLLBACK")
                conn.metrics_memo.clear()  # a new snapshot: earlier totals are stale
                conn.version = database_version(database)
                conn.execute("BEGIN")
        raise sqlite3.OperationalError("database busy")

    select_order = f"""{FEES_SQL} AS fees, o.account_id, o.platform_order_id, o.order_timestamp, o.order_time, o.payment_method, o.user_rating, o.food_discount, o.delivery_fee_discount, o.other_charges, o.source_complete, o.reconciliation_difference, o.id, CASE WHEN a.phone = 'Unknown' THEN 'Unknown' ELSE '••••' || substr(a.phone,-4) END AS account_label, o.platform, o.order_date,
        o.order_status, r.name AS restaurant_name, d.label AS address_label, COALESCE(d.city,r.city) AS city,
        (SELECT GROUP_CONCAT(i.item_name, ', ') FROM order_items i WHERE i.order_id=o.id) AS items_summary,
        o.final_amount_paid, o.item_subtotal, o.total_discount, o.reported_savings, o.delivery_fee,
        o.packaging_fee, o.platform_fee, o.total_tax, o.tip, o.refund_amount, o.financial_verified"""
    joins = " FROM orders o JOIN accounts a ON a.id=o.account_id LEFT JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN delivery_addresses d ON d.id=o.delivery_address_id "

    money_fields = {
        "final_amount_paid",
        "item_subtotal",
        "total_discount",
        "reported_savings",
        "delivery_fee",
        "delivery_fee_discount",
        "food_discount",
        "other_charges",
        "packaging_fee",
        "platform_fee",
        "total_tax",
        "tip",
        "refund_amount",
        "reconciliation_difference",
        "unit_price",
        "total_price",
        "amount",
    }

    def rounded(row):
        return {
            k: round(v, 2) if k in money_fields and v is not None else v
            for k, v in dict(row).items()
        }

    @app.get("/api/orders/slim", response_model=Slim)
    def slim(
        filters: Annotated[Filters, Depends(query_filters)],
        conn: Annotated[object, Depends(connection)],
    ):
        where, params = build_where(filters)
        rows = conn.execute(
            f"SELECT o.id, o.order_date, o.platform, o.order_status, o.final_amount_paid FROM orders o WHERE {where} ORDER BY o.order_date DESC, o.id LIMIT {SLIM_LIMIT + 1}",
            params,
        ).fetchall()
        return {**metadata(filters), "rows": [rounded(r) for r in rows[:SLIM_LIMIT]], "truncated": len(rows) > SLIM_LIMIT}

    @app.get("/api/orders", response_model=Orders)
    def orders(
        filters: Annotated[Filters, Depends(query_filters)],
        conn: Annotated[object, Depends(connection)],
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        sort: str = "date",
        direction: str = "desc",
    ):
        sorts = {
            "date": "o.order_date",
            "restaurant": "r.name",
            "platform": "o.platform",
            "status": "o.order_status",
            "discount": "o.total_discount",
            "fees": f"({FEES_SQL})",
            "amount": "o.final_amount_paid",
        }
        if sort not in sorts or direction not in {"asc", "desc"}:
            raise HTTPException(422, "Invalid sort parameters.")
        where, params = build_where(filters)
        count, amount = conn.execute(
            f"SELECT COUNT(*), COALESCE(SUM(o.final_amount_paid),0) FROM orders o WHERE {where}",
            params,
        ).fetchone()
        rows = conn.execute(
            f"SELECT {select_order} {joins} WHERE {where} ORDER BY {sorts[sort]} {direction}, o.id ASC LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        )
        return {
            **metadata(filters),
            "rows": [rounded(r) for r in rows],
            "total": count,
            "page": page,
            "page_size": page_size,
            "filtered_total_amount": round(amount, 2),
        }

    @app.get("/api/orders/{order_id}/bill", response_model=Bill)
    def bill(
        order_id: str,
        filters: Annotated[Filters, Depends(query_filters)],
        conn: Annotated[object, Depends(connection)],
    ):
        where, params = build_where(filters)
        row = conn.execute(
            f"SELECT {select_order}, o.reconciliation_difference, o.source_bill_json, o.discount_breakdown_json, d.full_address {joins} WHERE o.id=? AND {where}",
            [order_id, *params],
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Order not found.")

        def finite_float(value):
            number = float(value)
            if not math.isfinite(number):
                raise ValueError("non-finite JSON number")
            return number

        def parse(value):
            try:
                return (
                    json.loads(
                        value,
                        parse_float=finite_float,
                        parse_constant=lambda _: (_ for _ in ()).throw(ValueError()),
                    )
                    if value
                    else None
                )
            except (ValueError, TypeError):
                return None

        items = conn.execute(
            "SELECT item_name, quantity, unit_price, total_price, is_veg, category FROM order_items WHERE order_id=? ORDER BY id",
            (order_id,),
        )
        discounts = parse(row["discount_breakdown_json"])
        difference = row["reconciliation_difference"]
        status = "unknown" if difference is None else "matches" if abs(difference) <= 1 else "off"
        return {
            "discount_items": [
                {"label": label, "amount": round(amount, 2)}
                for label, amount in (discounts.items() if isinstance(discounts, dict) else [])
                if isinstance(label, str) and type(amount) in (int, float) and math.isfinite(amount)
            ],
            "reconciliation_status": status,
            "reconciliation_label": "Unknown"
            if status == "unknown"
            else "Matches"
            if status == "matches"
            else f"Off by INR {abs(difference):.2f}",
            "order": rounded(row),
            "items": [rounded(r) for r in items],
            "reconciliation_difference": round(row["reconciliation_difference"], 2)
            if row["reconciliation_difference"] is not None
            else None,
            "full_address": row["full_address"],
            "source_bill": parse(row["source_bill_json"]),
            "discount_breakdown": parse(row["discount_breakdown_json"]),
        }

    def leaders(conn, filters, kind, minimum, page, page_size, sort, direction, grouping="merged"):
        if sort not in {"name", "quantity", "amount"} or direction not in {"asc", "desc"}:
            raise HTTPException(422, "Invalid sort parameters.")
        where, params = build_where(filters)
        if kind == "restaurant":
            key = (
                "r.id"
                if grouping == "listing"
                else "lower(trim(r.name)) || '|' || lower(trim(coalesce(r.locality,'')))"
            )
            sql = f"SELECT {key} AS key, MIN(r.name) AS name, COUNT(*) AS quantity, COALESCE(SUM(o.final_amount_paid),0) AS amount FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE {where} GROUP BY {key} HAVING COUNT(*) >= ?"
        else:
            sql = f"SELECT i.item_name AS key, i.item_name AS name, SUM(i.quantity) AS quantity, COALESCE(SUM(i.total_price),0) AS amount FROM orders o JOIN order_items i ON i.order_id=o.id WHERE {where} GROUP BY i.item_name HAVING SUM(i.quantity) >= ?"
        total = conn.execute(f"SELECT COUNT(*) FROM ({sql})", [*params, minimum]).fetchone()[0]
        rows = [
            rounded(r)
            for r in conn.execute(
                f"SELECT * FROM ({sql}) ORDER BY {sort} {direction}, key ASC LIMIT ? OFFSET ?",
                [*params, minimum, page_size, (page - 1) * page_size],
            )
        ]
        if kind == "item" and rows:
            trends: dict[str, list] = {row["key"]: [] for row in rows}
            marks = ",".join("?" for _ in rows)
            for r in conn.execute(
                f"SELECT i.item_name AS item, substr(o.order_date,1,7) AS month, SUM(i.quantity) AS quantity, SUM(i.total_price)*1.0/NULLIF(SUM(CASE WHEN i.total_price IS NOT NULL THEN i.quantity END),0) AS unit_price FROM orders o JOIN order_items i ON i.order_id=o.id WHERE {where} AND i.item_name IN ({marks}) GROUP BY i.item_name, month ORDER BY month",
                [*params, *trends],
            ):
                item = dict(r)
                trends[item.pop("item")].append(rounded(item))
            for row in rows:
                row["price_trend"] = trends[row["key"]]
        return {
            **metadata(filters),
            "rows": rows,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @app.get("/api/restaurants", response_model=Leaders)
    def restaurants(
        filters: Annotated[Filters, Depends(query_filters)],
        conn: Annotated[object, Depends(connection)],
        min_orders: int = Query(1, ge=1),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        sort: str = "amount",
        direction: str = "desc",
        grouping: Literal["merged", "listing"] = Query(
            "merged",
            description="merged key is normalized name|locality; listing key is restaurant id.",
        ),
    ):
        return leaders(
            conn, filters, "restaurant", min_orders, page, page_size, sort, direction, grouping
        )

    @app.get("/api/items", response_model=Leaders)
    def items(
        filters: Annotated[Filters, Depends(query_filters)],
        conn: Annotated[object, Depends(connection)],
        min_qty: int = Query(1, ge=1),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        sort: str = "amount",
        direction: str = "desc",
    ):
        return leaders(conn, filters, "item", min_qty, page, page_size, sort, direction)

    @app.get("/health/ready", tags=["system"])
    def ready():
        """Readiness: app.db opens, migrations are current and the maintenance thread is alive. No counts or names."""
        try:
            conn = connect_app_db(app.state.app_db_path)
            try:
                done = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
            finally:
                conn.close()
            maintenance = getattr(app.state, "maintenance", None)
            ok = {m[0] for m in MIGRATIONS if not m[2]} <= done and maintenance is not None and maintenance.thread.is_alive()
        except Exception:
            ok = False
        return JSONResponse({"status": "ready" if ok else "not_ready"}, status_code=200 if ok else 503)

    @app.get("/health", tags=["system"])
    def health_check():
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(owner_router)
    app.include_router(accounts_router)
    app.include_router(sync_router)

    @app.get("/{path:path}", include_in_schema=False)
    def static(path: str):
        if path.startswith("api/") or path == "api" or path.startswith("data/") or path == "data":
            raise HTTPException(404, "Not found.")
        root = dist.resolve()
        target = (root / path).resolve()
        if (
            (root not in target.parents and target != root)
            or target == root / "data"
            or root / "data" in target.parents
        ):
            raise HTTPException(404, "Not found.")
        if target.is_file():
            allowed = (
                target == root / "index.html"
                or (
                    root / "assets" in target.parents
                    and target.suffix.lower()
                    in {
                        ".js",
                        ".css",
                        ".svg",
                        ".png",
                        ".jpg",
                        ".jpeg",
                        ".webp",
                        ".ico",
                        ".woff",
                        ".woff2",
                        ".ttf",
                    }
                )
                or (target.parent == root and target.name in {"favicon.ico", "vite.svg", "theme-init.js"})
            )
            if not allowed:
                raise HTTPException(404, "Not found.")
            return FileResponse(target)
        if target.suffix:
            raise HTTPException(404, "Not found.")
        index = root / "index.html"
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(404, "UI build missing; run the dashboard UI separately.")

    return app


def authenticate_client(
    client: Any,
    username: str = "testuser",
    is_owner: bool = True,
) -> tuple[str, str]:
    """Helper for test suites to attach an authenticated session and CSRF headers to a TestClient."""
    app_db_path = getattr(client.app.state, "app_db_path", None)
    if not app_db_path:
        raise ValueError("Client app has no app_db_path configured")
    session_id, csrf_token = create_test_user_session(app_db_path, username, is_owner)
    from food_khata.auth import get_session
    from food_khata.users.context import UserContext

    conn = connect_app_db(app_db_path)
    try:
        user_id = get_session(conn, session_id)["user_id"]
    finally:
        conn.close()
    context = UserContext(client.app.state.data_root, user_id)
    if client.app.state.legacy_db_path is not None and not (context.data_root / "users").exists():
        import secrets

        from food_khata.users.crypto import DataCipher

        cipher = DataCipher(secrets.token_bytes(32))
    else:
        cipher = context.unlock("test-password").cipher
    client.app.state.unlocked_sessions[session_id] = (user_id, cipher)
    client.cookies.set(SESSION_COOKIE_NAME, session_id)
    client.cookies.set(CSRF_COOKIE_NAME, csrf_token)
    client.headers[CSRF_HEADER_NAME] = csrf_token
    return session_id, csrf_token
