import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from food_khata.contracts import KhataError
from food_khata.storage import read_json, save_json
from food_khata.sync import MODE_LABELS, sync


class Fake:
    name = "zomato"

    def __init__(self):
        self.ids = ["1"]
        self.calls = []
        self.fail = False
        self.identity = "id"
        self.page_size = None
        self.interrupt_after_pages = None

    def profile(self):
        return self.identity

    def pages(self):
        size = self.page_size or max(len(self.ids), 1)
        for number, start in enumerate(range(0, len(self.ids), size)):
            if self.interrupt_after_pages is not None and number >= self.interrupt_after_pages:
                raise KhataError("history unavailable")
            chunk = self.ids[start : start + size]
            yield [{"order_id": i, "history": {"id": i}} for i in chunk]

    def valid_details(self, order_id, value):
        return isinstance(value, dict) and value.get("id") == order_id

    def details(self, order_id):
        self.calls.append(order_id)
        if self.fail:
            raise KeyboardInterrupt()
        return {"id": order_id}


class SyncTests(unittest.TestCase):
    def test_phone_identity_is_not_written_to_archive_and_legacy_resumes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            provider = Fake()
            provider.identity = "9876543210"
            sync(provider, path, provider.identity)
            archive = read_json(path)
            self.assertNotIn(provider.identity, path.read_text())
            archive["provider_id"] = provider.identity
            save_json(path, archive)
            sync(provider, path, provider.identity)
            self.assertNotIn(provider.identity, path.read_text())

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

    def test_sync_repair_mode_skips_pages_and_repairs_details(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.ids = ["10", "20"]
            sync(f, p, "id", lambda _: None)
            archive = read_json(p)
            archive["orders"]["10"]["details"] = None
            save_json(p, archive)

            # Repair mode should not call pages()
            f.calls.clear()
            f.pages = Mock(side_effect=AssertionError("pages should not be called in repair mode"))
            report = sync(f, p, "id", lambda _: None, mode="repair")
            self.assertEqual(f.calls, ["10"])
            self.assertTrue(report["complete"])
            self.assertTrue(report["details_complete"])
            self.assertEqual(report["counts"]["details_downloaded"], 1)

    def test_new_sync_continues_past_known_orders(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.ids = ["1"]
            sync(f, p, "id", lambda _: None)

            # New batch has order 2 (new), order 1 (existing) and then order 0
            # (older). A New sync must keep scanning instead of stopping early.
            page_calls = []

            def mock_pages():
                page_calls.append(1)
                yield [
                    {"order_id": "2", "history": {"id": "2"}},
                    {"order_id": "1", "history": {"id": "1"}},
                ]
                page_calls.append(2)
                yield [{"order_id": "0", "history": {"id": "0"}}]

            f.pages = mock_pages
            f.calls.clear()
            report = sync(f, p, "id", lambda _: None, mode="incremental")
            self.assertEqual(page_calls, [1, 2])
            self.assertEqual(sorted(f.calls), ["0", "2"])
            self.assertIn("2", report["orders"])
            self.assertIn("0", report["orders"])
            self.assertTrue(report["complete"])

    def test_interrupted_new_sync_does_not_mark_history_complete(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.ids = ["5", "4", "3", "2", "1", "0"]
            f.page_size = 2

            # First sync stops after page 2; older pages 3 remain unknown.
            f.interrupt_after_pages = 2
            report = sync(f, p, "id", lambda _: None)
            self.assertFalse(report["history_complete"])
            self.assertEqual(set(report["orders"]), {"5", "4", "3", "2"})

            # The next New sync hits only known orders and is interrupted again.
            # It must not treat that as completion, and must reach page 2.
            page_calls = []
            original_pages = f.pages

            def tracking_pages():
                for page in original_pages():
                    page_calls.append(page)
                    yield page

            f.pages = tracking_pages
            report = sync(f, p, "id", lambda _: None, mode="incremental")
            self.assertEqual(len(page_calls), 2)
            self.assertFalse(report["history_complete"])
            self.assertNotIn("1", report["orders"])
            self.assertNotIn("0", report["orders"])

            # A final uninterrupted run fetches the older pages.
            f.pages = original_pages
            f.interrupt_after_pages = None
            report = sync(f, p, "id", lambda _: None, mode="incremental")
            self.assertTrue(report["history_complete"])
            self.assertEqual(set(report["orders"]), {"0", "1", "2", "3", "4", "5"})
            self.assertTrue(report["complete"])

    def test_lifetime_complete_requires_a_completed_full_scan(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.ids = ["2", "1"]
            f.page_size = 1
            f.interrupt_after_pages = 1
            report = sync(f, p, "id", lambda _: None, mode="full")
            self.assertFalse(report["history_complete"])
            self.assertFalse(report["lifetime_complete"])

            f.interrupt_after_pages = None
            report = sync(f, p, "id", lambda _: None, mode="full")
            self.assertTrue(report["history_complete"])
            self.assertTrue(report["lifetime_complete"])

            # A later New sync keeps the lifetime fact without re-proving it.
            report = sync(f, p, "id", lambda _: None, mode="incremental")
            self.assertTrue(report["lifetime_complete"])

    def test_checkpoints_are_batched(self):
        # Benchmark on FakeProvider (Windows, 1000 orders / 50 pages / 1000
        # missing details): before batching 1053 atomic writes and ~17.5 s;
        # after batching 33 atomic writes and well under a second.
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.ids = [str(i) for i in range(1000)]
            f.page_size = 20
            writes = []
            real_save_json = save_json

            def counting_save_json(path, value):
                writes.append(path)
                real_save_json(path, value)

            session = Mock()
            with patch("food_khata.sync.save_json", side_effect=counting_save_json):
                report = sync(
                    f,
                    p,
                    "id",
                    lambda _: None,
                    checkpoint_session=session,
                    mode="full",
                )
            self.assertTrue(report["complete"])
            self.assertEqual(report["counts"]["orders"], 1000)
            self.assertEqual(report["counts"]["details"], 1000)
            # 1053 writes before; batched checkpoints stay near 33.
            self.assertLess(len(writes), 50)
            self.assertLessEqual(session.call_count, 40)
            self.assertEqual(read_json(p)["complete"], True)

    def test_new_sync_repairs_missing_details(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.ids = ["1", "2"]
            sync(f, p, "id", lambda _: None)
            archive = read_json(p)
            archive["orders"]["1"]["details"] = None
            archive["orders"]["2"]["details"] = {}
            save_json(p, archive)

            f.ids = ["3", "2", "1"]
            f.calls.clear()
            report = sync(f, p, "id", lambda _: None, mode="incremental")
            self.assertEqual(sorted(f.calls), ["1", "2", "3"])
            self.assertEqual(report["counts"]["details_downloaded"], 3)
            self.assertTrue(report["details_complete"])
            self.assertIn("also repairs", MODE_LABELS["incremental"])
            self.assertIn("only", MODE_LABELS["repair"])

    def test_resume_stores_no_duplicates(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.json"
            f = Fake()
            f.ids = ["3", "2", "1"]
            f.page_size = 1
            f.interrupt_after_pages = 1
            report = sync(f, p, "id", lambda _: None)
            self.assertEqual(set(report["orders"]), {"3"})

            f.interrupt_after_pages = None
            report = sync(f, p, "id", lambda _: None)
            self.assertEqual(sorted(report["orders"]), ["1", "2", "3"])
            self.assertEqual(len(report["orders"]), len(set(report["orders"])))
            self.assertEqual(report["counts"]["orders"], 3)
            self.assertEqual(report["counts"]["new_orders"], 2)
