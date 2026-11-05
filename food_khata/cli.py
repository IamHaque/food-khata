"""One interactive entry point for login and order synchronization."""

import argparse
import re
from contextlib import ExitStack
from pathlib import Path
from typing import Any

import questionary

from .contracts import AuthenticationError, KhataError, Provider
from .providers.swiggy import Swiggy
from .providers.zomato import Zomato
from .storage import DEFAULT_DATA_DIR, Storage, lock, read_json
from .sync import sync

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


def run(storage: Storage) -> int:
    name = answer(questionary.select("Choose a provider:", choices=["zomato", "swiggy"]))
    factory = PROVIDERS[name]
    accounts = storage.accounts(name, include_unauthenticated=True)
    account = None
    if len(accounts) == 1:
        account = accounts[0]
    elif len(accounts) > 1:
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
                choices=[*choices, questionary.Choice("Log in to another account", value="new")],
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
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Log in and sync Zomato or Swiggy food order history."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Private data directory (default: {DEFAULT_DATA_DIR})",
    )
    args = parser.parse_args(argv)
    try:
        return run(Storage(args.data_dir.expanduser().resolve()))
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
