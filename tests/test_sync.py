import tempfile
import unittest
from pathlib import Path

from food_khata.contracts import KhataError
from food_khata.storage import read_json, save_json
from food_khata.sync import sync


class Fake:
    name = "zomato"

    def __init__(self):
        self.ids = ["1"]
        self.calls = []
        self.fail = False
        self.identity = "id"

    def profile(self):
        return self.identity

    def pages(self):
        yield [{"order_id": i, "history": {"id": i}} for i in self.ids]

    def valid_details(self, order_id, value):
        return isinstance(value, dict) and value.get("id") == order_id

    def details(self, order_id):
        self.calls.append(order_id)
        if self.fail:
            raise KeyboardInterrupt()
        return {"id": order_id}


class SyncTests(unittest.TestCase):
    def test_unchanged_run_and_old_missing_details(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            provider = Fake()
            provider.ids = ["1", "2"]
            sync(provider, path, "id", lambda _: None)
            provider.calls.clear()
            report = sync(provider, path, "id", lambda _: None)
            self.assertEqual(provider.calls, [])
            self.assertEqual(report["counts"]["new_orders"], 0)
            report["orders"]["1"]["details"] = None
            save_json(path, report)
            provider.ids = ["2"]
            report = sync(provider, path, "id", lambda _: None)
            self.assertEqual(provider.calls, ["1"])
            self.assertEqual(len(report["orders"]), 2)

    def test_incomplete_discovery_resumes_without_losing_saved_orders(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            provider = Fake()

            def partial():
                yield [{"order_id": "1", "history": {}}]
                raise KhataError("history unavailable")

            provider.pages = partial
            report = sync(provider, path, "id", lambda _: None)
            self.assertFalse(report["history_complete"])
            self.assertEqual(provider.calls, [])
            provider.pages = lambda: iter([[{"order_id": "2", "history": {}}]])
            report = sync(provider, path, "id", lambda _: None)
            self.assertTrue(report["complete"])
            self.assertEqual(provider.calls, ["1", "2"])

    def test_resume_and_incremental(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.fail = True
            with self.assertRaises(KeyboardInterrupt):
                sync(f, p, "id", lambda _: None)
            self.assertFalse(read_json(p)["complete"])
            f.fail = False
            sync(f, p, "id", lambda _: None)
            f.calls.clear()
            f.ids.append("2")
            result = sync(f, p, "id", lambda _: None)
            self.assertEqual(f.calls, ["2"])
            self.assertTrue(result["complete"])
            self.assertFalse(result["lifetime_complete"])

    def test_identity_and_corruption_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            p.write_text("bad")
            f = Fake()
            with self.assertRaises(KhataError):
                sync(f, p, "id")
            self.assertEqual(p.read_text(), "bad")
            f.identity = "other"
            with self.assertRaises(KhataError):
                sync(f, p, "id")
            self.assertEqual(p.read_text(), "bad")
