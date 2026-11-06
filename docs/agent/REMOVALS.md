# Removals

No removals approved or performed. Approval is required before executing either proposal.

## R1: retire the legacy browser UI and Recharts — proposed

Candidates: `dashboard-ui/src/main.jsx`, `style.css`, `model.js`, `loader.js`, their two legacy Node test files, and the legacy-only `scripts/browser-test.mjs` and `scripts/baseline-test.mjs`. Update `src/entry.tsx` to remove the `/legacy` branch and remove the Recharts dependency only after checking all imports (including vendored chart primitives). Preserve shared house components unless separately inventoried and approved. Update npm test scripts and references as part of the dedicated removal commit.

Replacement: typed seven-route API UI, server metric/filter modules, Ledger/modal, synthetic foundation regression harness. Evidence: local real-data parity reports zero mismatches; Python105+10, frontend19, type/lint/build, retained legacy browser suite and56 synthetic page/theme/width axe/screenshots pass. Screenshots are local and ignored. No approval inferred from implementation authorization.

Risk: legacy file import/export recovery is intentionally available only in `/legacy`; removing it retires that browser workflow. The CLI export remains supported unless R2 is separately approved. Legacy style.css also provides Tailwind utilities used by house primitives; before removal move the required shared directives/tokens to a retained stylesheet and rerun every browser check. Do not remove it blindly.

## R2: retire CLI export/public-data loading — proposed, separate decision

Scope requires a separate exact inventory of `food_khata/dashboard.py`, CLI dispatch/tests and README references before any deletion. No deletion is authorized by this document. Protected sync/ingest/session modules are excluded. Replacement: local read-only serve API. Evidence: the new UI never fetches public/data or source exports; server static asset containment tests reject those paths.

Risk: removes an existing offline export capability. Retain until the owner explicitly approves retirement. No source data files are to be deleted by either proposal.
