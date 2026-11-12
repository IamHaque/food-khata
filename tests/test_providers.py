import unittest
from unittest.mock import Mock, patch

from food_khata.contracts import AuthenticationError, KhataError
from food_khata.providers.swiggy import Swiggy


class SwiggyTests(unittest.TestCase):
    def test_bootstrap_and_auth_rotation(self):
        provider = Swiggy()
        self.addCleanup(provider.close)
        response = Mock(status_code=200, headers={"tid": "new-test-tid", "sid": "test-sid"})
        response.json.return_value = {"statusCode": 0, "food": {"statusCode": 0}}
        with patch.object(provider.client.http, "request", return_value=response) as request:
            provider.client.call("bootstrap", body={"food": {}})
        self.assertEqual(provider.dump_session()["headers"]["tid"], "new-test-tid")
        self.assertFalse(request.call_args.kwargs["allow_redirects"])
        response.json.return_value = {"statusCode": 999}
        with (
            patch.object(provider.client.http, "request", return_value=response),
            self.assertRaises(AuthenticationError),
        ):
            provider.profile()

    def test_two_step_login_requests_otp_at_start(self):
        provider = Swiggy()
        self.addCleanup(provider.close)
        with (
            patch.object(provider.client, "request_otp") as request,
            patch.object(provider.client, "verify_otp") as verify,
            patch.object(provider, "profile", return_value="123"),
        ):
            provider.start_login("9876543210")
            request.assert_called_once_with("9876543210")  # the SMS goes out at start
            self.assertEqual(provider.verify_otp("123456"), "123")
            verify.assert_called_once_with("123456")
            request.assert_called_once()

    def test_phone_otp_login_sequence(self):
        provider = Swiggy()
        self.addCleanup(provider.close)
        with patch.object(
            provider.client,
            "call",
            side_effect=[
                {},
                {"data": {"registered": True}},
                {},
                {},
                {"data": {"customer_id": "123"}},
                {"data": {"customer_id": "123"}},
            ],
        ) as call:
            self.assertEqual(provider.login("9876543210", lambda: "123456"), "123")
        self.assertEqual(
            [c.args[0] for c in call.call_args_list],
            ["bootstrap", "check", "send_otp", "verify_otp", "profile", "profile"],
        )

    def test_pagination_and_stall(self):
        provider = Swiggy()
        card = {
            "success": {
                "cards": [
                    {
                        "card": {
                            "card": {"@type": "x.OrderDetails", "orderId": "12", "token": "secret"}
                        }
                    }
                ]
            }
        }
        with patch.object(provider.client, "call", side_effect=[card, card]):
            pages = provider.pages()
            self.assertEqual(next(pages)[0]["history"]["token"], "[redacted]")
            with self.assertRaises(KhataError):
                next(pages)
        provider.close()

    def test_details_validation(self):
        provider = Swiggy()
        self.assertTrue(
            provider.valid_details("12", {"orders": [{"order_id": "12", "order_items": []}]})
        )
        self.assertFalse(
            provider.valid_details("13", {"orders": [{"order_id": "12", "order_items": []}]})
        )
        provider.close()


if __name__ == "__main__":
    unittest.main()
