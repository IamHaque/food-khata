"""Incremental, resumable history synchronization."""

from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .contracts import KhataError, Provider
from .storage import read_json, save_json


def sync(
    provider: Provider,
    path: Path,
    provider_id: str,
    progress: Callable[[str], None] = print,
    checkpoint_session: Callable[[], None] = lambda: None,
    mode: str = "incremental",
) -> dict[str, Any]:
    if mode not in ("incremental", "repair", "full"):
        raise KhataError(f"Invalid sync mode: {mode}")
    if provider.profile() != provider_id:
        raise KhataError("Provider account identity mismatch")
    if path.exists():
        archive = read_json(path)
        if (
            not isinstance(archive, dict)
            or type(archive.get("version")) is not int
            or archive["version"] != 1
            or archive.get("provider") != provider.name
            or archive.get("provider_id") != provider_id
            or not isinstance(archive.get("orders"), dict)
            or any(
                not isinstance(k, str)
                or not k
                or not isinstance(v, dict)
                or "history" not in v
                or not isinstance(v["history"], dict)
                for k, v in archive["orders"].items()
            )
            or any(
                not isinstance(archive.get(k), bool)
                for k in ("history_complete", "details_complete", "complete", "lifetime_complete")
            )
            or not isinstance(archive.get("pages"), int)
            or isinstance(archive.get("pages"), bool)
            or not isinstance(archive.get("errors"), list)
            or not isinstance(archive.get("counts"), dict)
        ):
            raise KhataError("Invalid or mismatched archive")
    else:
        archive = {
            "version": 1,
            "provider": provider.name,
            "provider_id": provider_id,
            "orders": {},
            "history_complete": False,
            "details_complete": False,
            "complete": False,
            "lifetime_complete": False,
            "pages": 0,
            "errors": [],
            "counts": {},
        }
    prior_history_complete = archive.get("history_complete", False)
    prior_orders = set(archive["orders"].keys())
    archive.update(
        history_complete=False,
        details_complete=False,
        complete=False,
        lifetime_complete=False,
        pages=0,
        errors=[],
        last_sync=datetime.now(UTC).isoformat(),
    )

    new_orders = 0
    new_order_ids: set[str] = set()
    details_downloaded = 0

    def persist() -> None:
        archive["counts"] = {
            "orders": len(archive["orders"]),
            "new_orders": new_orders,
            "details_downloaded": details_downloaded,
            "details": sum(
                provider.valid_details(k, v.get("details")) for k, v in archive["orders"].items()
            ),
        }
        save_json(path, archive)

    persist()
    try:
        if mode != "repair":
            for page in provider.pages():
                if not isinstance(page, list):
                    raise KhataError("Invalid history page")
                for record in page:
                    if (
                        not isinstance(record, dict)
                        or not isinstance(record.get("order_id"), str)
                        or not record["order_id"]
                        or not isinstance(record.get("history"), dict)
                    ):
                        raise KhataError("Invalid history record")
                hit_existing = False
                for record in page:
                    oid = record["order_id"]
                    if oid not in archive["orders"]:
                        archive["orders"][oid] = {"history": record["history"]}
                        new_order_ids.add(oid)
                        new_orders += 1
                    elif mode == "incremental" and prior_orders:
                        hit_existing = True
                archive["pages"] += 1
                persist()
                checkpoint_session()
                progress(f"Fetched page {archive['pages']}")
                if hit_existing:
                    # In incremental mode, reaching previously saved orders completes discovery
                    progress("Reached previously saved orders; incremental discovery complete.")
                    archive["history_complete"] = True
                    break
            else:
                archive["history_complete"] = True
            persist()
        else:
            # In repair mode, preserve previous history completeness without fetching pages
            archive["history_complete"] = prior_history_complete

        # Check all orders for missing/invalid details
        for order_id in sorted(archive["orders"].keys()):
            order = archive["orders"][order_id]
            if not provider.valid_details(order_id, order.get("details")):
                details = provider.details(order_id)
                if not provider.valid_details(order_id, details):
                    raise KhataError("Invalid order details")
                order["details"] = details
                details_downloaded += 1
                persist()
                checkpoint_session()
                progress(f"Saved details for order {order_id}")

        if provider.profile() != provider_id:
            raise KhataError("Provider account identity mismatch")
        checkpoint_session()
        all_details_valid = all(
            provider.valid_details(k, v.get("details")) for k, v in archive["orders"].items()
        )
        archive["details_complete"] = all_details_valid
        archive["complete"] = archive["history_complete"] and archive["details_complete"]
        persist()
    except BaseException as exc:
        archive["complete"] = False
        archive["errors"].append(
            str(exc) if isinstance(exc, KhataError) else "Sync interrupted or failed"
        )
        persist()
        if not isinstance(exc, KhataError):
            raise
    return archive
