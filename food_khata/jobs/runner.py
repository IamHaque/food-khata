"""Background job runner, lifecycle control, and queue scheduling (AC-09)."""

from __future__ import annotations

import copy
import logging
import sqlite3
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from starlette.exceptions import HTTPException

from ..contracts import AuthenticationError, KhataError
from ..db import AnalyticsDB
from ..providers.base import get_provider
from ..providers.http import set_cancel_check
from ..services.sync import CancelToken, sync
from ..storage import CredentialsRevoked, Storage, provider_identity, read_json, save_json
from ..users.context import user_database, user_root
from .db import (
    add_job_event,
    avg_job_seconds,
    connect_job_db,
    count_user_active_jobs,
    create_job,
    fair_order,
    get_db_conn,
    get_job,
    get_job_events,
    init_jobs_tables,
    list_jobs,
    mark_interrupted_on_startup,
    prune_job_events,
    update_job,
)
from .states import (
    ACTIVE_STATES,
    CANCELLED,
    DONE,
    FAILED,
    INTERRUPTED,
    NEEDS_CODE,
    PAUSED,
    QUEUED,
    RUNNING,
    TERMINAL_STATES,
)

logger = logging.getLogger(__name__)

PROGRESS_INTERVAL = 1.0  # seconds between progress writes for one job

# DEC-010 Per-user limits
MAX_RUNNING_PER_USER = 1
MAX_QUEUED_PER_USER = 2


class JobLimitExceeded(HTTPException, KhataError):
    """Raised when a user exceeds 1 running or 2 queued jobs (DEC-010)."""

    def __init__(self, detail: str = "User job limit exceeded (1 running, 2 queued).") -> None:
        HTTPException.__init__(self, status_code=409, detail=detail)
        KhataError.__init__(self, f"409: {detail}")
        self.status_code = 409
        self.code = "LIMIT_EXCEEDED"
        self.message = detail


class AccountBusy(JobLimitExceeded):
    """Another job is already queued or running for this account and provider (PR-07)."""

    def __init__(self) -> None:
        super().__init__("A sync is already queued or running for this account and provider.")
        self.code = "ACCOUNT_BUSY"


class JobNotFoundError(HTTPException, KhataError):
    """Raised when a job is not found or inaccessible."""

    def __init__(self, detail: str = "Job not found.") -> None:
        HTTPException.__init__(self, status_code=404, detail=detail)
        KhataError.__init__(self, f"404: {detail}")
        self.status_code = 404
        self.code = "NOT_FOUND"
        self.message = detail


@dataclass
class JobPayload:
    job_id: str
    user_id: str
    account_id: str
    provider: str
    provider_id: str | None
    mode: str
    session_copy: dict[str, Any] | None
    cipher_copy: Any | None
    provider_instance: Any | None


class ActiveJob:
    def __init__(self, payload: JobPayload, cancel_token: CancelToken) -> None:
        self.payload = payload
        self.cancel_token = cancel_token
        self.thread: threading.Thread | None = None
        self.finished_event = threading.Event()


class PacedProvider:
    """Wraps any provider to enforce inter-request pacing (e.g. Swiggy ~1 req/s)."""

    def __init__(self, provider: Any, runner: JobRunner, provider_name: str, cancel_token: Any = None) -> None:
        self._provider = provider
        self._runner = runner
        self._name = provider_name
        self._cancel = cancel_token
        self.name = getattr(provider, "name", provider_name)

    def profile(self) -> str:
        self._runner._pace_provider(self._name, self._cancel)
        return self._provider.profile()

    def pages(self) -> Any:
        for page in self._provider.pages():
            self._runner._pace_provider(self._name, self._cancel)
            yield page

    def valid_details(self, order_id: str, details: Any) -> bool:
        return self._provider.valid_details(order_id, details)

    def details(self, order_id: str) -> Any:
        self._runner._pace_provider(self._name, self._cancel)
        return self._provider.details(order_id)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._provider, name)


class JobRunner:
    """Background sync execution runner with fair scheduling, provider pacing, and lifecycle control."""

    def __init__(
        self,
        app_db_path: Path | str,
        data_root: Path | str | None = None,
        swiggy_pacing_seconds: float = 1.0,
        provider_concurrency: dict[str, int] | None = None,
    ) -> None:
        self.app_db_path = Path(app_db_path)
        self.data_root = Path(data_root) if data_root is not None else None
        init_jobs_tables(self.app_db_path)

        self.lock = threading.Lock()
        self.active_jobs: dict[str, ActiveJob] = {}
        self.registered_payloads: dict[str, JobPayload] = {}
        self.pacing_interval: dict[str, float] = {"swiggy": swiggy_pacing_seconds}
        self.next_slot: dict[str, float] = {}
        self.pacing_lock = threading.Lock()
        # How many jobs may run per provider at once (default 1 each, DEC-P4); others default to 1.
        self.provider_concurrency = {"swiggy": 1, "zomato": 1, **(provider_concurrency or {})}
        self._stopped = False
        self._shutdown = False
        self._cleanup_stop = threading.Event()
        self._cleanup_thread: threading.Thread | None = None

    def mark_interrupted_on_startup(self) -> list[str]:
        """Mark running jobs as interrupted on server start (AC-09 restart scenario)."""
        return mark_interrupted_on_startup(self.app_db_path)

    def start(self) -> None:
        self._stopped = False
        self.mark_interrupted_on_startup()
        self._cleanup_stop.clear()
        if self._cleanup_thread is None or not self._cleanup_thread.is_alive():
            self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
            self._cleanup_thread.start()
        self.process_queue()

    def _cleanup_loop(self) -> None:
        while not self._cleanup_stop.wait(60):
            self.drop_expired_keys()

    def stop(self, wait: bool = True, timeout: float = 10.0) -> None:
        """Graceful shutdown: running jobs checkpoint and become interrupted/SHUTDOWN within `timeout` seconds."""
        self._stopped = True
        self._shutdown = True
        self._cleanup_stop.set()
        if self._cleanup_thread and self._cleanup_thread is not threading.current_thread():
            self._cleanup_thread.join()
        with self.lock:
            active_list = list(self.active_jobs.values())
        for aj in active_list:
            aj.cancel_token.cancel()
        if wait:
            deadline = time.monotonic() + timeout
            for aj in active_list:
                aj.finished_event.wait(timeout=max(0.0, deadline - time.monotonic()))

    def _pace_provider(self, provider_name: str, cancel_token: Any = None) -> None:
        """Reserve the provider's next request slot, then wait for it outside the lock in 250 ms steps."""
        interval = self.pacing_interval.get(provider_name, 0.0)
        if interval <= 0.0:
            return
        with self.pacing_lock:
            now = time.monotonic()
            slot = max(now, self.next_slot.get(provider_name, 0.0))
            self.next_slot[provider_name] = slot + interval
        while (left := slot - time.monotonic()) > 0:
            if cancel_token is not None and cancel_token.is_cancelled():
                return
            time.sleep(min(0.25, left))

    def register_job(self, payload: JobPayload) -> None:
        with self.lock:
            self.registered_payloads[payload.job_id] = payload

    def process_queue(self) -> None:
        """Start queued jobs that may run now: one per user, `provider_concurrency` per provider.

        Candidates are read before the lock is taken (the lock only guards starting threads) and are
        ordered fairly: round robin by user, oldest first within a user.
        """
        if self._stopped:
            return
        queued = fair_order(list_jobs(self.app_db_path, status=QUEUED, limit=200))

        with self.lock:
            running_users = {aj.payload.user_id for aj in self.active_jobs.values()}
            running_per_provider: dict[str, int] = {}
            for aj in self.active_jobs.values():
                running_per_provider[aj.payload.provider] = running_per_provider.get(aj.payload.provider, 0) + 1

            for job in queued:
                user_id, provider = job["user_id"], job["provider"]
                if user_id in running_users:
                    continue
                if running_per_provider.get(provider, 0) >= self.provider_concurrency.get(provider, 1):
                    continue
                payload = self.registered_payloads.get(job["id"])
                if payload is None:
                    continue  # no credentials in memory (e.g. left over from before a restart)
                running_users.add(user_id)
                running_per_provider[provider] = running_per_provider.get(provider, 0) + 1
                self._start_job_locked(payload)

    def _start_job_locked(self, payload: JobPayload) -> None:
        job_id = payload.job_id
        cancel_token = CancelToken()
        active_job = ActiveJob(payload, cancel_token)
        self.active_jobs[job_id] = active_job

        now = time.time()
        update_job(self.app_db_path, job_id, status=RUNNING, started_at=now)
        add_job_event(self.app_db_path, job_id, status=RUNNING, message="Job started running")

        thread = threading.Thread(
            target=self._execute_job,
            args=(active_job,),
            name=f"job-{job_id}",
            daemon=True,
        )
        active_job.thread = thread
        thread.start()

    def _execute_job(self, active_job: ActiveJob) -> None:
        payload = active_job.payload
        job_id = payload.job_id
        session_copy = payload.session_copy
        cipher_copy = payload.cipher_copy
        job_conn = None
        set_cancel_check(active_job.cancel_token.is_cancelled)  # provider retry sleeps stop within 250 ms of a cancel

        try:
            # 1. Setup per-user storage
            if self.data_root:
                storage_root = user_root(self.data_root, payload.user_id)
            else:
                storage_root = None
            storage = Storage(storage_root, cipher=cipher_copy)
            acc_path = storage.account_path(payload.account_id)
            archive_path = acc_path / f"{payload.provider}-history.json"

            # 2. Setup provider instance
            raw_provider = payload.provider_instance
            if raw_provider is None:
                raw_provider = get_provider(payload.provider, session=session_copy)
            provider = PacedProvider(raw_provider, self, payload.provider, active_job.cancel_token)
            provider_id = payload.provider_id or provider.profile()

            # 3. Setup progress and checkpoint callbacks
            job_conn = connect_job_db(self.app_db_path)  # one connection for this job thread's progress writes
            progress = {"at": 0.0, "phase": None}

            def on_progress(event: Any) -> None:
                phase = getattr(event, "phase", None) or event.get("phase")
                page = getattr(event, "page", None) or event.get("page")
                counts = getattr(event, "counts", None) or event.get("counts")
                code = getattr(event, "code", None) or event.get("code")
                msg = getattr(event, "message", None) or event.get("message")

                # At most one write per second per job, except phase changes and events that carry a code.
                now_m = time.monotonic()
                if phase == progress["phase"] and not code and now_m - progress["at"] < PROGRESS_INTERVAL:
                    return
                progress["at"], progress["phase"] = now_m, phase
                update_job(job_conn, job_id, phase=phase, page=page, counts=counts)
                add_job_event(
                    job_conn,
                    job_id,
                    status=RUNNING,
                    phase=phase,
                    page=page,
                    counts=counts,
                    code=code,
                    message=msg,
                )

            def checkpoint_session() -> None:
                if hasattr(raw_provider, "dump_session") and not active_job.cancel_token.is_cancelled():
                    latest = raw_provider.dump_session()
                    if isinstance(latest, dict) and latest and not active_job.cancel_token.is_cancelled():
                        try:
                            storage.save_session(payload.account_id, payload.provider, latest)
                        except CredentialsRevoked:
                            if not active_job.cancel_token.is_cancelled():
                                raise

            # 4. Execute sync
            report = sync(
                provider=provider,
                path=archive_path,
                provider_id=provider_id,
                progress=on_progress,
                checkpoint_session=checkpoint_session,
                mode=payload.mode,
                cancel_token=active_job.cancel_token,
            )

            # 5. Handle outcome
            now = time.time()
            if self._shutdown and (active_job.cancel_token.is_cancelled() or report.get("cancelled")):
                update_job(
                    self.app_db_path, job_id, status=INTERRUPTED, resumable=1, error_code="SHUTDOWN",
                    error_message="Interrupted by server shutdown; checkpoint saved", finished_at=now,
                    counts=report.get("counts"),
                )
                add_job_event(
                    self.app_db_path, job_id, status=INTERRUPTED, code="SHUTDOWN",
                    message="Interrupted by server shutdown; checkpoint saved", counts=report.get("counts"),
                )
            elif active_job.cancel_token.is_cancelled() or report.get("cancelled"):
                update_job(
                    self.app_db_path,
                    job_id,
                    status=CANCELLED,
                    resumable=1,
                    error_code="CANCELLED",
                    error_message="Job cancelled",
                    finished_at=now,
                    counts=report.get("counts"),
                )
                add_job_event(
                    self.app_db_path,
                    job_id,
                    status=CANCELLED,
                    code="CANCELLED",
                    message="Job cancelled; checkpoint saved",
                    counts=report.get("counts"),
                )
            elif report.get("complete"):
                # Success: import is its own visible stage; a failure here must not look like a finished sync.
                update_job(self.app_db_path, job_id, phase="importing")
                try:
                    if self.data_root:
                        self.import_account(
                            storage, payload.user_id, payload.account_id, payload.provider,
                            incremental=(payload.mode != "full"), archive_path=archive_path,
                        )
                except Exception as e:
                    logger.error("Import failed for job %s: %s", job_id, type(e).__name__)
                    update_job(
                        self.app_db_path, job_id, status=FAILED, resumable=1, error_code="IMPORT_FAILED",
                        error_message="Fetched, but importing into your dashboard failed. Retry import.",
                        finished_at=now, counts=report.get("counts"),
                    )
                    add_job_event(
                        self.app_db_path, job_id, status=FAILED, code="IMPORT_FAILED",
                        message="Fetched, import failed", counts=report.get("counts"),
                    )
                else:
                    self.finish_done(job_id, now, report.get("counts"))
            elif report.get("error_code") == "NEEDS_OTP" or (
                report.get("errors") and any("NEEDS_OTP" in str(e) for e in report["errors"])
            ):
                update_job(
                    self.app_db_path,
                    job_id,
                    status=NEEDS_CODE,
                    resumable=1,
                    error_code="NEEDS_OTP",
                    error_message=report.get("error_message") or "Provider requires verification code",
                    counts=report.get("counts"),
                )
                add_job_event(
                    self.app_db_path,
                    job_id,
                    status=NEEDS_CODE,
                    code="NEEDS_OTP",
                    message="Provider asks for a verification code mid-sync",
                    counts=report.get("counts"),
                )
            else:
                err_code = report.get("error_code") or "SYNC_FAILED"
                err_msg = report.get("error_message") or str(report.get("errors", ["Sync failed"]))
                update_job(
                    self.app_db_path,
                    job_id,
                    status=FAILED,
                    resumable=1,
                    error_code=err_code,
                    error_message=err_msg,
                    finished_at=now,
                    counts=report.get("counts"),
                )
                add_job_event(
                    self.app_db_path,
                    job_id,
                    status=FAILED,
                    code=err_code,
                    message=err_msg,
                    counts=report.get("counts"),
                )

        except AuthenticationError as exc:
            now = time.time()
            update_job(
                self.app_db_path,
                job_id,
                status=NEEDS_CODE,
                resumable=1,
                error_code="NEEDS_OTP",
                error_message=str(exc),
                finished_at=now,
            )
            add_job_event(
                self.app_db_path,
                job_id,
                status=NEEDS_CODE,
                code="NEEDS_OTP",
                message=str(exc),
            )
        except (KeyboardInterrupt, SystemExit):
            now = time.time()
            update_job(
                self.app_db_path,
                job_id,
                status=INTERRUPTED,
                resumable=1,
                error_code="INTERRUPTED",
                error_message="Interrupted",
                finished_at=now,
            )
            add_job_event(
                self.app_db_path,
                job_id,
                status=INTERRUPTED,
                code="INTERRUPTED",
                message="Interrupted",
            )
            raise
        except Exception as exc:
            now = time.time()
            code = getattr(exc, "code", "INTERNAL")
            update_job(
                self.app_db_path,
                job_id,
                status=FAILED,
                resumable=1,
                error_code=code,
                error_message=str(exc),
                finished_at=now,
            )
            add_job_event(
                self.app_db_path,
                job_id,
                status=FAILED,
                code=code,
                message=str(exc),
            )
        finally:
            if job_conn is not None:
                job_conn.close()
            set_cancel_check(None)
            cur_job = get_job(self.app_db_path, job_id)
            final_status = cur_job.get("status") if cur_job else None

            # Scenario: outlives the session
            # Discard in-memory session and cipher when job reaches terminal state
            if final_status in TERMINAL_STATES or final_status is None:
                if session_copy is not None and isinstance(session_copy, dict):
                    session_copy.clear()
                session_copy = None
                cipher_copy = None
                payload.session_copy = None
                payload.cipher_copy = None
                with self.lock:
                    self.registered_payloads.pop(job_id, None)

            with self.lock:
                self.active_jobs.pop(job_id, None)

            active_job.finished_event.set()
            self.process_queue()

    def finish_done(self, job_id: str, now: float, counts: Any) -> None:
        update_job(
            self.app_db_path, job_id, status=DONE, phase="done", resumable=0, error_code=None,
            error_message=None, finished_at=now, counts=counts,
        )
        add_job_event(
            self.app_db_path, job_id, status=DONE, phase="done", message="Job completed successfully", counts=counts
        )

    def import_account(self, storage, user_id, account_id, provider, *, incremental, archive_path) -> dict:
        """Import an account's archives into the analytics database, then queue still-open orders for a refresh."""
        user_db_path = user_database(self.data_root, user_id)
        user_db_path.parent.mkdir(parents=True, exist_ok=True)
        analytics_db = AnalyticsDB(user_db_path)
        result = analytics_db.ingest_account(storage, account_id, incremental=incremental)
        archive = read_json(archive_path)
        archive["refresh_ids"] = analytics_db.open_order_ids(account_id, provider)
        save_json(archive_path, archive)
        return result

    def cancel_active_job(
        self,
        job_id: str,
        wait: bool = True,
        timeout: float = 5.0,
    ) -> bool:
        with self.lock:
            active_job = self.active_jobs.get(job_id)
        if active_job is None:
            return False

        active_job.cancel_token.cancel()
        if wait and active_job.thread is not None and active_job.thread.is_alive():
            active_job.finished_event.wait(timeout=timeout)
        return True

    def drop_expired_keys(self, max_age_seconds: float = 24 * 3600) -> list[str]:
        """Scenario: needs code. Drop in-memory key after ~24h, after which job becomes interrupted."""
        cutoff = time.time() - max_age_seconds
        interrupted = []
        with self.lock:
            for job_id, payload in list(self.registered_payloads.items()):
                job = get_job(self.app_db_path, job_id)
                if job and job.get("status") in (NEEDS_CODE, PAUSED):
                    if job.get("updated_at", 0) < cutoff:
                        if payload.session_copy and isinstance(payload.session_copy, dict):
                            payload.session_copy.clear()
                        payload.session_copy = None
                        payload.cipher_copy = None
                        self.registered_payloads.pop(job_id, None)
                        now = time.time()
                        update_job(
                            self.app_db_path,
                            job_id,
                            status=INTERRUPTED,
                            error_code="INTERRUPTED",
                            error_message="Verification code expired (24h timeout); key dropped",
                            finished_at=now,
                        )
                        add_job_event(
                            self.app_db_path,
                            job_id,
                            status=INTERRUPTED,
                            code="INTERRUPTED",
                            message="Verification code expired (24h timeout); key dropped",
                        )
                        interrupted.append(job_id)
            # A running job's cancellation clears its payload before pause is recorded.
            with get_db_conn(self.app_db_path) as conn:
                stale = conn.execute(
                    "SELECT id FROM jobs WHERE status IN (?, ?) AND updated_at < ?",
                    (PAUSED, NEEDS_CODE, cutoff),
                ).fetchall()
                for row in stale:
                    job_id = row["id"]
                    if job_id in self.registered_payloads:
                        continue
                    now = time.time()
                    changed = conn.execute(
                        "UPDATE jobs SET status = ?, error_code = ?, error_message = ?, "
                        "finished_at = ?, updated_at = ? WHERE id = ? AND status IN (?, ?) AND updated_at < ?",
                        (INTERRUPTED, "INTERRUPTED", "Paused job expired; key dropped",
                         now, now, job_id, PAUSED, NEEDS_CODE, cutoff),
                    ).rowcount
                    if changed:
                        conn.execute(
                            "INSERT INTO job_events (job_id, status, code, message, created_at) "
                            "VALUES (?, ?, ?, ?, ?)",
                            (job_id, INTERRUPTED, "INTERRUPTED", "Paused job expired; key dropped", now),
                        )
                        interrupted.append(job_id)
                conn.commit()
        return interrupted


class JobControl:
    """High-level control API for background jobs (AC-09)."""

    _instances: list[JobControl] = []

    def __init__(
        self,
        app_db_path: Path | str,
        data_root: Path | str | None = None,
        runner: JobRunner | None = None,
    ) -> None:
        self.app_db_path = Path(app_db_path)
        self.data_root = Path(data_root) if data_root is not None else None
        init_jobs_tables(self.app_db_path)
        self.runner = runner or JobRunner(self.app_db_path, self.data_root)
        JobControl._instances.append(self)

    def submit_sync(
        self,
        user_id: str,
        account_id: str,
        provider: str,
        *,
        provider_id: str | None = None,
        mode: str = "new",
        session: dict[str, Any] | None = None,
        cipher: Any | None = None,
        provider_instance: Any | None = None,
    ) -> dict[str, Any]:
        """Enqueue a background sync job subject to DEC-010 per-user limits."""
        # 1. Enforce DEC-010 limits: 1 running, 2 queued per user
        running_cnt, queued_cnt = count_user_active_jobs(self.app_db_path, user_id)

        # If user already has 1 running and 2 queued, or 2 queued jobs, cannot queue more
        if queued_cnt >= MAX_QUEUED_PER_USER:
            raise JobLimitExceeded(
                f"User job limit exceeded: at most {MAX_QUEUED_PER_USER} queued jobs allowed."
            )
        if running_cnt >= MAX_RUNNING_PER_USER and queued_cnt >= MAX_QUEUED_PER_USER:
            raise JobLimitExceeded(
                f"User job limit exceeded: {MAX_RUNNING_PER_USER} running, {MAX_QUEUED_PER_USER} queued allowed."
            )

        job_id = str(uuid.uuid4())

        # In-memory copies of session and cipher for the job
        session_copy = copy.deepcopy(session) if session is not None else None
        cipher_copy = cipher  # Shared cipher capability retained for this job

        payload = JobPayload(
            job_id=job_id,
            user_id=user_id,
            account_id=account_id,
            provider=provider,
            provider_id=provider_id,
            mode=mode,
            session_copy=session_copy,
            cipher_copy=cipher_copy,
            provider_instance=provider_instance,
        )

        try:
            job = self._create_job(job_id, user_id, account_id, provider, provider_id, mode)
        except sqlite3.IntegrityError as exc:  # partial unique index: one active job per account and provider
            raise AccountBusy() from exc

        self.runner.register_job(payload)
        self.runner.process_queue()

        return job

    def _create_job(self, job_id, user_id, account_id, provider, provider_id, mode):
        return create_job(
            self.app_db_path,
            job_id=job_id,
            user_id=user_id,
            account_id=account_id,
            provider=provider,
            provider_id=provider_identity(provider_id) if provider_id else None,
            mode=mode,
            status=QUEUED,
        )

    submit = submit_sync
    enqueue = submit_sync

    def _with_queue_info(self, jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Add queue_position (1 = next) and eta_seconds (None without history) to queued jobs."""
        if not any(j["status"] == QUEUED for j in jobs):
            return jobs
        order = {j["id"]: n for n, j in enumerate(fair_order(list_jobs(self.app_db_path, status=QUEUED, limit=500)), 1)}
        for job in jobs:
            if job["status"] == QUEUED and job["id"] in order:
                job["queue_position"] = order[job["id"]]
                avg = avg_job_seconds(self.app_db_path, job["provider"])
                slots = self.runner.provider_concurrency.get(job["provider"], 1)
                job["eta_seconds"] = round(order[job["id"]] * avg / slots) if avg else None
        return jobs

    def get_job(self, job_id: str, user_id: str | None = None) -> dict[str, Any]:
        job = get_job(self.app_db_path, job_id, user_id=user_id)
        if job is None:
            raise JobNotFoundError(f"Job {job_id} not found.")
        return self._with_queue_info([job])[0]

    def list_jobs(
        self,
        user_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return self._with_queue_info(list_jobs(self.app_db_path, user_id=user_id, status=status, limit=limit))

    def get_events(
        self,
        job_id: str,
        user_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        # Verify access
        self.get_job(job_id, user_id=user_id)
        return get_job_events(self.app_db_path, job_id, limit=limit)

    def cancel_job(
        self,
        job_id: str,
        user_id: str | None = None,
        wait: bool = True,
        timeout: float = 5.0,
    ) -> dict[str, Any]:
        """Cancel a running or queued job within one request (AC-09 cancel scenario)."""
        job = self.get_job(job_id, user_id=user_id)
        if job["status"] in TERMINAL_STATES:
            return job

        now = time.time()
        cancelled_active = self.runner.cancel_active_job(job_id, wait=wait, timeout=timeout)
        if not cancelled_active:
            # Job was queued or paused in DB
            update_job(
                self.app_db_path,
                job_id,
                status=CANCELLED,
                error_code="CANCELLED",
                error_message="Job cancelled before running",
                finished_at=now,
                resumable=1,
            )
            add_job_event(
                self.app_db_path,
                job_id,
                status=CANCELLED,
                code="CANCELLED",
                message="Job cancelled",
            )
            with self.runner.lock:
                self.runner.registered_payloads.pop(job_id, None)
            self.runner.process_queue()

        return self.get_job(job_id)

    def cancel_user(self_or_user_id: Any, user_id: str | None = None) -> int:
        """Cancel all active (running/queued/paused/needs_code) jobs for a user."""
        if user_id is None:
            actual_user_id = str(self_or_user_id)
            total = 0
            for inst in list(JobControl._instances):
                total += inst.cancel_user(actual_user_id)
            return total
        self = self_or_user_id
        with get_db_conn(self.app_db_path) as conn:
            all_user_jobs = conn.execute(
                "SELECT id, status FROM jobs WHERE user_id = ?", (user_id,)
            ).fetchall()
        cancelled = 0
        for j in all_user_jobs:
            if j["status"] in ACTIVE_STATES:
                self.cancel_job(j["id"], user_id=user_id, wait=True)
                cancelled += 1
        return cancelled

    def pause_job(self, job_id: str, user_id: str | None = None) -> dict[str, Any]:
        job = self.get_job(job_id, user_id=user_id)
        if job["status"] in TERMINAL_STATES:
            return job
        if job["status"] == RUNNING:
            self.runner.cancel_active_job(job_id, wait=True)
        update_job(self.app_db_path, job_id, status=PAUSED)
        add_job_event(self.app_db_path, job_id, status=PAUSED, message="Job paused")
        self.runner.process_queue()
        return self.get_job(job_id)

    def resume_job(
        self,
        job_id: str,
        user_id: str | None = None,
        session: dict[str, Any] | None = None,
        cipher: Any | None = None,
        provider_instance: Any | None = None,
        provider_id: str | None = None,
    ) -> dict[str, Any]:
        job = self.get_job(job_id, user_id=user_id)
        if job["status"] not in (PAUSED, NEEDS_CODE, INTERRUPTED, CANCELLED, FAILED):
            return job

        session_copy = copy.deepcopy(session) if session is not None else None
        payload = JobPayload(
            job_id=job_id,
            user_id=job["user_id"],
            account_id=job["account_id"],
            provider=job["provider"],
            provider_id=provider_id,
            mode=job.get("mode", "incremental"),
            session_copy=session_copy,
            cipher_copy=cipher,
            provider_instance=provider_instance,
        )
        self.runner.register_job(payload)
        try:
            update_job(self.app_db_path, job_id, status=QUEUED, error_code=None, error_message=None)
        except sqlite3.IntegrityError as exc:
            self.runner.registered_payloads.pop(job_id, None)
            raise AccountBusy() from exc
        add_job_event(self.app_db_path, job_id, status=QUEUED, message="Job resumed")
        self.runner.process_queue()
        return self.get_job(job_id)

    def retry_import(self, job_id: str, user_id: str | None = None) -> dict[str, Any]:
        """Run the import again for a job whose fetch finished but whose import failed; safe to repeat."""
        job = self.get_job(job_id, user_id=user_id)
        if job["status"] != FAILED or job.get("error_code") != "IMPORT_FAILED":
            raise KhataError("This job has no failed import to retry.")
        runner = self.runner
        storage = Storage(user_root(runner.data_root, job["user_id"]))
        archive_path = storage.account_path(job["account_id"]) / f"{job['provider']}-history.json"
        update_job(self.app_db_path, job_id, phase="importing")
        try:
            runner.import_account(storage, job["user_id"], job["account_id"], job["provider"], incremental=True, archive_path=archive_path)
        except Exception as exc:
            update_job(self.app_db_path, job_id, phase="done", error_code="IMPORT_FAILED")
            raise KhataError("Import failed again; nothing was changed.") from exc
        runner.finish_done(job_id, time.time(), job.get("counts"))
        return self.get_job(job_id)

    def _reconcile_partial_receipt(self, conn: Any, job: dict[str, Any]) -> None:
        if not self.data_root:
            return
        path = user_database(self.data_root, job["user_id"])
        if path.is_file():
            with AnalyticsDB(path).connection() as analytics:
                receipt = analytics.execute("SELECT 1 FROM partial_import_receipts WHERE job_id = ?", (job["id"],)).fetchone()
            if receipt:
                conn.execute("UPDATE jobs SET partial_decision = 'imported', updated_at = ? WHERE id = ?", (time.time(), job["id"]))
                conn.commit()
                job["partial_decision"] = "imported"

    def use_partial(self, job_id: str, user_id: str | None = None) -> dict[str, Any]:
        """Scenario: import once. Import partial history for a failed/cancelled job."""
        with get_db_conn(self.app_db_path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            job = get_job(conn, job_id, user_id=user_id)
            if not job:
                raise JobNotFoundError()
            self._reconcile_partial_receipt(conn, job)
            if job["partial_decision"] == "discarded":
                raise KhataError("Partial data was discarded.")
            if job["partial_decision"] == "imported":
                return {"total": 0, "imported": 0}
            if job["status"] not in (FAILED, CANCELLED):
                raise KhataError("Partial data is available only for failed or cancelled jobs.")
            if not self.data_root:
                raise KhataError("Cannot import: data_root not configured.")
            storage = Storage(user_root(self.data_root, job["user_id"]))
            user_db_path = user_database(self.data_root, job["user_id"])
            user_db_path.parent.mkdir(parents=True, exist_ok=True)
            result = AnalyticsDB(user_db_path).ingest_account(storage, job["account_id"], incremental=True, partial_job_id=job_id)
            conn.execute("UPDATE jobs SET partial_decision = 'imported', updated_at = ? WHERE id = ?", (time.time(), job_id))
            conn.execute("INSERT INTO job_events (job_id, status, code, message, created_at) VALUES (?, ?, ?, ?, ?)",
                         (job_id, job["status"], "IMPORTED_PARTIAL", f"Partial history imported: {result.get('total', 0)} orders", time.time()))
            conn.commit()
            return result

    def discard_partial(self, job_id: str, user_id: str | None = None) -> dict[str, Any]:
        with get_db_conn(self.app_db_path) as conn:
            conn.execute("BEGIN IMMEDIATE")
            job = get_job(conn, job_id, user_id=user_id)
            if not job:
                raise JobNotFoundError()
            self._reconcile_partial_receipt(conn, job)
            if job["partial_decision"] == "pending":
                if job["status"] not in (FAILED, CANCELLED):
                    raise KhataError("Partial data is available only for failed or cancelled jobs.")
                conn.execute("UPDATE jobs SET partial_decision = 'discarded', updated_at = ? WHERE id = ?", (time.time(), job_id))
                conn.commit()
            return get_job(conn, job_id) or job

    def prune_events(self, retention_seconds: float = 7 * 86400) -> int:
        return prune_job_events(self.app_db_path, retention_seconds)

    def drop_expired_keys(self, max_age_seconds: float = 24 * 3600) -> list[str]:
        return self.runner.drop_expired_keys(max_age_seconds)

