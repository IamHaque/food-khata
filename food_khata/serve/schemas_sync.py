"""Schemas for Background Sync Control API (AC-10)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class CreateSyncJobRequest(BaseModel):
    account_id: str = Field(..., description="Linked account local ID to sync")
    provider: str | None = Field(default=None, description="Provider to sync; required when the account has several")
    mode: Literal["new", "missing", "all", "incremental", "repair", "full"] = Field(
        default="new",
        description="Sync mode: 'new' (incremental), 'missing' (repair), or 'all' (full scan)",
    )


class SyncJobResponse(BaseModel):
    id: str = Field(..., description="Unique background job identifier")
    user_id: str = Field(..., description="Owning user identifier")
    account_id: str = Field(..., description="Account identifier")
    provider: str = Field(..., description="Provider name")
    provider_id: str | None = Field(default=None, description="External provider account ID")
    mode: str = Field(default="new", description="Sync execution mode")
    status: str = Field(..., description="Job status (queued, running, done, failed, paused, needs_code, cancelled, interrupted)")
    partial_decision: Literal["pending", "imported", "discarded"] = Field(default="pending", description="Decision for partial history")
    phase: str | None = Field(default=None, description="Current sync phase")
    page: int | None = Field(default=None, description="Last scanned page")
    counts: dict[str, Any] | None = Field(default=None, description="Order and detail counts")
    progress: dict[str, Any] | None = Field(default=None, description="Current progress summary")
    started_at: float | None = Field(default=None, description="Timestamp job started running")
    finished_at: float | None = Field(default=None, description="Timestamp job reached terminal state")
    error_code: str | None = Field(default=None, description="Error code if job failed/needs_code")
    error_message: str | None = Field(default=None, description="Error message if job failed/needs_code")
    error: dict[str, Any] | None = Field(default=None, description="Standard error object if failed")
    created_at: float | None = Field(default=None, description="Timestamp job was enqueued")
    updated_at: float | None = Field(default=None, description="Timestamp job state was last updated")
    resumable: int | bool | None = Field(default=None, description="Whether job can be resumed")


class JobEventOut(BaseModel):
    id: int | None = Field(default=None, description="Event sequence number")
    job_id: str = Field(..., description="Associated job ID")
    status: str = Field(..., description="Job status at time of event")
    phase: str | None = Field(default=None, description="Sync phase")
    page: int | None = Field(default=None, description="Page index")
    counts: dict[str, Any] | None = Field(default=None, description="Counts snapshot")
    code: str | None = Field(default=None, description="Event message or error code")
    message: str | None = Field(default=None, description="Human-readable event message")
    created_at: float | None = Field(default=None, description="Timestamp event was logged")


class SubmitCodeRequest(BaseModel):
    code: str = Field(..., description="Verification code / OTP from provider")


class UsePartialResponse(BaseModel):
    status: str = Field(default="ok", description="Import status")
    total: int = Field(default=0, description="Total records imported into analytics database")
    imported: int = Field(default=0, description="Imported count")
    result: dict[str, Any] | None = Field(default=None, description="Full ingest result details")
