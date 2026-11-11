"""Schemas for Accounts and Provider Linking API (AC-10)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AccountOut(BaseModel):
    id: str = Field(description="Account local ID")
    local_id: str = Field(description="Account local ID")
    provider: str = Field(description="Provider name (zomato, swiggy, fake)")
    phone: str | None = Field(default=None, description="Linked phone number")
    provider_id: str | None = Field(default=None, description="External provider account ID")
    status: str = Field(default="ok", description="Session status: ok, expiring, expired")
    last_sync: str | None = Field(default=None, description="Timestamp of last successful sync")
    order_count: int = Field(default=0, description="Total order count")
    name: str | None = Field(default=None, description="Optional friendly account label")
    has_session: bool = Field(default=False, description="Whether active session exists")


class LinkStartRequest(BaseModel):
    provider: str = Field(..., description="Provider name: zomato, swiggy, or fake")
    phone: str = Field(..., description="Phone number to link")


class LinkStartResponse(BaseModel):
    handle: str = Field(..., description="Opaque two-step linking handle (never contains OTP code)")
    expires_at: float = Field(..., description="Timestamp when the linking handle expires (10m TTL)")


class LinkVerifyRequest(BaseModel):
    handle: str = Field(..., description="Two-step linking handle from start_linking")
    code: str = Field(..., description="Verification OTP code")
    account_name: str | None = Field(default=None, description="Optional account name")


class LinkVerifyResponse(BaseModel):
    id: str = Field(..., description="Bound account local ID")
    local_id: str = Field(..., description="Bound account local ID")
    provider: str = Field(..., description="Provider name")
    provider_id: str = Field(..., description="External provider account ID")
    phone: str | None = Field(default=None, description="Linked phone number")
    status: str = Field(default="ok", description="Account session status")
    name: str | None = Field(default=None, description="Account name")
    added_to_existing: bool = Field(default=False, description="True when the phone already had an account (another provider was added)")


class VerifyAgainRequest(BaseModel):
    code: str | None = Field(default=None, description="Optional OTP code if verifying in one call")
    provider: str | None = Field(default=None, description="Provider to verify; required when the account has several")


class VerifyAgainResponse(BaseModel):
    handle: str = Field(..., description="Opaque linking handle for re-verification")
    expires_at: float = Field(..., description="Handle expiration timestamp")
    status: str = Field(default="pending", description="Re-verification status")


class DisconnectRequest(BaseModel):
    wipe_data: bool = Field(default=False, description="Whether to wipe stored orders and history files")
    provider: str | None = Field(default=None, description="Provider to disconnect; required when the account has several")


class DisconnectResponse(BaseModel):
    status: str = Field(default="ok", description="Disconnection status")
    account_id: str = Field(..., description="Disconnected account local ID")
    wiped: bool = Field(default=False, description="Whether account data was wiped")
