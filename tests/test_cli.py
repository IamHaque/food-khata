"""CLI workflows use fake providers and temporary accounts, never real credentials."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from food_khata.cli import main, normalize_phone, run
from food_khata.contracts import AuthenticationError, KhataError
from food_khata.providers.swiggy import Swiggy
from food_khata.storage import Storage


class CliTests(unittest.TestCase):
    def test_swiggy_missing_customer_id_reaches_login(self):
        saved = Swiggy()
        fresh = Swiggy()
        self.addCleanup(saved.close)
        self.addCleanup(fresh.close)
        account = self.storage.bind("9876543210", "swiggy", "provider-id")
        self.storage.save_session(account["local_id"], "swiggy", saved.dump_session())
        with (
            patch("food_khata.cli.PROVIDERS", {"swiggy": Mock(side_effect=[saved, fresh])}),
            patch.object(saved.client, "call", return_value={"data": {}}),
            patch.object(fresh, "login", return_value="provider-id") as login,
            patch("food_khata.cli.questionary.select"),
            patch("food_khata.cli.questionary.text"),
            patch("food_khata.cli.answer", side_effect=["swiggy", "9876543210"]),
            patch("food_khata.cli.sync", return_value=self.report),
            patch("builtins.print"),
        ):
            self.assertEqual(run(self.storage), 0)
        login.assert_called_once()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.storage = Storage(Path(self.tmp.name))
        self.provider = Mock()
        self.provider.profile.return_value = "provider-id"
        self.provider.login.return_value = "provider-id"
        self.provider.dump_session.return_value = {"access_token": "fake-test-token"}
        self.provider.name = "zomato"
        self.factory = Mock(return_value=self.provider)
        self.report = {
            "complete": True,
            "history_complete": True,
            "details_complete": True,
            "counts": {"orders": 2, "details": 2},
        }

    def saved(self):
        account = self.storage.bind("9876543210", "zomato", "provider-id")
        self.storage.save_session(account["local_id"], "zomato", {"access_token": "fake"})
        return account

    def invoke(self, answers):
        with (
            patch("food_khata.cli.PROVIDERS", {"zomato": self.factory}),
            patch("food_khata.cli.questionary.select"),
            patch("food_khata.cli.questionary.text"),
            patch("food_khata.cli.answer", side_effect=answers),
            patch("food_khata.cli.sync", return_value=self.report) as sync,
            patch("builtins.print"),
        ):
            result = run(self.storage)
        return result, sync

    def test_first_login_and_shared_folder(self):
        result, sync = self.invoke(["zomato", "+91 9876543210"])
        self.assertEqual(result, 0)
        self.provider.login.assert_called_once()
        account = self.storage.accounts("zomato")[0]
        second = self.storage.bind("9876543210", "swiggy", "swiggy-id")
        self.assertEqual(account["local_id"], second["local_id"])
        self.assertEqual(
            sync.call_args.args[1].parent, self.storage.account_path(account["local_id"])
        )
        self.provider.close.assert_called_once()

    def test_reuse_skips_login(self):
        self.saved()
        result, _ = self.invoke(["zomato", "Reuse session"])
        self.assertEqual(result, 0)
        self.provider.login.assert_not_called()

    def test_logout_preserves_archive(self):
        account = self.saved()
        archive = self.storage.account_path(account["local_id"]) / "zomato-history.json"
        archive.write_text("existing archive")
        self.invoke(["zomato", "Logout and log in again", "9876543210"])
        self.provider.logout.assert_called_once()
        self.provider.login.assert_called_once()
        self.assertEqual(archive.read_text(), "existing archive")

    def test_network_failure_preserves_session(self):
        account = self.saved()
        self.provider.profile.side_effect = KhataError("network failure")
        with self.assertRaises(KhataError):
            self.invoke(["zomato"])
        self.assertIsNotNone(self.storage.session(account["local_id"], "zomato"))
        self.provider.login.assert_not_called()

    def test_expired_session_reauthenticates(self):
        self.saved()
        self.provider.profile.side_effect = AuthenticationError("expired")
        self.invoke(["zomato", "9876543210"])
        self.provider.login.assert_called_once()

    def test_phone_validation_and_cancel(self):
        self.assertEqual(normalize_phone("+91 (98765) 43210"), "9876543210")
        with self.assertRaises(KhataError):
            normalize_phone("123")
        with patch("food_khata.cli.run", side_effect=KeyboardInterrupt), patch("builtins.print"):
            self.assertEqual(main([]), 130)

    def test_refresh_session_updates_saved_session(self):
        account = self.saved()
        self.provider.refresh_session.return_value = True
        self.provider.dump_session.return_value = {"access_token": "refreshed-token"}
        result, _ = self.invoke(["zomato", "Refresh session"])
        self.assertEqual(result, 0)
        self.provider.refresh_session.assert_called_once()
        self.assertEqual(
            self.storage.session(account["local_id"], "zomato"),
            {"access_token": "refreshed-token"},
        )

    def test_reauthenticate_session_prompts_login(self):
        self.saved()
        result, _ = self.invoke(["zomato", "Reauthenticate (SMS OTP)", "9876543210"])
        self.assertEqual(result, 0)
        self.provider.login.assert_called_once()

    def test_multi_account_selection(self):
        self.saved()
        a2 = self.storage.bind("9876543211", "zomato", "provider-id-2")
        self.storage.save_session(a2["local_id"], "zomato", {"access_token": "token2"})
        # User picks the second account, then reuses session
        self.provider.profile.return_value = "provider-id-2"
        result, sync_mock = self.invoke(["zomato", a2, "Reuse session"])
        self.assertEqual(result, 0)
        self.assertEqual(
            sync_mock.call_args.args[1].parent, self.storage.account_path(a2["local_id"])
        )

    def test_existing_history_prompts_sync_mode(self):
        account = self.saved()
        path = self.storage.account_path(account["local_id"]) / "zomato-history.json"
        from food_khata.storage import save_json

        save_json(
            path,
            {
                "version": 1,
                "provider": "zomato",
                "provider_id": "provider-id",
                "orders": {"1": {"history": {}}},
                "history_complete": True,
                "details_complete": True,
                "complete": True,
                "lifetime_complete": False,
                "pages": 1,
                "errors": [],
                "counts": {},
            },
        )
        result, sync_mock = self.invoke(
            ["zomato", "Reuse session", "Check and repair missing details"]
        )
        self.assertEqual(result, 0)
        self.assertEqual(sync_mock.call_args.kwargs.get("mode"), "repair")
