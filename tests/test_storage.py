import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from food_khata.contracts import KhataError
from food_khata.storage import DEFAULT_DATA_DIR, Storage, lock, read_json, save_json


class StorageTests(unittest.TestCase):
    def test_default_data_directory_is_inside_checkout(self):
        self.assertEqual(DEFAULT_DATA_DIR, Path(__file__).resolve().parents[1] / ".food-khata")
        self.assertEqual(Storage().root, DEFAULT_DATA_DIR)

    def test_lock_exclusion_and_release(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".lock"
            with lock(path):
                with self.assertRaises(KhataError):
                    with lock(path):
                        self.fail("Second writer acquired a held lock")
            with lock(path):
                pass

    def test_corrupt_metadata_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            storage = Storage(Path(directory))
            account = storage.bind("9876543210", "zomato", "id")
            path = storage.account_path(account["local_id"]) / "account.json"
            path.write_text("broken", encoding="utf-8")
            with self.assertRaises(KhataError):
                storage.bind("9876543210", "swiggy", "id2")
            self.assertEqual(path.read_text(), "broken")

    def test_bind_sessions_and_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            s = Storage(Path(d))
            a = s.bind("9876543210", "zomato", "z")
            self.assertEqual(a["local_id"], s.bind("9876543210", "swiggy", "s")["local_id"])
            self.assertEqual(s.accounts("zomato"), [])
            s.save_session(a["local_id"], "zomato", {"token": "x"})
            self.assertEqual(len(s.accounts("zomato")), 1)
            with self.assertRaises(KhataError):
                s.bind("9876543210", "zomato", "other")
            with self.assertRaises(KhataError):
                s.account_path("../bad")
            s.remove_session(a["local_id"], "zomato")
            self.assertIsNone(s.session(a["local_id"], "zomato"))

    def test_atomic_failure_preserves_old_file(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "file.json"
            save_json(path, {"old": True})
            with patch("food_khata.storage.os.replace", side_effect=OSError):
                with self.assertRaises(OSError):
                    save_json(path, {"new": True})
            self.assertEqual(read_json(path), {"old": True})


def test_managed_user_rejects_cipherless_checkpoint(tmp_path):
    from food_khata.storage import CredentialsRevoked
    storage = Storage(tmp_path / "users" / "synthetic-user")
    with unittest.TestCase().assertRaises(CredentialsRevoked):
        storage.save_session("00000000-0000-4000-8000-000000000001", "fake", {"token": "synthetic-token"})
    assert not list(storage.root.rglob("*.json"))
