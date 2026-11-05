# E1 API implementation handoff

`create_app(db_path: Path | str, dev: bool = False, dist_path: Path | str | None = None) -> FastAPI`; `serve(host: str, port: int, db_path: Path, dev: bool = False) -> int`.
Health scopes import coverage by account/platform and row statistics by filtered orders; it exposes null rates, duplicate excess rows, reconciliation differences over INR 1, and verified percentage without lifetime warnings.
Filter options use account scope, include restaurant IDs/names and a separate masked `all_accounts` selector; `statuses=` means all statuses on GET, while repeated statuses and POST `[]` remain supported.
Ledger and bills expose stored financial fields, safely parsed nullable JSON, and rounded money; restaurant grouping supports `merged` normalized name/locality keys and `listing` restaurant IDs; item leaders include weighted monthly unit prices.
Errors use sanitized envelopes; connection, BEGIN, and execution busy errors retry with bounded attempts; dashboard caching is locked, bounded, and rechecks DB/WAL versions around the transaction build.
CLI validates direct-call ports and handles startup errors and interrupts; the OpenAPI contract was regenerated without opening a DB.
Synthetic verification: **79 passed, 10 subtests passed, 1 Starlette/httpx deprecation warning**; Ruff check passed on owned Python files. Tests include synthetic WAL commits, concurrency, retry exhaustion, scope, rounding and privacy behavior.
Remaining: chart datasets beyond monthly are a separate task; browser/frontend work and real-data parity were not run. Static serving remains limited to standard Vite assets and selected root files.
