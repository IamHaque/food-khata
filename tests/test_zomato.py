import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests

from food_khata.contracts import AuthenticationError, KhataError
from food_khata.providers.http import request_json
from food_khata.providers.zomato import ACCOUNTS, Zomato, order_id
from food_khata.sync import sync


class ZomatoTests(unittest.TestCase):
    def test_order_card_identifier_when_navigation_is_absent(self):
        page = {
            "status": "success",
            "has_more": False,
            "results": [
                {"order_history_snippet_type_2": {"identifier": "123", "top_container": {}}},
                {
                    "order_history_snippet_type_2": {
                        "identifier": "456",
                        "click_action": {"tab_id": "789"},
                    }
                },
            ],
        }
        with (
            patch.object(self.provider, "_location", return_value={"address_id": "1"}),
            patch.object(self.provider, "_api", return_value=page),
        ):
            records = list(self.provider.pages())[0]
        self.assertEqual([r["order_id"] for r in records], ["123", "789"])
        page["results"] = [{"order_history_snippet_type_2": {"identifier": "ui-only"}}]
        with (
            patch.object(self.provider, "_location", return_value={"address_id": "1"}),
            patch.object(self.provider, "_api", return_value=page),
            self.assertRaises(KhataError),
        ):
            list(self.provider.pages())

    def test_unknown_final_page_keeps_archive_incomplete(self):
        first = {
            "status": "success",
            "has_more": True,
            "postback_params": "next",
            "results": [{"order_history_snippet_type_2": {"click_action": {"tab_id": "123"}}}],
        }
        final = {"status": "success", "has_more": False, "results": [{"changed_order_format": {}}]}
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(self.provider, "profile", return_value="account"),
            patch.object(self.provider, "_location", return_value={"address_id": "1"}),
            patch.object(self.provider, "_api", side_effect=[first, final]),
            patch("food_khata.providers.http.time.sleep"),
        ):
            report = sync(
                self.provider, Path(directory) / "history.json", "account", lambda _: None
            )
        self.assertFalse(report["history_complete"])
        self.assertFalse(report["complete"])
        self.assertIn("123", report["orders"])
        self.assertIn("no recognized orders", report["errors"][0])

    def setUp(self):
        self.provider = Zomato({"access_token": "test-only", "refresh_token": ""})
        self.addCleanup(self.provider.close)

    def test_navigation_and_details(self):
        self.assertIsNone(order_id({"id": "123"}))
        self.assertEqual(order_id({"nested": "zomato://order?tab_id=123"}), "123")
        self.assertTrue(self.provider.valid_details("123", {"id": 123, "order": {"items": []}}))
        self.assertFalse(self.provider.valid_details("12", {"id": 123, "order": {"items": []}}))

    def test_delivery_path_navigation_id(self):
        self.assertEqual(
            order_id({"deeplink": {"url": "zomato://delivery/123?source=order_history"}}), "123"
        )
        for link in (
            "zomato://restaurant/123",
            "https://example.test/123",
            "zomato://delivery/../123",
            "zomato://delivery/not-an-id",
            "zomato://delivery/123/456",
        ):
            with self.subTest(link=link):
                self.assertIsNone(order_id(link))

    def test_delivery_path_orders_are_saved_with_details(self):
        page = {
            "status": "success",
            "has_more": False,
            "results": [
                {
                    "order_history_snippet_type_2": {
                        "click_action": {
                            "deeplink": {"url": "zomato://delivery/123?source=order_history"}
                        }
                    }
                }
            ],
        }
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(self.provider, "profile", return_value="account"),
            patch.object(self.provider, "_location", return_value={"address_id": "1"}),
            patch.object(self.provider, "_api", return_value=page),
            patch.object(
                self.provider, "details", return_value={"id": "123", "order": {"items": []}}
            ),
        ):
            path = Path(directory) / "history.json"
            report = sync(self.provider, path, "account", lambda _: None)
            self.assertTrue(report["complete"])
            self.assertEqual(report["counts"]["details"], 1)
            from food_khata.storage import read_json

            self.assertIn("123", read_json(path)["orders"])

    def test_pages_overlap_and_stall(self):
        def page(ids, more):
            return {
                "status": "success",
                "has_more": more,
                "postback_params": "next",
                "results": [
                    {
                        "order_history_snippet_type_2": {
                            "click_action": {"tab_id": value},
                            "token": "secret",
                        }
                    }
                    for value in ids
                ],
            }

        with (
            patch.object(self.provider, "_location", return_value={"address_id": "1"}),
            patch.object(
                self.provider, "_api", side_effect=[page(["1", "2"], True), page(["2", "3"], False)]
            ),
            patch("food_khata.providers.http.time.sleep"),
        ):
            pages = list(self.provider.pages())
        self.assertEqual([[o["order_id"] for o in p] for p in pages], [["1", "2"], ["3"]])
        self.assertEqual(pages[0][0]["history"]["token"], "[redacted]")
        with (
            patch.object(self.provider, "_location", return_value={"address_id": "1"}),
            patch.object(self.provider, "_api", return_value=page(["1"], True)),
            patch("food_khata.providers.http.time.sleep"),
            self.assertRaises(KhataError),
        ):
            list(self.provider.pages())

    def test_redirect_rejected_before_follow(self):
        auth = Mock()
        auth.request.return_value = SimpleNamespace(
            status_code=302, headers={"Location": "https://evil.example/steal"}
        )
        with self.assertRaises(KhataError):
            self.provider._auth_request(auth, "GET", ACCOUNTS + "/login")
        self.assertEqual(auth.request.call_count, 1)
        for url in (
            "http://accounts.zomato.com",
            "https://accounts.zomato.com.evil.example",
            "https://u:p@accounts.zomato.com",
        ):
            with self.assertRaises(KhataError):
                self.provider._auth_url(url)

    def test_state_mismatch_blocks_token_exchange(self):
        auth = Mock()
        responses = [
            SimpleNamespace(url=ACCOUNTS + "/login?login_challenge=lc"),
            SimpleNamespace(url=ACCOUNTS + "/consent?consent_challenge=cc"),
            SimpleNamespace(url=ACCOUNTS + "/zoauth/callback?code=c&state=wrong"),
        ]
        with (
            patch("food_khata.providers.zomato.curl_requests.Session") as factory,
            patch.object(self.provider, "_auth_request", side_effect=responses),
            patch.object(
                self.provider, "_auth_json", return_value={"redirect_to": ACCOUNTS + "/next"}
            ) as post,
        ):
            factory.return_value.__enter__.return_value = auth
            with self.assertRaisesRegex(KhataError, "state"):
                self.provider.login("9876543210", lambda: "123456")
        self.assertNotIn("/token", [call.args[1] for call in post.call_args_list])

    def test_successful_login_validates_state_and_sends_sms(self):
        responses = [
            SimpleNamespace(url=ACCOUNTS + "/login?login_challenge=lc"),
            SimpleNamespace(url=ACCOUNTS + "/consent?consent_challenge=cc"),
            SimpleNamespace(url=ACCOUNTS + "/zoauth/callback?code=c&state=expected"),
        ]
        with (
            patch("food_khata.providers.zomato.curl_requests.Session"),
            patch(
                "food_khata.providers.zomato.secrets.token_urlsafe",
                side_effect=["verifier", "expected"],
            ),
            patch.object(self.provider, "_auth_request", side_effect=responses),
            patch.object(self.provider, "profile", return_value="123"),
            patch.object(
                self.provider,
                "_auth_json",
                side_effect=[
                    {},
                    {"redirect_to": ACCOUNTS},
                    {"redirect_to": ACCOUNTS},
                    {"token": {"access_token": "new-token"}},
                ],
            ) as post,
        ):
            self.assertEqual(self.provider.login("9876543210", lambda: "123456"), "123")
        self.assertEqual(post.call_args_list[0].args[2]["verification_type"], "sms")
        self.assertEqual(post.call_args_list[2].args[1:3], ("/consent", {"cc": "cc"}))
        self.assertEqual(post.call_args_list[-1].args[2]["state"], "expected")
        self.assertEqual(self.provider.dump_session()["access_token"], "new-token")

    def test_auth_posts_preserve_original_form_and_token_accept_headers(self):
        auth = Mock()
        auth.request.return_value = Mock(status_code=200)
        auth.request.return_value.json.return_value = {"status": True}
        self.provider._auth_json(auth, "/consent", {"cc": "test-challenge"})
        self.assertEqual(auth.request.call_args.kwargs["data"], {"cc": "test-challenge"})
        self.assertEqual(
            auth.request.call_args.kwargs["headers"]["Content-Type"],
            "application/x-www-form-urlencoded",
        )
        self.provider._auth_json(auth, "/token", {"code": "test-code"})
        self.assertEqual(
            auth.request.call_args.kwargs["headers"]["Accept"], "application/json, text/plain, */*"
        )

    def test_auth_500_reports_stage_without_secrets_or_retry(self):
        for path, body, stage in (
            ("/oauth2/auth", {}, "authorization"),
            ("/login/phone", {"type": "initiate"}, "OTP request"),
            ("/login/phone", {"type": "verify", "otp": "123456"}, "OTP verification"),
            ("/consent", {"cc": "private-challenge"}, "consent"),
            ("/token", {"code": "private-code"}, "token exchange"),
        ):
            with self.subTest(stage=stage):
                auth = Mock()
                auth.request.return_value = Mock(status_code=500)
                with self.assertRaises(KhataError) as caught:
                    self.provider._auth_request(
                        auth, "POST", ACCOUNTS + path + "?secret=private", data=body
                    )
                message = str(caught.exception)
                self.assertIn("HTTP 500", message)
                self.assertIn(stage, message)
                self.assertNotIn("private", message)
                self.assertNotIn("123456", message)
                self.assertEqual(auth.request.call_count, 1)

    @patch("food_khata.providers.http.time.sleep")
    def test_network_auth_and_otp_retry_rules(self, sleep):
        http = Mock()
        http.request.side_effect = requests.ConnectionError("contains secret")
        with self.assertRaises(KhataError) as caught:
            request_json(http, "POST", "https://example.test/otp", retry=False)
        self.assertNotIn("secret", str(caught.exception))
        self.assertEqual(http.request.call_count, 1)
        http.reset_mock()
        with self.assertRaises(KhataError):
            request_json(http, "GET", "https://example.test/profile")
        self.assertEqual(http.request.call_count, 3)
        http.request.side_effect = None
        http.request.return_value.status_code = 401
        with self.assertRaises(AuthenticationError):
            request_json(http, "GET", "https://example.test/profile")
        http.request.return_value.status_code = 403
        with self.assertRaises(KhataError) as caught:
            request_json(http, "GET", "https://example.test/profile")
        self.assertNotIsInstance(caught.exception, AuthenticationError)
