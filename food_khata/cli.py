"""One interactive entry point for login and order synchronization."""

import argparse
import re
import sys
from contextlib import ExitStack
from pathlib import Path
from typing import Any

import questionary

from .contracts import AuthenticationError, KhataError, Provider
from .dashboard import export_dashboard_data
from .db import AnalyticsDB
from .providers.swiggy import Swiggy
from .providers.zomato import Zomato
from .services.sync import sync
from .storage import DEFAULT_DATA_DIR, Storage, lock, read_json

PROVIDERS = {"zomato": Zomato, "swiggy": Swiggy}


def answer(prompt: Any) -> Any:
    value = prompt.ask()
    if value is None or value == "":
        raise KeyboardInterrupt
    return value


def normalize_phone(value: str) -> str:
    phone = re.sub(r"[\s()-]", "", value)
    if phone.startswith("+91"):
        phone = phone[3:]
    if not re.fullmatch(r"[6-9][0-9]{9}", phone):
        raise KhataError("Enter a 10-digit Indian mobile number, optionally prefixed with +91.")
    return phone


def phone_valid(value: str) -> bool | str:
    try:
        normalize_phone(value)
    except KhataError as error:
        return str(error)
    return True


def run(
    storage: Storage,
    prompt_dashboard: bool = True,
    db_path: Path | None = None,
) -> int:
    name = answer(questionary.select("Choose a provider:", choices=["zomato", "swiggy"]))
    factory = PROVIDERS[name]
    accounts = storage.accounts(name, include_unauthenticated=True)
    account = None
    if accounts:
        choices = [
            questionary.Choice(
                f"Account …{entry['phone'][-4:]} ({entry['local_id']})"
                + (" [Active session]" if entry.get("has_session") else " [Unauthenticated]"),
                value=entry,
            )
            for entry in accounts
        ]
        chosen = answer(
            questionary.select(
                "Choose an account:",
                choices=[
                    *choices,
                    questionary.Choice("Log in to another account (add new)", value="new"),
                ],
            )
        )
        if chosen == "new":
            account = None
        elif isinstance(chosen, dict):
            account = chosen
        else:
            matches = [a for a in accounts if a["local_id"] == chosen]
            account = matches[0] if matches else None

    with ExitStack() as stack:
        provider: Provider | None = None
        if account:
            stack.enter_context(lock(storage.account_path(account["local_id"]) / ".account.lock"))
            saved = storage.session(account["local_id"], name)
            if saved is not None:
                provider = factory(saved)
                stack.callback(provider.close)
                try:
                    if provider.profile() != account["providers"][name]:
                        raise KhataError(
                            "Saved session belongs to a different account; archive left untouched."
                        )
                except AuthenticationError:
                    print("Saved session expired. Log in again to sync.")
                    provider = None
                else:
                    choice = answer(
                        questionary.select(
                            f"{name.title()} account {account['providers'][name]} (…{account['phone'][-4:]}):",
                            choices=[
                                "Reuse session",
                                "Refresh session",
                                "Reauthenticate (SMS OTP)",
                                "Switch account / Log in to another",
                                "Logout and log in again",
                            ],
                        )
                    )
                    if choice == "Refresh session":
                        if provider.refresh_session():
                            storage.save_session(account["local_id"], name, provider.dump_session())
                            print("Session refreshed successfully.")
                        else:
                            print("Session refresh failed or not supported. Reauthenticate.")
                            provider = None
                    elif choice == "Reauthenticate (SMS OTP)":
                        provider = None
                    elif choice == "Switch account / Log in to another":
                        account = None
                        provider = None
                    elif choice == "Logout and log in again":
                        provider.logout()
                        storage.remove_session(account["local_id"], name)
                        if name == "swiggy":
                            print(
                                "Swiggy session removed locally; remote session revocation is unavailable."
                            )
                        provider = None

        if provider is None:
            # Release any previous account lock before prompting or logging in
            stack.close()
            phone = normalize_phone(answer(questionary.text("Phone number:", validate=phone_valid)))
            provider = factory()
            stack.callback(provider.close)
            identity = provider.login(phone, lambda: answer(questionary.password("Enter SMS OTP:")))
            account = storage.bind(phone, name, identity)
            stack.enter_context(lock(storage.account_path(account["local_id"]) / ".account.lock"))

        assert account is not None
        path = storage.account_path(account["local_id"]) / f"{name}-history.json"

        def checkpoint() -> None:
            storage.save_session(account["local_id"], name, provider.dump_session())

        checkpoint()

        sync_mode = "incremental"
        if path.exists():
            try:
                data = read_json(path)
                has_saved_orders = isinstance(data, dict) and bool(data.get("orders"))
            except Exception:
                has_saved_orders = False
            if has_saved_orders:
                choices = [
                    "Sync new orders (incremental)",
                    "Check and repair missing details",
                    "Full history scan",
                ]
                selected = answer(
                    questionary.select(
                        "History archive found. Choose sync mode:",
                        choices=choices,
                    )
                )
                if selected in ("Check and repair missing details", "repair"):
                    sync_mode = "repair"
                elif selected in ("Full history scan", "full"):
                    sync_mode = "full"
                else:
                    sync_mode = "incremental"

        print(
            "Syncing history in "
            + (
                "incremental mode (new orders only)"
                if sync_mode == "incremental"
                else "repair mode (missing details only)"
                if sync_mode == "repair"
                else "full mode"
            )
            + "..."
        )
        report = sync(
            provider,
            path,
            account["providers"][name],
            checkpoint_session=checkpoint,
            mode=sync_mode,
        )
        counts = report["counts"]
        print(f"Orders: {counts['orders']}; details saved: {counts['details']}")
        print(
            f"New orders: {counts.get('new_orders', 0)}; details downloaded: {counts.get('details_downloaded', 0)}"
        )
        print(
            f"History: {'complete' if report['history_complete'] else 'incomplete'}; "
            f"details: {'complete' if report['details_complete'] else 'incomplete'}"
        )
        print(f"Saved to: {path}")
        if not report["complete"]:
            for error in report["errors"]:
                print(f"Sync error: {error}")
            return 1

        # Ingest retrieved order history into local SQLite database
        db = AnalyticsDB(db_path or (storage.root / "food_analytics.db"))
        ingest_counts = db.ingest_account(storage, account["local_id"])
        print(
            f"Local DB updated: {ingest_counts['total']} orders recorded "
            f"({ingest_counts['swiggy']} Swiggy, {ingest_counts['zomato']} Zomato)."
        )
        if ingest_counts.get("quarantined", 0) > 0:
            print(f"Quarantined: {ingest_counts['quarantined']} malformed order(s).")

        if prompt_dashboard:
            should_open = answer(
                questionary.confirm("Export data for the React dashboard?", default=True)
            )
            if should_open:
                dash_path = export_dashboard_data(db.path)
                print(f"Dashboard data exported: {dash_path}")
                print("Load this JSON file in the React app (dashboard-ui: npm run dev).")

        return 0


def main(argv: list[str] | None = None) -> int:
    raw_args = list(sys.argv[1:] if argv is None else argv)
    if raw_args and raw_args[0] == "owner":
        from .cli_owner import main as owner_main

        return owner_main(raw_args[1:])

    parser = argparse.ArgumentParser(
        description="Log in, sync, and visualize Zomato or Swiggy food order history."
    )
    parser.add_argument(
        "action",
        nargs="?",
        choices=["sync", "ingest", "export", "dashboard", "serve", "owner"],
        default="sync",
        help="Action: sync, ingest (update local DB), export, or owner recovery",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Private data directory (default: {DEFAULT_DATA_DIR})",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Custom SQLite analytics database path",
    )
    parser.add_argument(
        "--no-dashboard",
        action="store_true",
        help="Skip post-sync dashboard prompt",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Compatibility flag; JSON export never launches a browser",
    )
    parser.add_argument("--output", type=Path, default=None, help="Dashboard JSON export path")
    parser.add_argument("--host", default=None, help="Host address for serve")
    parser.add_argument("--port", type=int, default=8765, help="Port for serve")
    parser.add_argument("--dev", action="store_true", help="Log slow serve requests")
    parser.add_argument("--lan", action="store_true", help="Allow LAN access (binds 0.0.0.0)")
    parser.add_argument(
        "--allow-host",
        dest="allow_hosts",
        action="append",
        default=[],
        help="Allowed host header (can be repeated)",
    )
    parser.add_argument(
        "--tls-cert",
        type=Path,
        default=None,
        help="Path to TLS certificate for HTTPS",
    )
    parser.add_argument(
        "--tls-key",
        type=Path,
        default=None,
        help="Path to TLS private key for HTTPS",
    )
    args = parser.parse_args(argv)
    if args.action == "serve":
        if not 1 <= args.port <= 65535:
            print("Port must be between 1 and 65535.")
            return 1
        from .serve.cli import serve

        host = args.host if args.host is not None else ("0.0.0.0" if args.lan else "127.0.0.1")
        db_file = args.db_path or (args.data_dir.expanduser().resolve() / "food_analytics.db")
        if args.lan or args.allow_hosts or args.tls_cert or args.tls_key:
            return serve(
                host,
                args.port,
                db_file,
                args.dev,
                lan=args.lan,
                allow_hosts=args.allow_hosts,
                tls_cert=args.tls_cert,
                tls_key=args.tls_key,
                data_root=args.data_dir.expanduser().resolve(),
            )
        return serve(
            host,
            args.port,
            db_file,
            args.dev,
        )
    storage = Storage(args.data_dir.expanduser().resolve())
    db_file = args.db_path or (storage.root / "food_analytics.db")

    try:
        if args.action in {"dashboard", "export"}:
            dash_path = export_dashboard_data(db_file, args.output)
            print(f"Dashboard data exported: {dash_path}")
            print("Load this JSON file in the React app (dashboard-ui: npm run dev).")
            return 0
        elif args.action == "ingest":
            db = AnalyticsDB(db_file)
            counts = db.ingest_all(storage)
            print(
                f"Ingestion complete: {counts['total']} orders recorded across "
                f"{counts['accounts']} accounts ({counts['swiggy']} Swiggy, {counts['zomato']} Zomato)."
            )
            if counts.get("quarantined", 0) > 0:
                print(f"Quarantined: {counts['quarantined']} malformed order(s).")
            return 0
        else:
            return run(
                storage,
                prompt_dashboard=not args.no_dashboard,
                db_path=args.db_path,
            )
    except KeyboardInterrupt:
        print("Cancelled. Completed downloads remain saved; run again to resume.")
        return 130
    except (KhataError, OSError) as error:
        # OSError text can contain paths, but never provider response bodies or credentials.
        print(f"Error: {error}")
        return 1
    except Exception:
        print(
            "Unexpected failure. Saved checkpoints are preserved; run again or report this failure."
        )
        return 1


if __name__ == "__main__":
    import sys

    sys.exit(main())
