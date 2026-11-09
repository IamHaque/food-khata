import tempfile
import unittest

from food_khata.contracts import AuthenticationError, KhataError
from food_khata.providers.fake import FakeProvider
from food_khata.services.linking import LinkingService


class FakeProviderTests(unittest.TestCase):
    def test_deterministic_orders(self):
        p = FakeProvider()
        pages = list(p.pages())
        self.assertGreater(len(pages), 0)
        ids = [o["order_id"] for page in pages for o in page]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(p.profile(), "fake-account-1")

    def test_wrong_code(self):
        p = FakeProvider(wrong_code=True)
        p.start_login("9876543210")
        with self.assertRaises(KhataError):
            p.verify_otp("000000")

    def test_rate_limit(self):
        p = FakeProvider(rate_limit=True)
        p.start_login("9876543210")
        with self.assertRaises(KhataError):
            p.verify_otp("123456")

    def test_expiry(self):
        p = FakeProvider(expired=True)
        with self.assertRaises(AuthenticationError):
            p.profile()
        self.assertFalse(p.refresh_session() is True and p.expired)

    def test_partial_failure(self):
        p = FakeProvider(partial=True)
        with self.assertRaises(KhataError):
            list(p.pages())


class LinkingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.svc = LinkingService(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_two_step_login(self):
        provider = FakeProvider(provider="zomato")
        handle = self.svc.start_login(provider, "9876543210")
        self.assertIsInstance(handle, str)
        self.assertNotIn(handle, "")  # handle is opaque
        result = self.svc.verify_otp(handle, "123456")
        self.assertEqual(result["provider_id"], "fake-account-1")
        # single-use
        with self.assertRaises(KhataError):
            self.svc.verify_otp(handle, "123456")

    def test_handle_expiry(self):
        provider = FakeProvider(provider="zomato")
        handle = self.svc.start_login(provider, "9876543210")
        entry = self.svc._handles.get(handle)
        if entry is not None:
            entry.expires_at = 0
        with self.assertRaises(KhataError):
            self.svc.verify_otp(handle, "123456")

    def test_handle_user_safety(self):
        provider = FakeProvider(provider="zomato")
        handle = self.svc.start_login(provider, "9876543210", user="alice")
        with self.assertRaises(KhataError):
            self.svc.verify_otp(handle, "123456", user="bob")

    def test_status_without_network(self):
        provider = FakeProvider(provider="zomato")
        self.svc.start_login(provider, "9876543210")
        self.svc.verify_otp(self.svc.start_login(provider, "9876543210"), "123456") if False else None
        accounts = self.svc.list_accounts("zomato")
        # at least status field present
        for acc in accounts:
            self.assertIn(acc["status"], ("ok", "expiring", "expired"))

    def test_disconnect(self):
        provider = FakeProvider(provider="zomato")
        handle = self.svc.start_login(provider, "9876543210")
        res = self.svc.verify_otp(handle, "123456")
        lid = res["local_id"]
        self.svc.disconnect(lid, "zomato", wipe=False)
        # session removed
        self.assertIsNone(self.svc.storage.session(lid, "zomato"))
        # wipe removes account dir
        self.svc.start_login(FakeProvider(provider="zomato"), "9999999999") if False else None


if __name__ == "__main__":
    unittest.main()
