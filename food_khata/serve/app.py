"""Local, read-only dashboard API."""

import inspect
import ipaddress
import json
import logging
import math
import sqlite3
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .behavior import behavior
from .charts import kpi_history, overview, remaining
from .db import connect_readonly, database_version
from .filters import build_where
from .food import food
from .metrics import FEES_SQL, compute_metrics, monthly_totals
from .places import places
from .schemas import Bill, Dashboard, FilterOptions, Filters, Health, Leaders, Orders, Slim
from .spending import spending


def create_app(
    db_path: Path | str, dev: bool = False, dist_path: Path | str | None = None
) -> FastAPI:
    app = FastAPI(title="Food Khata API")
    db_path = Path(db_path)
    dist = (
        Path(dist_path)
        if dist_path is not None
        else Path(__file__).resolve().parents[2] / "dashboard-ui" / "dist"
    )
    cache = {}
    cache_lock = threading.Lock()

    @app.middleware("http")
    async def safety(request: Request, call_next):
        try:
            host = urlsplit("//" + request.headers.get("host", "")).hostname
            local_host = host == "localhost" or bool(
                host and ipaddress.ip_address(host).is_loopback
            )
        except ValueError:
            local_host = False
        origin = request.headers.get("origin")
        if not local_host or (
            origin
            and origin
            not in {
                f"http://{request.headers.get('host')}",
                f"https://{request.headers.get('host')}",
            }
        ):
            return JSONResponse(
                {"error": {"code": "forbidden", "message": "Local requests only."}}, status_code=403
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

    @app.exception_handler(RequestValidationError)
    @app.exception_handler(ValidationError)
    async def invalid(request, exc):
        return JSONResponse(
            {"error": {"code": "validation_error", "message": "Invalid request parameters."}},
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        codes = {404: "not_found", 503: "database_not_found"}
        return JSONResponse(
            {
                "error": {
                    "code": codes.get(exc.status_code, "request_error"),
                    "message": str(exc.detail),
                }
            },
            status_code=exc.status_code,
        )

    @app.exception_handler(sqlite3.DatabaseError)
    async def db_error(request, exc):
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

        def execute(self, sql, params=()):
            return retry(lambda: self.conn.execute(sql, params))

    def connection():
        # Each request gets its own connection; never share one across requests.
        if not db_path.is_file():
            raise HTTPException(503, "Database not found.")
        version = database_version(db_path)

        def begin():
            conn = connect_readonly(db_path)
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
            yield wrapped
        finally:
            conn.close()

    def query_filters(**values) -> Filters:
        if values.get("statuses") == [""]:
            values["statuses"] = []
        try:
            return Filters.model_validate(
                {key: value for key, value in values.items() if value is not None}
            )
        except ValidationError:
            raise HTTPException(422, "Invalid request parameters.") from None

    query_filters.__signature__ = inspect.Signature(
        parameters=[
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
        verified = conn.execute(
            f"SELECT AVG(CASE WHEN o.financial_verified=1 THEN 100.0 ELSE 0 END) {base}", params
        ).fetchone()[0]
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
        null_rates = {}
        for name, column in columns.items():
            value = conn.execute(
                f"SELECT AVG(CASE WHEN {column} IS NULL THEN 100.0 ELSE 0 END) {base}", params
            ).fetchone()[0]
            null_rates[name] = round(value, 2) if value is not None else None
        for name in ("is_veg", "category"):
            value = conn.execute(
                f"SELECT AVG(CASE WHEN i.{name} IS NULL THEN 100.0 ELSE 0 END) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE {where}",
                params,
            ).fetchone()[0]
            null_rates[name] = round(value, 2) if value is not None else None
        duplicates = conn.execute(
            f"SELECT COALESCE(SUM(n-1),0) FROM (SELECT COUNT(*) n FROM orders o WHERE {where} GROUP BY o.account_id,o.platform,o.platform_order_id HAVING COUNT(*)>1)",
            params,
        ).fetchone()[0]
        anomalies = conn.execute(
            f"SELECT COUNT(*) FROM orders o WHERE {where} AND ABS(o.reconciliation_difference)>1",
            params,
        ).fetchone()[0]
        return {
            **metadata(filters),
            "imports": [rounded(r) for r in rows],
            "history_complete": all(r[2] for r in rows),
            "details_complete": all(r[3] for r in rows),
            "verified_percent": round(verified, 2) if verified is not None else None,
            "null_rates": null_rates,
            "duplicate_orders": duplicates,
            "reconciliation_anomalies": anomalies,
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
                "label": "••••" + r[1][-4:],
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
    def dashboard(filters: Filters, conn: Annotated[object, Depends(connection)]):
        for attempt in range(3):
            key = (filters.model_dump_json(), conn.version)
            with cache_lock:
                cached = cache.get(key)
            if cached is not None and key[1] == database_version(db_path):
                return cached
            h = health(conn, filters)
            kpis = compute_metrics(conn, filters)
            try:
                json.dumps(kpis, allow_nan=False)
            except ValueError:
                raise HTTPException(
                    422, "Dashboard data contains invalid numeric values."
                ) from None
            calendar, comparison = overview(conn, filters)
            result = {
                **metadata(filters),
                "comparison": comparison,
                "kpis": kpis,
                "charts": {
                    "kpi_history": kpi_history(conn, filters),
                    "food": food(conn, filters),
                    "spending": spending(conn, filters),
                    "behavior": behavior(conn, filters),
                    "places": places(conn, filters),
                    "monthly": monthly_totals(conn, filters),
                    "calendar": calendar,
                    **remaining(conn, filters),
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
                if key[1] == database_version(db_path):
                    cache.clear()
                    cache[key] = result
                    return result
            if attempt < 2:
                conn.execute("ROLLBACK")
                conn.version = database_version(db_path)
                conn.execute("BEGIN")
        raise sqlite3.OperationalError("database busy")

    select_order = f"""{FEES_SQL} AS fees, o.account_id, o.platform_order_id, o.order_timestamp, o.order_time, o.payment_method, o.user_rating, o.food_discount, o.delivery_fee_discount, o.other_charges, o.source_complete, o.reconciliation_difference, o.id, '••••' || substr(a.phone,-4) AS account_label, o.platform, o.order_date,
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
            f"SELECT o.id, o.order_date, o.platform, o.order_status, o.final_amount_paid FROM orders o WHERE {where} ORDER BY o.order_date DESC, o.id",
            params,
        )
        return {**metadata(filters), "rows": [rounded(r) for r in rows]}

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
        if kind == "item":
            for row in rows:
                trend = conn.execute(
                    f"SELECT substr(o.order_date,1,7) AS month, SUM(i.quantity) AS quantity, SUM(i.total_price)*1.0/NULLIF(SUM(CASE WHEN i.total_price IS NOT NULL THEN i.quantity END),0) AS unit_price FROM orders o JOIN order_items i ON i.order_id=o.id WHERE {where} AND i.item_name=? GROUP BY month ORDER BY month",
                    [*params, row["key"]],
                )
                row["price_trend"] = [rounded(r) for r in trend]
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
                or (target.parent == root and target.name in {"favicon.ico", "vite.svg"})
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
