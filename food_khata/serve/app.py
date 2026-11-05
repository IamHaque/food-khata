"""Local, read-only dashboard API."""

import inspect
import ipaddress
import json
import logging
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from .db import connect_readonly, database_version
from .filters import build_where
from .metrics import compute_metrics, monthly_totals
from .schemas import Bill, Dashboard, FilterOptions, Filters, Health, Leaders, Orders, Slim


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
        response = await call_next(request)
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

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse(
            {
                "error": {
                    "code": "not_found" if exc.status_code == 404 else "request_error",
                    "message": str(exc.detail),
                }
            },
            status_code=exc.status_code,
        )

    @app.exception_handler(sqlite3.OperationalError)
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

    class RetryingConnection:
        def __init__(self, conn):
            self.conn = conn

        def execute(self, sql, params=()):
            for attempt in range(3):
                try:
                    return self.conn.execute(sql, params)
                except sqlite3.OperationalError as exc:
                    if attempt == 2 or not (
                        "locked" in str(exc).lower() or "busy" in str(exc).lower()
                    ):
                        raise
                    time.sleep(0.05 * (attempt + 1))

    def connection():
        conn = connect_readonly(db_path)
        try:
            conn.execute("BEGIN")
            yield RetryingConnection(conn)
        finally:
            conn.close()

    def query_filters(**values) -> Filters:
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
                default=Query(None),
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
        rows = conn.execute(
            f"SELECT DISTINCT a.account_id, a.platform, a.history_complete, a.details_complete FROM archive_imports a WHERE EXISTS (SELECT 1 FROM orders o WHERE o.account_id=a.account_id AND o.platform=a.platform AND {where})",
            params,
        ).fetchall()
        verified = conn.execute(
            f"SELECT AVG(CASE WHEN o.financial_verified=1 THEN 100.0 ELSE 0 END) FROM orders o WHERE {where}",
            params,
        ).fetchone()[0]
        return {
            **metadata(filters),
            "imports": [dict(r) for r in rows],
            "history_complete": all(r[2] for r in rows),
            "details_complete": all(r[3] for r in rows),
            "verified_percent": round(verified, 2) if verified is not None else None,
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
        where, params = build_where(filters)
        base = f" FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN delivery_addresses d ON d.id=o.delivery_address_id WHERE {where}"

        def distinct(column):
            return [
                r[0]
                for r in conn.execute(
                    f"SELECT DISTINCT {column} {base} AND {column} IS NOT NULL ORDER BY 1", params
                )
            ]

        accounts = conn.execute(
            f"SELECT a.id, a.phone, GROUP_CONCAT(DISTINCT o.platform), COUNT(*), MIN(o.order_date), MAX(o.order_date) FROM orders o JOIN accounts a ON a.id=o.account_id WHERE {where} GROUP BY a.id, a.phone ORDER BY a.id",
            params,
        )
        account_rows = [
            {
                "id": r[0],
                "label": "••••" + r[1][-4:],
                "platforms": r[2].split(","),
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
            "accounts": account_rows,
            "platforms": distinct("o.platform"),
            "statuses": distinct("o.order_status"),
            "cities": sorted(set(distinct("r.city") + distinct("d.city"))),
            "localities": distinct("r.locality"),
            "cuisines": distinct("r.cuisine"),
            "payment_methods": distinct("o.payment_method"),
            "date_from": bounds[0],
            "date_to": bounds[1],
            "amount_min": bounds[2],
            "amount_max": bounds[3],
        }

    @app.post("/api/dashboard", response_model=Dashboard)
    def dashboard(filters: Filters, conn: Annotated[object, Depends(connection)]):
        key = (filters.model_dump_json(), database_version(db_path))
        cached = cache.get(key)
        if cached is not None:
            return cached
        h = health(conn, filters)
        result = {
            **metadata(filters),
            "kpis": compute_metrics(conn, filters),
            "charts": {"monthly": monthly_totals(conn, filters)},
            "data_complete": h["history_complete"] and h["details_complete"],
        }
        cache.clear()
        if key[1] == database_version(db_path):
            cache[key] = result
        return result

    select_order = """o.id, '••••' || substr(a.phone,-4) AS account_label, o.platform, o.order_date,
        o.order_status, r.name AS restaurant_name, d.label AS address_label, COALESCE(d.city,r.city) AS city,
        (SELECT GROUP_CONCAT(i.item_name, ', ') FROM order_items i WHERE i.order_id=o.id) AS items_summary,
        o.final_amount_paid, o.item_subtotal, o.total_discount, o.reported_savings, o.delivery_fee,
        o.packaging_fee, o.platform_fee, o.total_tax, o.tip, o.refund_amount, o.financial_verified"""
    joins = " FROM orders o JOIN accounts a ON a.id=o.account_id LEFT JOIN restaurants r ON r.id=o.restaurant_id LEFT JOIN delivery_addresses d ON d.id=o.delivery_address_id "

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
        return {**metadata(filters), "rows": [dict(r) for r in rows]}

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
            "fees": "(COALESCE(o.delivery_fee,0)+COALESCE(o.packaging_fee,0)+COALESCE(o.platform_fee,0))",
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
            "rows": [dict(r) for r in rows],
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

        def parse(value):
            try:
                return json.loads(value) if value else None
            except (ValueError, TypeError):
                return None

        items = conn.execute(
            "SELECT item_name, quantity, unit_price, total_price, is_veg, category FROM order_items WHERE order_id=? ORDER BY id",
            (order_id,),
        )
        return {
            "order": dict(row),
            "items": [dict(r) for r in items],
            "reconciliation_difference": row["reconciliation_difference"],
            "full_address": row["full_address"],
            "source_bill": parse(row["source_bill_json"]),
            "discount_breakdown": parse(row["discount_breakdown_json"]),
        }

    def leaders(conn, filters, kind, minimum, page, page_size, sort, direction):
        if sort not in {"name", "quantity", "amount"} or direction not in {"asc", "desc"}:
            raise HTTPException(422, "Invalid sort parameters.")
        where, params = build_where(filters)
        if kind == "restaurant":
            sql = f"SELECT r.name AS name, COUNT(*) AS quantity, COALESCE(SUM(o.final_amount_paid),0) AS amount FROM orders o JOIN restaurants r ON r.id=o.restaurant_id WHERE {where} GROUP BY r.id HAVING COUNT(*) >= ?"
        else:
            sql = f"SELECT i.item_name AS name, SUM(i.quantity) AS quantity, COALESCE(SUM(i.total_price),0) AS amount FROM orders o JOIN order_items i ON i.order_id=o.id WHERE {where} GROUP BY i.item_name HAVING SUM(i.quantity) >= ?"
        params = [*params, minimum]
        total = conn.execute(f"SELECT COUNT(*) FROM ({sql})", params).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM ({sql}) ORDER BY {sort} {direction}, name ASC LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        )
        return {
            **metadata(filters),
            "rows": [dict(r) for r in rows],
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
    ):
        return leaders(conn, filters, "restaurant", min_orders, page, page_size, sort, direction)

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
