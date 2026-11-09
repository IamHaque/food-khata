"""Background sync job control routes (AC-10)."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from food_khata.contracts import KhataError
from food_khata.jobs.runner import JobControl, JobLimitExceeded, JobNotFoundError
from food_khata.serve.routes_accounts import (
    _get_account_meta,
    get_current_user_id,
    get_user_cipher,
    get_user_storage,
)
from food_khata.serve.schemas_sync import (
    CreateSyncJobRequest,
    JobEventOut,
    SubmitCodeRequest,
    SyncJobResponse,
    UsePartialResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])


def get_job_control(request: Request) -> JobControl:
    """Retrieve JobControl instance from app state."""
    jc = getattr(request.app.state, "job_control", None)
    if jc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "service_unavailable", "message": "Job runner not initialized."},
        )
    return jc


@router.get("/jobs", response_model=list[SyncJobResponse])
def list_sync_jobs(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
    status: str | None = None,
    limit: int = 100,
):
    """List background sync jobs for the authenticated user."""
    jobs = control.list_jobs(user_id=user_id, status=status, limit=limit)
    return [SyncJobResponse(**j) for j in jobs]


@router.post("/jobs", response_model=SyncJobResponse)
def create_sync_job(
    data: CreateSyncJobRequest,
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Start a background sync job subject to DEC-010 limits (1 running, 2 queued)."""
    storage = get_user_storage(request, user_id)
    account_meta = _get_account_meta(storage, data.account_id)
    if not account_meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Account '{data.account_id}' not found."},
        )

    providers = account_meta.get("providers", {})
    provider = next(iter(providers.keys()), "zomato")
    provider_id = providers.get(provider)
    phone = account_meta.get("phone")
    session = storage.session(data.account_id, provider)
    cipher = get_user_cipher(request, user_id)

    factory = getattr(request.app.state, "provider_factory", None)
    provider_inst = None
    if factory:
        try:
            provider_inst = factory(provider, phone=phone, account_id=provider_id)
        except TypeError:
            try:
                provider_inst = factory(provider, phone=phone)
            except TypeError:
                provider_inst = factory(provider)

    # Map mode alias: 'all' -> 'full', 'missing' -> 'repair', 'new' -> 'incremental'
    mode_map = {
        "new": "incremental",
        "missing": "repair",
        "all": "full",
        "incremental": "incremental",
        "repair": "repair",
        "full": "full",
    }
    effective_mode = mode_map.get(data.mode, data.mode)

    try:
        job = control.submit_sync(
            user_id=user_id,
            account_id=data.account_id,
            provider=provider,
            provider_id=provider_id,
            mode=effective_mode,
            session=session,
            cipher=cipher,
            provider_instance=provider_inst,
        )
    except JobLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "LIMIT_EXCEEDED", "message": str(exc)},
        ) from exc

    return SyncJobResponse(**job)


@router.get("/jobs/{job_id}", response_model=SyncJobResponse)
def get_sync_job(
    job_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Get status and progress of a background job. Returns 404 if not found or unauthorized."""
    try:
        job = control.get_job(job_id, user_id=user_id)
    except JobNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."},
        ) from err
    return SyncJobResponse(**job)


@router.get("/jobs/{job_id}/events", response_model=list[JobEventOut])
def get_sync_job_events(
    job_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
    limit: int = 50,
):
    """Get recent events stream for polling job progress. Returns 404 if not user's job."""
    try:
        events = control.get_events(job_id, user_id=user_id, limit=limit)
    except JobNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."},
        ) from err
    return [JobEventOut(**ev) for ev in events]


@router.post("/jobs/{job_id}/cancel", response_model=SyncJobResponse)
def cancel_sync_job(
    job_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Cancel a running or queued job within one request."""
    try:
        job = control.cancel_job(job_id, user_id=user_id, wait=True)
    except JobNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."},
        ) from err
    return SyncJobResponse(**job)


@router.post("/jobs/{job_id}/pause", response_model=SyncJobResponse)
def pause_sync_job(
    job_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Pause an active job."""
    try:
        job = control.pause_job(job_id, user_id=user_id)
    except JobNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."},
        ) from err
    return SyncJobResponse(**job)


@router.post("/jobs/{job_id}/resume", response_model=SyncJobResponse)
def resume_sync_job(
    job_id: str,
    request: Request,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Resume a paused, interrupted, or failed job."""
    try:
        job = control.get_job(job_id, user_id=user_id)
    except JobNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."},
        ) from err

    storage = get_user_storage(request, user_id)
    account_meta = _get_account_meta(storage, job["account_id"])
    phone = account_meta.get("phone") if account_meta else None
    provider_id = job.get("provider_id")
    session = storage.session(job["account_id"], job["provider"])
    cipher = get_user_cipher(request, user_id)

    factory = getattr(request.app.state, "provider_factory", None)
    provider_inst = None
    if factory:
        try:
            provider_inst = factory(job["provider"], phone=phone, account_id=provider_id)
        except TypeError:
            try:
                provider_inst = factory(job["provider"], phone=phone)
            except TypeError:
                provider_inst = factory(job["provider"])

    resumed = control.resume_job(
        job_id,
        user_id=user_id,
        session=session,
        cipher=cipher,
        provider_instance=provider_inst,
    )
    return SyncJobResponse(**resumed)


@router.post("/jobs/{job_id}/code", response_model=SyncJobResponse)
def submit_sync_job_code(
    job_id: str,
    data: SubmitCodeRequest,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Submit OTP code for a job paused in needs_code state."""
    try:
        job = control.submit_code(job_id, data.code.strip(), user_id=user_id)
    except JobNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."},
        ) from err
    except KhataError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CODE", "message": str(exc)},
        ) from exc
    return SyncJobResponse(**job)


@router.post("/jobs/{job_id}/use-partial", response_model=UsePartialResponse)
def use_partial_sync(
    job_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Scenario: import once. Ingest partial archive from failed or cancelled job."""
    try:
        result = control.use_partial(job_id, user_id=user_id)
    except JobNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."},
        ) from err
    except KhataError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "IMPORT_FAILED", "message": str(exc)},
        ) from exc
    return UsePartialResponse(
        status="ok",
        total=result.get("total", 0),
        imported=result.get("imported", 0),
        result=result,
    )


@router.post("/jobs/{job_id}/discard-partial", response_model=SyncJobResponse)
def discard_partial_sync(
    job_id: str,
    user_id: Annotated[str, Depends(get_current_user_id)],
    control: Annotated[JobControl, Depends(get_job_control)],
):
    """Record the decision to leave partial history out of the dashboard."""
    try:
        return SyncJobResponse(**control.discard_partial(job_id, user_id=user_id))
    except JobNotFoundError as err:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": f"Job '{job_id}' not found."}) from err
    except KhataError as exc:
        raise HTTPException(status_code=400, detail={"code": "DISCARD_FAILED", "message": str(exc)}) from exc
