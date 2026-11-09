"""Job lifecycle states and status transitions (AC-09)."""

from __future__ import annotations

# Canonical job statuses
QUEUED = "queued"
RUNNING = "running"
NEEDS_CODE = "needs_code"
PAUSED = "paused"
DONE = "done"
FAILED = "failed"
CANCELLED = "cancelled"
INTERRUPTED = "interrupted"

ALL_STATES = frozenset({
    QUEUED,
    RUNNING,
    NEEDS_CODE,
    PAUSED,
    DONE,
    FAILED,
    CANCELLED,
    INTERRUPTED,
})

TERMINAL_STATES = frozenset({
    DONE,
    FAILED,
    CANCELLED,
    INTERRUPTED,
})

ACTIVE_STATES = frozenset({
    QUEUED,
    RUNNING,
    NEEDS_CODE,
    PAUSED,
})
