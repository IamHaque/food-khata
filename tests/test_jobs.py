"""Tests for background job runner, lifecycle, limits, restart, and cancel (AC-09)."""

import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from food_khata.auth.sessions import (
    connect_app_db,
    create_test_user_session,
    delete_session,
    init_app_db,
)
from food_khata.contracts import AuthenticationError, KhataError
from food_khata.db import AnalyticsDB
from food_khata.jobs import (
    CANCELLED,
    DONE,
    FAILED,
    INTERRUPTED,
    NEEDS_CODE,
    QUEUED,
    RUNNING,
    JobControl,
    JobLimitExceeded,
    JobRunner,
)
from food_khata.providers.fake import FakeProvider
from food_khata.storage import read_json
from food_khata.users.context import UserContext, user_database


class ControlledFakeProvider(FakeProvider):
    """Fake provider with hooks to pause mid-sync for concurrency/cancel testing."""

    def __init__(self, *args, step_delay: float = 0.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.step_delay = step_delay
        self.pages_called = 0
        self.details_called = 0
        self.on_page_hook = None

    def pages(self):
        orders = self._order_list()
        for i in range(0, len(orders), self.page_size):
            self.pages_called += 1
            if self.step_delay > 0:
                time.sleep(self.step_delay)
            if self.on_page_hook:
                self.on_page_hook()
            yield orders[i : i + self.page_size]

    def details(self, order_id: str):
        self.details_called += 1
        if self.step_delay > 0:
            time.sleep(self.step_delay)
        return {"id": order_id, "amount": 250, "items": [{"name": "Biryani", "price": 250}]}

    def valid_details(self, order_id: str, value: any) -> bool:
        return isinstance(value, dict) and value.get("id") == order_id


class JobRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.app_db = self.root / "app.db"
        self.data_root = self.root / "data"

        init_app_db(self.app_db)
        # Create a test user and session in app.db
        self.session_id, self.csrf_token = create_test_user_session(
            self.app_db, username="alice", is_owner=True
        )
        conn = connect_app_db(self.app_db)
        row = conn.execute("SELECT id FROM users WHERE username = 'alice'").fetchone()
        self.alice_id = row["id"]
        conn.close()

        # Alice's unlocked UserContext
        self.alice_ctx = UserContext(self.data_root, self.alice_id).initialize("alice-password-123")
        self.alice_storage = self.alice_ctx.storage

        # Alice links a provider account
        acc = self.alice_storage.bind("9876543210", "zomato", "fake-account-1")
        self.alice_account_id = acc["local_id"]
        self.alice_session = {"access_token": "token-123", "provider": "zomato"}
        self.alice_storage.save_session(self.alice_account_id, "zomato", self.alice_session)

        self.runner = JobRunner(
            self.app_db,
            data_root=self.data_root,
            swiggy_pacing_seconds=0.01,
        )
        self.control = JobControl(
            self.app_db,
            data_root=self.data_root,
            runner=self.runner,
        )

    def tearDown(self):
        self.runner.stop(wait=True, timeout=2.0)
        self.temp_dir.cleanup()

    # --- Scenario: lifecycle ---
    def test_lifecycle_success_and_stored_changes(self):
        """Job moves through queued, running, done, and each state change is stored."""
        provider = ControlledFakeProvider(total_orders=4, page_size=2)
        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=provider,
        )
        job_id = job["id"]
        self.assertEqual(job["status"], QUEUED)

        # Wait for job to complete
        for _ in range(50):
            time.sleep(0.05)
            j = self.control.get_job(job_id)
            if j["status"] in (DONE, FAILED):
                break

        final_job = self.control.get_job(job_id)
        self.assertEqual(final_job["status"], DONE)
        self.assertEqual(final_job["phase"], "done")
        self.assertIsNotNone(final_job["started_at"])
        self.assertIsNotNone(final_job["finished_at"])

        # Check events log
        events = self.control.get_events(job_id)
        statuses = [e["status"] for e in events]
        self.assertIn(QUEUED, statuses)
        self.assertIn(RUNNING, statuses)
        self.assertIn(DONE, statuses)

        # Verify auto-import happened (Scenario: import once)
        user_db = user_database(self.data_root, self.alice_id)
        self.assertTrue(user_db.is_file())
        analytics = AnalyticsDB(user_db)
        with analytics.connection() as conn:
            cnt = conn.execute("SELECT count(*) FROM orders").fetchone()[0]
            self.assertEqual(cnt, 4)

    def test_lifecycle_failure(self):
        """Job records failed state and event when provider fails."""

        class FailingProvider(FakeProvider):
            def pages(self):
                raise KhataError("Simulated network outage")

        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=FailingProvider(),
        )
        job_id = job["id"]

        for _ in range(50):
            time.sleep(0.05)
            j = self.control.get_job(job_id)
            if j["status"] == FAILED:
                break

        final_job = self.control.get_job(job_id)
        self.assertEqual(final_job["status"], FAILED)
        self.assertTrue(final_job["resumable"])
        events = self.control.get_events(job_id)
        statuses = [e["status"] for e in events]
        self.assertIn(FAILED, statuses)

    def test_lifecycle_needs_code_and_resume(self):
        """When provider asks for code mid-sync, pauses as needs_code and can be resumed with code."""

        class NeedsOtpProvider(FakeProvider):
            def __init__(self):
                super().__init__(total_orders=4, page_size=2)
                self.asked_otp = False

            def pages(self):
                if not self.asked_otp:
                    self.asked_otp = True
                    raise AuthenticationError("OTP required to continue: NEEDS_OTP")
                yield from super().pages()

            def verify_otp(self, code: str) -> str:
                if code == "123456":
                    return "fake-account-1"
                raise KhataError("Invalid code")

        provider = NeedsOtpProvider()
        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=provider,
        )
        job_id = job["id"]

        for _ in range(50):
            time.sleep(0.05)
            j = self.control.get_job(job_id)
            if j["status"] == NEEDS_CODE:
                break

        needs_code_job = self.control.get_job(job_id)
        self.assertEqual(needs_code_job["status"], NEEDS_CODE)
        self.assertEqual(needs_code_job["error_code"], "NEEDS_OTP")

        # Now submit the code
        resumed = self.control.submit_code(job_id, "123456")
        self.assertIn(resumed["status"], (QUEUED, RUNNING, DONE))

        # Wait for completion
        for _ in range(50):
            time.sleep(0.05)
            j = self.control.get_job(job_id)
            if j["status"] == DONE:
                break
        self.assertEqual(self.control.get_job(job_id)["status"], DONE)

    # --- Scenario: outlives the session ---
    def test_outlives_session_and_discards_keys_at_end(self):
        """Given a running sync / When user leaves or logs out / Then it continues.

        At start takes in-memory copy of decrypted session & key, and discards both at end.
        """
        provider = ControlledFakeProvider(total_orders=6, page_size=2, step_delay=0.04)

        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=dict(self.alice_session),
            cipher=self.alice_ctx.cipher,
            provider_instance=provider,
        )
        job_id = job["id"]

        # Wait until it is actively running
        for _ in range(50):
            time.sleep(0.02)
            if self.control.get_job(job_id)["status"] == RUNNING:
                break
        self.assertEqual(self.control.get_job(job_id)["status"], RUNNING)

        # Alice logs out! Web session is deleted from sessions table in app.db
        conn = connect_app_db(self.app_db)
        delete_session(conn, self.session_id)
        sess = conn.execute("SELECT * FROM sessions WHERE id = ?", (self.session_id,)).fetchone()
        conn.close()
        self.assertIsNone(sess)  # Confirmed logged out!

        # Sync must continue running and complete!
        for _ in range(60):
            time.sleep(0.05)
            if (
                self.control.get_job(job_id)["status"] == DONE
                and job_id not in self.runner.active_jobs
            ):
                break

        final_job = self.control.get_job(job_id)
        self.assertEqual(final_job["status"], DONE)

        # Verify that in-memory copies were discarded
        self.assertNotIn(job_id, self.runner.active_jobs)
        self.assertNotIn(job_id, self.runner.registered_payloads)

    # --- Scenario: restart ---
    def test_server_restart_marks_running_jobs_interrupted(self):
        """When server restarts / Then running jobs are marked interrupted, not left hanging."""
        # Manually create a job row in RUNNING state to simulate a crash/restart
        conn = connect_app_db(self.app_db)
        job_id = "crashed-job-123"
        now = time.time()
        conn.execute(
            """
            INSERT INTO jobs (id, user_id, account_id, provider, status, created_at, started_at, updated_at)
            VALUES (?, ?, ?, 'zomato', 'running', ?, ?, ?)
            """,
            (job_id, self.alice_id, self.alice_account_id, now, now, now),
        )
        conn.commit()
        conn.close()

        # Simulate server restart: new JobRunner starts up
        new_runner = JobRunner(self.app_db, data_root=self.data_root)
        interrupted = new_runner.mark_interrupted_on_startup()

        self.assertIn(job_id, interrupted)
        crashed_job = self.control.get_job(job_id)
        self.assertEqual(crashed_job["status"], INTERRUPTED)
        self.assertEqual(crashed_job["error_code"], "INTERRUPTED")
        self.assertTrue(crashed_job["resumable"])
        self.assertIsNotNone(crashed_job["finished_at"])

        events = self.control.get_events(job_id)
        statuses = [e["status"] for e in events]
        self.assertIn(INTERRUPTED, statuses)

    # --- Scenario: cancel ---
    def test_cancel_stops_within_one_request_and_saves_checkpoint(self):
        """When a cancel arrives / Then the job stops within one request and saves a resumable checkpoint."""
        provider = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.05)

        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=provider,
        )
        job_id = job["id"]

        # Wait until page >= 1 is processed
        for _ in range(50):
            time.sleep(0.02)
            j = self.control.get_job(job_id)
            if j["status"] == RUNNING and (j.get("page") or 0) >= 1:
                break

        # Cancel the job: must complete within this one request (timeout 5s)
        start_cancel = time.monotonic()
        cancelled_job = self.control.cancel_job(job_id, wait=True, timeout=5.0)
        duration = time.monotonic() - start_cancel

        self.assertLess(duration, 2.0)  # Stopped promptly within 1 request
        self.assertEqual(cancelled_job["status"], CANCELLED)
        self.assertTrue(cancelled_job["resumable"])
        self.assertEqual(cancelled_job["error_code"], "CANCELLED")

        # Verify archive checkpoint was saved on disk
        archive_path = self.alice_storage.account_path(self.alice_account_id) / "zomato-history.json"
        self.assertTrue(archive_path.is_file())
        archive = read_json(archive_path)
        self.assertFalse(archive["complete"])
        self.assertIn("CANCELLED", archive["errors"])
        # Some orders should have been checkpointed
        self.assertGreater(len(archive["orders"]), 0)

        # Resume from checkpoint: incremental sync should succeed
        provider2 = ControlledFakeProvider(total_orders=10, page_size=2)
        self.control.resume_job(
            job_id,
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=provider2,
        )
        for _ in range(50):
            time.sleep(0.05)
            j = self.control.get_job(job_id)
            if j["status"] in (DONE, FAILED):
                break
        self.assertEqual(self.control.get_job(job_id)["status"], DONE)

    # --- Scenario: limits ---
    def test_limits_1_running_2_queued_and_409_on_exceeded(self):
        """Enforces 1 running and 2 queued jobs per user (DEC-010), and a 409 returned when exceeded."""
        # Use slow provider so jobs stay active
        p1 = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.1)
        p2 = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.1)
        p3 = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.1)

        # 1st job: running
        j1 = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=p1,
        )
        time.sleep(0.05)
        self.assertEqual(self.control.get_job(j1["id"])["status"], RUNNING)

        # 2nd job: queued (1 running, 1 queued)
        j2 = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=p2,
        )
        self.assertEqual(self.control.get_job(j2["id"])["status"], QUEUED)

        # 3rd job: queued (1 running, 2 queued)
        j3 = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=p3,
        )
        self.assertEqual(self.control.get_job(j3["id"])["status"], QUEUED)

        # 4th job: exceeds limit (already 1 running and 2 queued)!
        # Must raise 409!
        with self.assertRaises(JobLimitExceeded) as cm:
            self.control.submit_sync(
                user_id=self.alice_id,
                account_id=self.alice_account_id,
                provider="zomato",
                session=self.alice_session,
                cipher=self.alice_ctx.cipher,
                provider_instance=ControlledFakeProvider(),
            )
        self.assertEqual(cm.exception.status_code, 409)
        self.assertEqual(cm.exception.code, "LIMIT_EXCEEDED")

        # Isolation: another user (Bob) can still queue jobs
        create_test_user_session(self.app_db, username="bob", is_owner=False)
        conn = connect_app_db(self.app_db)
        bob_id = conn.execute("SELECT id FROM users WHERE username = 'bob'").fetchone()["id"]
        conn.close()

        # Bob submits a job: should succeed (Bob has 0 jobs)
        bob_job = self.control.submit_sync(
            user_id=bob_id,
            account_id=self.alice_account_id,
            provider="swiggy",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=ControlledFakeProvider(total_orders=2, page_size=2),
        )
        self.assertIsNotNone(bob_job["id"])

        # Clean up active jobs
        self.control.cancel_job(j1["id"], wait=True)
        self.control.cancel_job(j2["id"], wait=True)
        self.control.cancel_job(j3["id"], wait=True)
        self.control.cancel_job(bob_job["id"], wait=True)

    # --- Scenario: provider concurrency across users ---
    def test_at_most_one_job_per_provider_across_users(self):
        """At most one job runs per provider across all users."""
        create_test_user_session(self.app_db, username="bob", is_owner=False)
        conn = connect_app_db(self.app_db)
        bob_id = conn.execute("SELECT id FROM users WHERE username = 'bob'").fetchone()["id"]
        conn.close()

        p_alice = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.1)
        p_bob = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.1)

        # Alice starts Zomato sync
        j_alice = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=p_alice,
        )
        time.sleep(0.05)
        self.assertEqual(self.control.get_job(j_alice["id"])["status"], RUNNING)

        # Bob starts Zomato sync while Alice's Zomato is running
        j_bob = self.control.submit_sync(
            user_id=bob_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=p_bob,
        )
        # Bob's job must remain QUEUED because Zomato is already running!
        self.assertEqual(self.control.get_job(j_bob["id"])["status"], QUEUED)

        # Cancel Alice's job
        self.control.cancel_job(j_alice["id"], wait=True)

        # Now Bob's job can start running!
        for _ in range(50):
            time.sleep(0.02)
            if self.control.get_job(j_bob["id"])["status"] == RUNNING:
                break
        self.assertEqual(self.control.get_job(j_bob["id"])["status"], RUNNING)
        self.control.cancel_job(j_bob["id"], wait=True)

    # --- Scenario: admin actions cancel user jobs ---
    def test_cancel_user_cancels_all_active_jobs(self):
        """Reset / disable user calls JobControl.cancel_user to wipe all active jobs."""
        p1 = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.1)
        p2 = ControlledFakeProvider(total_orders=10, page_size=2, step_delay=0.1)

        j1 = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=p1,
        )
        j2 = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=p2,
        )

        time.sleep(0.05)
        cancelled_cnt = self.control.cancel_user(self.alice_id)
        self.assertEqual(cancelled_cnt, 2)
        self.assertEqual(self.control.get_job(j1["id"])["status"], CANCELLED)
        self.assertEqual(self.control.get_job(j2["id"])["status"], CANCELLED)

    # --- Scenario: use_partial import ---
    def test_use_partial_imports_cancelled_or_failed_archive(self):
        """Partial archives are kept for resume and imported only when user chooses use_partial."""
        provider = ControlledFakeProvider(total_orders=6, page_size=2, step_delay=0.04)

        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=provider,
        )
        time.sleep(0.08)
        self.control.cancel_job(job["id"], wait=True)

        user_db = user_database(self.data_root, self.alice_id)
        # DB should not have auto-imported cancelled job
        if user_db.is_file():
            with AnalyticsDB(user_db).connection() as conn:
                cnt = conn.execute("SELECT count(*) FROM orders").fetchone()[0]
                self.assertEqual(cnt, 0)

        # Now explicitly choose use_partial
        res = self.control.use_partial(job["id"])
        self.assertGreater(res.get("total", 0), 0)

        with AnalyticsDB(user_db).connection() as conn:
            cnt = conn.execute("SELECT count(*) FROM orders").fetchone()[0]
            self.assertEqual(cnt, res["total"])

    # --- Scenario: needs code key dropped after timeout ---
    def test_needs_code_key_dropped_after_timeout_marks_interrupted(self):
        """Scenario: needs code key dropped after ~24h, job becomes interrupted."""

        class OtpProvider(FakeProvider):
            def pages(self):
                raise AuthenticationError("OTP required: NEEDS_OTP")

        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=OtpProvider(),
        )
        job_id = job["id"]

        for _ in range(50):
            time.sleep(0.02)
            if self.control.get_job(job_id)["status"] == NEEDS_CODE:
                break
        self.assertEqual(self.control.get_job(job_id)["status"], NEEDS_CODE)

        # Drop expired keys with cutoff 0s (simulates 24h passed)
        interrupted = self.control.drop_expired_keys(max_age_seconds=0.0)
        self.assertIn(job_id, interrupted)

        final_job = self.control.get_job(job_id)
        self.assertEqual(final_job["status"], INTERRUPTED)
        self.assertEqual(final_job["error_code"], "INTERRUPTED")
        self.assertNotIn(job_id, self.runner.registered_payloads)

    # --- Scenario: Swiggy pacing ---
    def test_swiggy_pacing(self):
        """Swiggy pacing is enforced (~1 request per second)."""
        # Test with small pacing interval (0.05s) to verify timing
        runner = JobRunner(self.app_db, swiggy_pacing_seconds=0.05)
        start = time.monotonic()
        runner._pace_provider("swiggy")
        runner._pace_provider("swiggy")
        elapsed = time.monotonic() - start
        self.assertGreaterEqual(elapsed, 0.04)

    # --- Scenario: Prune events ---
    def test_prune_job_events(self):
        """Recent events stored for polling and older events pruned."""
        job = self.control.submit_sync(
            user_id=self.alice_id,
            account_id=self.alice_account_id,
            provider="zomato",
            session=self.alice_session,
            cipher=self.alice_ctx.cipher,
            provider_instance=ControlledFakeProvider(total_orders=2, page_size=2),
        )
        events = self.control.get_events(job["id"])
        self.assertIsInstance(events, list)
        self.assertGreater(len(events), 0)
        # Pruning with future cutoff deletes all events
        pruned = self.control.prune_events(retention_seconds=-1.0)
        self.assertGreater(pruned, 0)
        # Clean up
        self.control.cancel_job(job["id"], wait=True)


if __name__ == "__main__":
    unittest.main()
