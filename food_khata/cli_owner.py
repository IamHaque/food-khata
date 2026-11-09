"""CLI recovery commands for owner management (AC-07)."""

import argparse
import secrets
import sys
from pathlib import Path

from food_khata.auth.passwords import hash_password
from food_khata.auth.sessions import connect_app_db, init_app_db
from food_khata.storage import DEFAULT_DATA_DIR


def run_reset_password(
    app_db_path: Path,
    data_dir: Path,
    username: str | None = None,
    password: str | None = None,
) -> int:
    """Reset a user's password directly in the database when the server is stopped."""
    init_app_db(app_db_path)
    conn = connect_app_db(app_db_path)
    try:
        if username:
            user = conn.execute(
                "SELECT id, username, is_owner FROM users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
        else:
            user = conn.execute(
                "SELECT id, username, is_owner FROM users WHERE is_owner = 1"
            ).fetchone()

        if not user:
            target_desc = f"user '{username}'" if username else "owner account"
            print(f"Error: Could not find {target_desc} in database.", file=sys.stderr)
            return 1

        effective_pw = password or secrets.token_urlsafe(12)
        pw_hash = hash_password(effective_pw)

        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pw_hash, user["id"]))
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        conn.commit()

        # Wipe provider sessions and re-key vault
        try:
            from food_khata.users.context import reset_password as context_reset_password

            context_reset_password(data_dir, user["id"], effective_pw)
        except Exception:
            pass

        print(f"Password reset successfully for user '{user['username']}'.")
        if not password:
            print(f"Temporary password: {effective_pw}")
        return 0
    finally:
        conn.close()


def run_transfer(
    app_db_path: Path,
    to_username: str,
) -> int:
    """Transfer owner role to another existing user when the server is stopped."""
    init_app_db(app_db_path)
    conn = connect_app_db(app_db_path)
    try:
        current_owner = conn.execute(
            "SELECT id, username FROM users WHERE is_owner = 1"
        ).fetchone()
        if not current_owner:
            print("Error: No owner account exists to transfer from.", file=sys.stderr)
            return 1

        target_user = conn.execute(
            "SELECT id, username, is_owner FROM users WHERE username = ? COLLATE NOCASE",
            (to_username,),
        ).fetchone()
        if not target_user:
            print(f"Error: Target user '{to_username}' not found.", file=sys.stderr)
            return 1

        if target_user["id"] == current_owner["id"]:
            print(f"User '{to_username}' is already the owner.")
            return 0

        conn.execute("UPDATE users SET is_owner = 0 WHERE id = ?", (current_owner["id"],))
        conn.execute("UPDATE users SET is_owner = 1 WHERE id = ?", (target_user["id"],))
        conn.commit()

        print(
            f"Ownership transferred successfully from '{current_owner['username']}' "
            f"to '{target_user['username']}'."
        )
        return 0
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for `food-khata owner` subcommands."""
    parser = argparse.ArgumentParser(
        prog="food-khata owner",
        description="Owner setup and recovery actions when server is stopped.",
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # reset-password subcommand
    reset_parser = subparsers.add_parser(
        "reset-password",
        help="Reset owner or user password directly in the database.",
    )
    reset_parser.add_argument(
        "username_pos",
        nargs="?",
        default=None,
        help="Target username (positional, optional; defaults to owner)",
    )
    reset_parser.add_argument(
        "--username",
        dest="username_opt",
        default=None,
        help="Target username (optional; defaults to owner)",
    )
    reset_parser.add_argument(
        "--password",
        default=None,
        help="New password (optional; auto-generates if omitted)",
    )
    reset_parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Data directory (default: {DEFAULT_DATA_DIR})",
    )
    reset_parser.add_argument(
        "--app-db",
        type=Path,
        default=None,
        help="Path to app.db (defaults to data-dir / app.db)",
    )

    # transfer subcommand
    transfer_parser = subparsers.add_parser(
        "transfer",
        help="Transfer ownership to another user directly in the database.",
    )
    transfer_parser.add_argument(
        "to_pos",
        nargs="?",
        default=None,
        help="New owner username (positional)",
    )
    transfer_parser.add_argument(
        "--to",
        dest="to_opt",
        default=None,
        help="New owner username",
    )
    transfer_parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help=f"Data directory (default: {DEFAULT_DATA_DIR})",
    )
    transfer_parser.add_argument(
        "--app-db",
        type=Path,
        default=None,
        help="Path to app.db (defaults to data-dir / app.db)",
    )

    args = parser.parse_args(argv)
    data_dir = args.data_dir.expanduser().resolve()
    app_db = args.app_db or (data_dir / "app.db")

    if args.subcommand == "reset-password":
        username = args.username_opt or args.username_pos
        return run_reset_password(
            app_db_path=app_db,
            data_dir=data_dir,
            username=username,
            password=args.password,
        )
    elif args.subcommand == "transfer":
        to_user = args.to_opt or args.to_pos
        if not to_user:
            print("Error: Target username required for transfer.", file=sys.stderr)
            return 1
        return run_transfer(
            app_db_path=app_db,
            to_username=to_user,
        )

    return 1


if __name__ == "__main__":
    sys.exit(main())
