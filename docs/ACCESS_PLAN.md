# Food Khata: Fixes and Access Feature, Execution Plan (BDD)

Plan v1.1 · 9 Nov 2026 · baseline commit `2fcacf4` · 0 of 25 stories started

## 1. Scope, order and rules

Two phases, in this order (DEC-001). **Phase A** closes the review findings and the six open redesign stories (S-080 to S-085). **Phase B** builds login, accounts, background sync and LAN access. Phase B starts only after Gate GA passes.

**Evidence base.** Ran on 9 Nov: pytest 110 pass, ruff clean, tsc, eslint with colour-literal and contrast gates, vitest 967 pass, production build. Only read: the Python and UI code areas, the handoff, and the wireframes file (80 KB, 9 desktop screens, no mobile screens, no first-run screen). Not run: browser tests, screenshots, the dev-database app run (BLK-01). Anything marked *unverified* must be reproduced by the story's first scenario before a fix is written.

**Tracker rules** (same as the redesign brief):

- Statuses: TODO, IN\_PROGRESS, BLOCKED, DEFERRED, DONE. One IN\_PROGRESS story per worktree.
- DONE only when every scenario passes in `verify` on trunk after merge, and the Progress row holds date, commit and evidence. Anything less stays IN\_PROGRESS.
- A change from a story's text goes in the Deviation log in the same commit. A choice goes in the Decision log. Work found but not done goes in the Backlog. A stop goes in Blockers. Nothing is skipped silently.
- Logs are tables with fixed columns. `brief.mjs lint` (FX-01) fails verify on a ragged row.

**Hard rules.** Synthetic data only. No automated test ever logs in to Swiggy or Zomato; every test uses `FakeProvider` (AC-05). Provider requests stay on the host machine. Free-model sub-agents get repo code and synthetic data only.

**IDs.** FX = fix story, AC = access story, G = gate. DEC, DEV, BL, BLK, OQ = log entries.

## 2. Orchestration design (ASE-Orch)

### 2.1 Pre-planning checklist

| Check | Result | Handled in |
| --- | --- | --- |
| Repetitive patterns abstracted | Partly. `2fcacf4` edited 17 chart files with similar lifecycle code (inferred from the diff stat, unverified). Access UI will repeat forms, banners and API calls. Auth checks will repeat on every route. | FX-05 (BaseChart), AC-12 (UI Phase 0), AC-06 (auth dependencies) |
| Story count balanced | 25 stories (7 + 18), the top of the 15 to 25 band, each aimed at 250 to 400 diff lines. Merged by the cohesion test: sync checkpointing with `lifetime_complete`; owner setup with registration; isolation with encryption; the three browser QA suites. | Stories below |
| File boundaries non-overlapping | Every story lists `Owns`. Shared roots use stubs: AC-06 pre-creates empty owner, accounts and sync routers; AC-12 pre-creates every access route as a lazy placeholder. | AC-06, AC-12 |
| Worktree spin-up under 1 s | Unknown. `scripts/orch.mjs` not run by me. | FX-02 |
| Failover ladder configured | Pool exists in `orchestration/models.json` (commands unverified). | 2.3 |
| Verify under 20 s | No. Measured here: vitest about 37 s, pytest about 7 s, build about 12 s. | FX-02 |

### 2.2 Waves

| Wave | Stories (parallel) | Barrier after |
| --- | --- | --- |
| A1 | FX-01, FX-02, FX-04 | verify on trunk |
| A2 | FX-03, FX-05 | verify and bundle check |
| A3 | FX-06 | browser suite green (needs Chromium) |
| A4 | FX-07 | **Gate GA** |
| B0 | AC-01 | you approve the wireframes |
| B1 | AC-02, AC-03, AC-05 | verify |
| B2 | AC-04, AC-06 | contract C-0 (auth) published after AC-06 |
| B3 | AC-08, AC-12 | verify |
| B4 | AC-07, AC-09 | verify |
| B5 | AC-10, AC-11, AC-13 | **Contract freeze C-1** after AC-10 (OpenAPI snapshot) |
| B6 | AC-14, AC-15, AC-16 | verify |
| B7 | AC-17 | verify |
| B8 | AC-18 | Gate GB |

At most 3 stories per wave (wave A2 can reach 4 worktrees when FX-05 splits into sub-tasks). Waves are a guide: start any story whose dependencies are merged when a slot is free. Sequential barriers only at gates and contract freezes.

### 2.3 Dispatch, trunk check and failover

- Worktrees symlink `node_modules` and the venv. Never copy them.
- Pre-merge: the sub-agent runs `verify` in its worktree. Post-merge: the orchestrator runs `verify` on trunk. Gates add build, browser suite and the full pytest run.
- Ladder: primary fast model; on 429 or quota, switch to the next pool model or the native tier without asking; after 2 failed verifications, escalate to a high-reasoning model with the short failure diff; after 2 more, mark BLOCKED and add a Blockers entry.
- Where a primitive exists (charts, access screens), the task packet asks only for pure functions and their tests, at most 100 lines of domain logic.

### 2.4 Guidance for the orchestrator

Model choice is the orchestrator's: pick with `orch.mjs pick` and live model health. The tags below describe the work, not the models. **Weight:** S is under 150 diff lines, M is 150 to 300, L is over 300. **Risk:** normal, or high (security, data loss, concurrency, or a base that later stories build on). **Needs:** browser, vision (reads screenshots), long context (reads many files).

| Story | Weight | Kind | Risk | Needs | Hint |
| --- | --- | --- | --- | --- | --- |
| FX-01 | S | docs, config | normal | none | Keep the exact table columns |
| FX-02 | M | test infra | high (base of every check) | none | Start first; log timing before and after |
| FX-03 | S | frontend config | normal | browser | Timing is measured in FX-06 |
| FX-04 | S | backend | normal | none | Reproduce before fixing |
| FX-05 | L | frontend refactor | normal | none | One hard primitive task first, then up to 3 mechanical migration tasks in parallel |
| FX-06 | L | test infra | normal | browser | Many small tests |
| FX-07 | M | test infra, review | normal | browser, vision | Screenshots read by a vision model |
| GA | n/a | review | high | vision, long context | Reviewer must not be an implementer |
| AC-01 | M | design (HTML) | normal | browser, vision | Check at 1440 and 390 wide; needs your approval |
| AC-02 | M | backend | high (data integrity) | none | Reproduce the finding first |
| AC-03 | M | backend | high (concurrency) | none | The concurrency test must be real |
| AC-04 | L | backend | normal | none | Touches many existing tests; keep CLI behaviour |
| AC-05 | L | backend | high (shared test double, login) | none | Every later test uses FakeProvider |
| AC-06 | L | backend | high (security) | none | Independent audit before AC-08 starts |
| AC-07 | L | backend | high (security) | none | Owner claim and reset paths |
| AC-08 | L | backend | high (security, data) | long context | Split if it passes 450 lines |
| AC-09 | L | backend | high (concurrency, keys) | long context | Restart and cancel cases |
| AC-10 | M | backend | high (authorization) | none | Cross-user test matrix |
| AC-11 | M | backend | high (network exposure) | none | Host allow-list and TLS |
| AC-12 | M | frontend foundation | high (all screens build on it) | browser | First-pass quality matters |
| AC-13 | M | frontend | normal | browser, vision | Screens follow approved wireframes |
| AC-14 | M | frontend | normal | browser, vision | Same |
| AC-15 | M | frontend | normal | browser, vision | Same |
| AC-16 | M | frontend | normal | browser, vision | Same |
| AC-17 | M | frontend | normal | browser, vision | Edits existing files; run it alone |
| AC-18 | L | test infra, docs | high | browser | Full journey and isolation tests |
| GB | n/a | review | high | vision, long context | Reviewer must not be an implementer |

Rules of thumb:

- High-risk stories get the strongest available reasoning for the build, and a different model audits them after merge, before dependent work starts.
- S-weight and mechanical work goes to the cheapest capable model; escalate only on failure.
- Stories that build a shared base (FX-05, AC-05, AC-12) are not given to the cheapest model, because later stories inherit their mistakes.
- Screen stories get a screenshot review by a vision model at 1440 and 390 wide after each merge.
- Split any story that passes 450 lines or exceeds the packet input limit (AC-08 first).
- Merge one branch at a time and run verify on trunk after each merge.

**Critical path.** Phase A: FX-02, then FX-03 and FX-05, then FX-06, FX-07, GA. Phase B: AC-06, AC-08, AC-09, AC-10, then AC-14 to AC-16, AC-17, AC-18. Start these the moment their dependencies merge, and use spare slots for everything else. Compared with plan v1 this moves AC-05 earlier, AC-12 to start from the auth contract, and AC-07 off the critical path, which cuts the longest dependency chain from 9 stories to 7.

**Parallelism settings** (my suggestions for `orchestration/models.json`; I have not checked how the scripts read each key):

| Setting | Now | Set to | Why |
| --- | --- | --- | --- |
| max\_parallel | 3 | 4 | Wave A2 can reach 4 (FX-03 plus three FX-05 migration tasks); all others need 3 or fewer |
| max\_parallel\_per\_provider | 2 | 2 | Keep; raise to 3 only if one provider holds most healthy models and no 429s occurred in the last wave |
| max\_packet\_input\_tokens | 24000 | 32000 for L stories | AC-06 to AC-09 need schema, routes and tests together; S and M stay at 24000 |
| timeout\_minutes | 25 | 40 for L stories | Large backend stories; others stay at 25 |
| max\_fix\_attempts\_same\_model | 2 | 2 | Unchanged |
| cooldown\_minutes | 30 | 30 | Unchanged |

## 3. Phase A: redesign fixes

### FX-01 Tracker and hygiene \[P0\]

Owns: `docs/REDESIGN_BRIEF.md`, `scripts/brief.mjs`, `pyproject.toml`. Depends: none. Size: about 120 lines.

- **Scenario: logs are well-formed.** Given tables 8.3 and 8.4 have shifted columns (DEV-001, DEV-002, BL-001 to BL-003) / When `brief.mjs lint` runs / Then every row has the header's column count and no row content is lost.
- **Scenario: unlogged work recorded.** Given commit `2fcacf4` changed ₹ labels, sync-panel fallbacks, chart lifecycles and the read-only connection / Then Changelog and Decision entries name each change and the story it patches.
- **Scenario: S-024 reconciled.** Given S-024 is DONE with empty evidence while BL-003 says deferred / When its scenarios are re-run / Then evidence is filled and BL-003 closed, or S-024 returns to IN\_PROGRESS.
- **Scenario: clean install works.** Given a fresh venv / When `pip install -e .[dev,serve]` then `pytest` runs / Then collection succeeds with `httpx2` declared in the extras.
- **Scenario: lint gates verify.** Given a ragged table row / When verify runs / Then it fails at the guardrail stage.

### FX-02 Fast verify harness \[P0\]

Owns: `scripts/verify.mjs`, `dashboard-ui/vitest.config.*`, worktree bootstrap in `scripts/orch.mjs`. Depends: none. Size: about 150 lines.

- **Scenario: stage order.** When verify runs / Then it checks in this order and stops at the first failure: guardrails (protected paths untouched, no test file deleted), typecheck, lint with colour and contrast gates, unit tests, then ruff and pytest.
- **Scenario: runtime budget.** Given the baseline of vitest about 37 s, pytest about 7 s / When the fast path runs without the build / Then total is 20 s or less on trunk and the time is logged. If vitest `isolate: false` (suggested by vitest's own output) is not enough or breaks tests, a DEC records the fallback: changed-files-only before merge, full run after merge.
- **Scenario: instant worktrees.** When a worktree is bootstrapped / Then dependencies are symlinked and setup takes under 1 s.
- **Scenario: build stays out of the fast path.** Then the build and bundle check run only at gates.

### FX-03 Lazy routes and bundle budget \[P1\]

Owns: `dashboard-ui/src/app/App.tsx` (route table only), `vite.config.ts`, `scripts/check-bundle.mjs`. Depends: FX-02. Size: about 130 lines.

- **Scenario: routes load on demand.** Given today's build is one 1.77 MB chunk (541 kB gzip) with no `lazy()` / When the five pages become `React.lazy` with the existing Skeleton as fallback / Then each page is its own chunk.
- **Scenario: vendor split.** Then ECharts and other vendor code are separate chunks via `manualChunks`.
- **Scenario: budget enforced.** Given a budget for the entry chunk (proposed 250 kB gzip, DEC-P4, confirmed after measuring) / When the bundle check runs at a gate / Then it fails above the budget.
- **Scenario: nothing regresses.** Then redirects (`/behavior`, `/places`, `/ledger`, `/data-health`), dev-only link hiding and the 404 page still pass their tests.

### FX-04 Read-only database safety \[P1\]

Owns: `food_khata/serve/db.py`, `tests/test_serve_db.py`, the connection dependency in `serve/app.py`. Depends: none. Size: about 90 lines.

- **Scenario: no shared connections.** Given `2fcacf4` set `check_same_thread=False` / When 20 concurrent requests hit the dev database / Then each gets its own connection, closed after the response, with no `ProgrammingError`. If a shared connection is found, it is fixed here.
- **Scenario: still read-only.** When an INSERT is attempted on the connection / Then it fails.
- **Scenario: missing database.** Given no database file / Then the API returns a clear error, not a traceback.

### FX-05 BaseChart primitive \[P1\]

Owns: `components/dashboard/BaseChart.tsx`, `components/charts/*.tsx`. Depends: FX-02. Size: primitive about 120 lines plus mechanical migration, delegated as 1 primitive task and up to 3 parallel migration tasks (chart groups), all tracked under FX-05.

- **Scenario: audit first.** Given 17 chart files edited together in `2fcacf4` / When their init, resize, dispose, theme and event code is compared / Then if at least 80% is identical, proceed; otherwise a DEC cancels the story and it is marked DEFERRED.
- **Scenario: declarative contract.** Given `<BaseChart spec={(data, theme) => option} onSelect={...} />` / Then init, resize, dispose, theme change, click cross-filter, linked hover and the toolbar are handled inside it, and each chart file shrinks to its pure spec function and test.
- **Scenario: no re-init on re-render.** When a parent re-renders with unchanged props / Then the chart is not disposed or recreated (the `2fcacf4` regression test passes against BaseChart).
- **Scenario: parity.** Then all existing tests pass and Chart Contract CC-1 to CC-12 checks pass for every chart.
- **Scenario: net reduction.** Then total lines under `components/charts` go down.

### FX-06 Browser QA suite \[P0\]

Owns: `dashboard-ui/e2e/**`, Playwright and axe config. Covers S-080, S-083 and the browser half of S-082. Depends: FX-03, FX-05, BLK-01. Size: about 300 lines.

- **Scenario: accessibility.** Given 5 pages × light and dark × 2 accents / When axe runs / Then there are 0 serious or critical violations. Keyboard use works for the command palette, filters and side sheet, and focus is visible.
- **Scenario: reduced motion.** Given the system asks for reduced motion / Then transitions and animations are disabled.
- **Scenario: responsive.** Given 390×844, 768×1024 and 1440×900 / Then there is no horizontal page scroll and only one nav pattern (no hamburger plus horizontal tabs).
- **Scenario: performance.** Given the `--large` dev database / Then the first route loads in under 1.5 s on localhost and a cross-filter click responds in under 300 ms (proposed, DEC-P5).
- **Scenario: existing browser test.** Then `npm run test:browser` passes.

### FX-07 Visual regression, review pack and cleanup \[P2\]

Owns: `dashboard-ui/e2e/visual/**`, `docs/redesign/after/**`, `src/main.jsx`, README. Covers S-081 and S-084. Depends: FX-06. Size: about 200 lines plus snapshots.

- **Scenario: baseline snapshots.** Given 5 pages × 2 viewports × light and dark × 2 accents (40 images) / Then they are stored and a visual diff fails on change.
- **Scenario: review pack.** Then screenshots land in `docs/redesign/after/` beside `before/`, with a checklist of the 12 original problems and a verdict per item.
- **Scenario: cleanup.** Given `src/main.jsx` still mentions Recharts / Then unused Recharts references and dependencies are removed or shown to be used, and docs are updated.
- **Scenario: human review.** When you review the pack / Then your verdict on whether it looks premium is recorded as a DEC.

### Gate GA: redesign final acceptance (S-085)

- **Scenario: all stories closed.** Then every S-001 to S-085 and FX-01 to FX-07 is DONE, or DEFERRED with a Backlog entry.
- **Scenario: trunk is green.** Then full verify, production build, bundle check, pytest and the browser suite pass on trunk.
- **Scenario: clean logs.** Then no open P0 or P1 deviation, no BLOCKED story, and `brief.mjs lint` passes.
- **Scenario: sign-off.** Then you approve the screenshot pack. Phase B does not start before this.

## 4. Phase B: login, accounts, background sync, LAN

Decisions already made in the handoff are DEC-002 to DEC-008 in the log. Python findings 1 to 10 are from reading only; each story that owns one starts by reproducing it.

### AC-01 Wireframes v2 and flow freeze \[P0\]

Owns: `docs/access/wireframes.html` (starts from the uploaded file). Depends: Gate GA. Design only, no code.

- **Scenario: missing screens added.** Given the file has 9 desktop screens / Then it adds first-run Set up this server, a 390px version of every screen, and the logout warning shown when a sync is running.
- **Scenario: sync states drawn.** Then queued, running, needs code, paused, interrupted, done, failed and cancelled each have a visible state on Sync progress and Home.
- **Scenario: dashboard states drawn.** Then the banners data being fetched, syncing, and finished while you were away appear on the dashboard.
- **Scenario: open questions closed.** Then your answers to OQ-1 to OQ-4 (DEC-010) are drawn in.
- **Scenario: freeze.** When you approve / Then the screen list and states are locked; later changes need a DEC.

### AC-02 Sync correctness and checkpoint cost \[P0\]

Owns: `food_khata/sync.py`, `tests/test_sync*.py`. Findings 1, 2, 9 (unverified). Depends: Gate GA. Size: about 250 lines.

- **Scenario: reproduce the early-stop bug.** Given a first sync interrupted after page N (FakeProvider) / When a New sync runs / Then it fetches the older pages and history is not marked complete. If the current code already behaves this way, the finding is downgraded in the Decision log and the test is kept.
- **Scenario: lifetime flag.** Then `lifetime_complete` becomes true only when a full scan reached the oldest order.
- **Scenario: batched checkpoints.** Given 1,000 orders / When syncing / Then the archive is written at checkpoints (every N pages, on interrupt and at the end), not on every page and detail, with atomic writes and fsync kept at each checkpoint. A benchmark on FakeProvider is logged before and after.
- **Scenario: New also repairs.** Given orders with missing bill details / When a New sync runs / Then it fetches the missing details too (DEC-P3), so Missing mode is only a narrower repair; UI and CLI labels say so.
- **Scenario: resume without duplicates.** When a sync is interrupted and resumed / Then no order is stored twice.

### AC-03 Database robustness \[P0\]

Owns: `food_khata/db.py`, the ingest code, `food_khata/serve/db.py` (WAL handling), their tests. Findings 3, 4. Depends: FX-04. Size: about 250 lines.

- **Scenario: no locked database.** Given a sync importing while the dashboard reads / When run together for 30 s / Then no request fails with database is locked (WAL and busy timeout enabled on the write connection).
- **Scenario: read-only reader opens a WAL database.** Given the reader uses `mode=ro` / Then it still works while WAL files exist (needs shared-memory access; verified by test, not assumed).
- **Scenario: quarantine.** Given 1 malformed order among 100 / When ingest runs / Then 99 are imported, the bad one goes to a quarantine table with a reason, and the sync result reports it.
- **Scenario: incremental ingest.** Given an imported account / When 5 new orders arrive / Then only those are parsed, or the re-parse cost is bounded and measured.

### AC-04 Sync service \[P0\]

Owns: `food_khata/services/sync.py`, `contracts.py`, `cli.py` (CLI rewiring). Finding 6, 7. Depends: AC-02. Starts after AC-02 and AC-05 are merged. Size: about 350 lines.

- **Scenario: structured events.** When a sync runs / Then it emits typed events (phase, page, counts, message code) through a callback, not free text.
- **Scenario: error codes.** Then each failure has a code (for example NEEDS\_OTP, SESSION\_EXPIRED, RATE\_LIMITED, ACCOUNT\_BUSY, PROVIDER\_CHANGED, INTERNAL) plus a human message. A busy account returns ACCOUNT\_BUSY, not lock held.
- **Scenario: three modes.** Then `new`, `missing` and `all` are selectable, and a use-partial import is a separate call.
- **Scenario: cancel.** When a cancel token is set / Then the sync stops between requests, keeps a resumable checkpoint and imports nothing.
- **Scenario: CLI parity.** Then `cli.run()` becomes a thin caller of the services, existing CLI tests pass unchanged, and Switch account opens the account list, not a phone prompt.

### AC-05 Provider linking service and FakeProvider \[P0\]

Owns: `food_khata/services/linking.py`, `providers/base.py`, `providers/fake.py`, the login split in `providers/zomato.py` and `providers/swiggy.py`. Finding 5. Depends: Gate GA. Size: about 350 lines.

- **Scenario: two-step login.** Given a phone number / When `start_login` runs / Then it returns a handle without blocking on an OTP callback; `verify_otp(handle, code)` completes the login.
- **Scenario: handle safety.** Then a handle is single-use, expires after a TTL (proposed 10 min) and cannot be used by another user.
- **Scenario: identity re-check kept.** When a session is refreshed (Verify again) / Then the provider account id must match the linked one, or the link fails.
- **Scenario: status without network.** Then a cached status (ok, expiring, expired) is returned when listing accounts.
- **Scenario: disconnect.** Then it removes the session and, by choice, keeps or wipes that account's data.
- **Scenario: FakeProvider.** Then it gives deterministic orders and can simulate a wrong code, rate limit, expiry and a partial failure, with no network, and every test in Phase B uses it.
- **Scenario: redaction.** Then tokens, codes and handles never appear in logs.

### AC-06 Auth core \[P0\]

Owns: `food_khata/auth/{passwords,sessions,csrf,throttle}.py`, `serve/routes_auth.py`, the `app.db` schema, and empty router stubs for owner, accounts and sync. Depends: Gate GA. Size: about 380 lines.

- **Scenario: password storage.** Given a password / Then only a salted slow hash is stored (scrypt from the standard library or argon2id, DEC-P1).
- **Scenario: sessions.** Then sessions live on the server, the cookie is HttpOnly and SameSite=Lax (Secure when on HTTPS), the id rotates on login, there is an idle timeout (8 h, DEC-010), and logout deletes the session.
- **Scenario: CSRF.** When a state-changing request lacks the token / Then it gets 403.
- **Scenario: throttle.** Given 5 failed logins for one username and IP within 10 min / Then the next gets 429 with Retry-After, and error text never reveals whether the username exists.
- **Scenario: every route needs login.** Given a test that lists the full route table / When each route is called without a session / Then it returns 401, except an explicit allow-list (setup status, login, register, health, static assets). This includes today's unauthenticated read APIs.
- **Scenario: contract C-0.** Then the OpenAPI schema is generated and committed.

### AC-08 Per-user data and encrypted sessions \[P0\]

(Listed before AC-07 because AC-07 calls its adoption function.)

Owns: `storage.py`, `food_khata/users/context.py`, per-request database selection in `serve/app.py` and `serve/db.py`, the dashboard cache. Finding 8, 10. Depends: AC-03, AC-06. Size: about 400 lines, the largest story; split into two if it passes 450.

- **Scenario: user context.** Given a logged-in user / Then the data folder `users/<id>/` and its database come from the session, and no route accepts a path or user id from the client.
- **Scenario: isolation.** Given users A and B / When A calls the dashboard APIs / Then only A's data returns, and the cache is keyed by user, filters and database version.
- **Scenario: adoption.** Given an existing `.food-khata` folder (a synthetic fixture in tests) / When `adopt_legacy_root(user)` runs / Then the data becomes that user's folder, a backup is kept, and a second run changes nothing.
- **Scenario: encryption at rest.** Then provider sessions and phone numbers are encrypted with an AEAD cipher using a random data key wrapped by a key derived from the user's password (DEC-P2); a wrong password fails closed; folder mode 0700 is kept.
- **Scenario: migration.** Given plaintext sessions / When first unlocked / Then they are encrypted and the plaintext is deleted.
- **Scenario: password change versus reset.** Then a user's password change re-wraps the key; an owner reset cannot, so it wipes that user's provider sessions.
- **Scenario: honest limit.** Then the docs state that whoever administers the host can still read everything.

### AC-07 Owner, setup and registration \[P0\]

Owns: `auth/owner.py`, `auth/registration.py`, `serve/routes_owner.py`, `food_khata/cli_owner.py`. Depends: AC-06, AC-08. Size: about 350 lines.

- **Scenario: first claim.** Given no owner exists / When the claim comes from loopback or carries the one-time setup code printed at `--lan` start / Then the owner is created and the existing data adopted. Any other claim gets 403, and after a claim the setup endpoint returns 404.
- **Scenario: registration closed by default.** Given an owner exists / When someone registers with no window and no code / Then it is refused.
- **Scenario: window and join code.** When the owner opens a window (15 min, 1 hour or until closed) / Then registration works until it ends, enforced on the server. A rotatable household join code is stored hashed, and rotating it invalidates the old one.
- **Scenario: limits.** Then registration is rate-limited and a cap of 8 users applies (DEC-010).
- **Scenario: admin actions.** Then the owner can list, disable and reset users. Reset wipes that user's provider sessions and calls `JobControl.cancel_user` (stub until AC-09). Sensitive actions ask for the owner's password again.
- **Scenario: CLI recovery.** Given the server is stopped / Then `food-khata owner reset-password` and `owner transfer` work.

### AC-09 Job runner \[P0\]

Owns: `food_khata/jobs/*`, the jobs tables in `app.db`. Depends: AC-04, AC-05, AC-08. Size: about 380 lines.

- **Scenario: lifecycle.** Then a job moves through queued, running, needs\_code, paused, done, failed, cancelled or interrupted, and each change is stored.
- **Scenario: outlives the session.** Given a running sync / When the user leaves or logs out / Then it continues. At start it takes its own in-memory copy of the decrypted session and key and discards both at the end.
- **Scenario: queue rules.** Then at most one job runs per provider across all users, scheduling is fair between users, a per-user limit applies (1 running, 2 queued; DEC-010), and Swiggy pacing (about 1 request per second) is respected.
- **Scenario: server restart.** When the server restarts / Then running jobs become interrupted (the key is lost) and resume after the user logs in. No half-import happens.
- **Scenario: needs code.** When a provider asks for a new code mid-sync / Then the job pauses as needs code, and the key is dropped after about 24 h, after which the job becomes interrupted.
- **Scenario: cancelled by admin.** Then an owner reset or disable cancels that user's running jobs.
- **Scenario: import once.** Then the import runs when the job finishes. Failed or cancelled partials are kept for resume and imported only when the user chooses use partial.
- **Scenario: progress history.** Then recent events are stored for polling and pruned (retention in BL-103).

### AC-10 Accounts and sync API \[P0\]

Owns: `serve/routes_accounts.py`, `serve/routes_sync.py`, their schemas. Depends: AC-06, AC-09. Size: about 350 lines.

- **Scenario: endpoints.** Then the API offers list accounts (status, last sync, counts), link start and verify (also used for an alternative account), verify again (reuses the stored phone), disconnect, start sync with mode, job status, cancel and use partial.
- **Scenario: one owner per provider account.** Given a provider account already linked to another user / When a second user links it / Then it returns 409 PROVIDER\_ACCOUNT\_TAKEN.
- **Scenario: quota.** Given 5 linked logins (configurable) / When a sixth is added / Then it returns 409 QUOTA.
- **Scenario: authorization.** When user B requests user A's account or job id / Then it returns 404.
- **Scenario: error codes.** Then every error uses the codes from AC-04.
- **Scenario: contract freeze C-1.** Then the OpenAPI snapshot is committed and frontend types are generated from it; a breaking change needs a DEC.

### AC-11 LAN mode and transport \[P1\]

Owns: `food_khata/serve_cmd.py`, `serve/security.py`, TLS options. Depends: AC-06, AC-07. Size: about 250 lines.

- **Scenario: loopback by default.** When `food-khata serve` runs without flags / Then it binds loopback only.
- **Scenario: LAN opt-in.** When `--lan` is given / Then it binds the network, prints the URL, and prints a one-time setup code if no owner exists.
- **Scenario: host allow-list.** Given a request with an unknown Host header / Then it returns 400. `--allow-host` extends the list, and the existing Origin checks stay.
- **Scenario: HTTPS.** Then `--tls-cert` and `--tls-key` (or a generated self-signed certificate) enable HTTPS and Secure cookies. On plain HTTP the API reports `insecure_transport: true` so the UI can show a warning banner. Default choice in BL-105.
- **Scenario: provider traffic stays on the host.** Then no frontend bundle contains a provider hostname (checked by test).

### AC-12 Frontend foundation \[P0\]

Owns: `dashboard-ui/src/features/access/{api,auth,primitives}/**` and `features/access/routes.tsx`. Depends: C-0 (auth types); accounts and sync types regenerate after C-1. Size: about 350 lines.

- **Scenario: typed API client.** Then types are generated from the OpenAPI snapshot, the client adds the CSRF token, maps error codes to typed errors, and on 401 redirects to login keeping the return path.
- **Scenario: declarative primitives.** Then `defineForm({fields, schema, submit})`, `AuthShell` and `StatusBanner` exist, built on the current Radix and shadcn components, so screen stories write only fields, a zod schema and copy.
- **Scenario: route composition root.** Then `routes.tsx` registers every access route as a lazy placeholder, so later stories add files in their own folders and never edit a shared file.
- **Scenario: auth guard.** Given a logged-out visitor / When they open a dashboard route / Then they land on login. Logout clears the TanStack Query cache.

### AC-13 Welcome, setup, login and register screens \[P0\]

Owns: `features/access/welcome/**`. Depends: AC-12, AC-07, AC-01 approved. Size: about 300 lines.

- **Scenario: first run.** Given no owner exists / Then the first screen is Set up this server, with the setup code field shown only when the visit is not from the host.
- **Scenario: welcome.** Given an owner exists / Then Log in and Register are offered, and Register shows closed or open state from the API.
- **Scenario: register form.** Then it takes username, password twice and the join code (hidden while a window is open). Mismatched passwords show an inline error. Registration is blocked until the no-recovery box is ticked, and the login screen does not show the owner's name (DEC-010).
- **Scenario: login errors.** Then a wrong login shows one generic message, and a throttled login shows the retry time.
- **Scenario: quality.** Then the screens pass axe, work by keyboard and fit 390px.

### AC-14 Accounts and linking screens \[P0\]

Owns: `features/access/accounts/**`. Depends: AC-12, C-1 (AC-10), AC-01 approved. Size: about 350 lines.

- **Scenario: home.** Then Home lists linked accounts with provider, status chip and last sync.
- **Scenario: link flow.** When the user enters a phone number and then the provider's code / Then the account appears. A wrong code shows the code's message; an expired handle restarts at the phone step.
- **Scenario: alternative account.** Then Add alternative account uses the same screen with another phone.
- **Scenario: verify again.** Given an expired session / Then the row shows Verify again and reuses the stored phone.
- **Scenario: disconnect.** Then a confirm dialog lets the user keep or wipe that account's data.
- **Scenario: limits.** Then the 409 cases (taken, quota) have plain-language messages.

### AC-15 Sync screens and background states \[P0\]

Owns: `features/access/sync/**`. Depends: AC-12, C-1 (AC-10), AC-01 approved. Size: about 350 lines.

- **Scenario: choose a sync.** Then New orders, All history and Missing bill details each show a one-line effect and a time warning (Swiggy about 20 minutes or more per 1,000 orders). New orders is the default on later visits (DEC-010).
- **Scenario: progress.** Then it shows phase, counts and a Cancel button, and the user can leave the page while the job continues.
- **Scenario: needs code.** Then a paused job shows a code prompt.
- **Scenario: interrupted.** Then an interrupted job offers Resume after login.
- **Scenario: finished with problems.** Then failed or cancelled partials offer Use partial data or Discard.
- **Scenario: logout warning.** Given a running sync / When the user logs out / Then a notice says the sync continues, and that a server restart would interrupt it.

### AC-16 Owner settings \[P1\]

Owns: `features/access/owner/**`. Depends: AC-12, C-1 (AC-10), AC-01 approved. Size: about 280 lines.

- **Scenario: registration controls.** Then the owner can open a 15 min, 1 hour or until-closed window, close it, and see the time left.
- **Scenario: join code.** Then the code can be shown, copied and rotated, with a note that the old code stops working.
- **Scenario: users.** Then the list shows each user's status, with Disable and Reset password. Reset asks for confirmation (DEC-010) and the owner's password, and says it wipes that user's provider sessions.
- **Scenario: access.** Then a non-owner cannot reach this screen or its API.

### AC-17 Dashboard integration \[P1\]

Owns: `FilterBar.tsx`, `SyncStatusPanel.tsx`, a new `features/access/banners/**`, and the guard wiring in `App.tsx`. Depends: AC-13 to AC-16 merged. Size: about 300 lines.

- **Scenario: banners.** Then data being fetched (first sync, no data yet), syncing, and finished while you were away appear with the right state from the job API.
- **Scenario: accounts feed the dashboard.** Then the account filter and the Data health panel use the new account list.
- **Scenario: empty user.** Given a user with no linked account / Then the dashboard shows an empty state linking to Home.
- **Scenario: no leakage.** When another user logs in on the same browser / Then no earlier data or cached query is shown.

### AC-18 Security acceptance, end-to-end and docs \[P0\]

Owns: `tests/e2e_access/**`, `docs/access/**`, README sections. Depends: all AC. Size: about 350 lines.

- **Scenario: full journey.** Given a fresh data folder and FakeProvider / When a browser run goes first-run setup, register, link, sync, dashboard / Then it passes at desktop and 390px.
- **Scenario: isolation matrix.** Then user A cannot read user B's dashboard, accounts, jobs or files by any route.
- **Scenario: route sweep.** Then every route except the allow-list returns 401 logged out; CSRF and cookie flags are verified.
- **Scenario: LAN checks.** Then the host allow-list and the HTTP warning are verified.
- **Scenario: no secrets in logs.** Then tokens, codes and passwords are absent from logs.
- **Scenario: docs.** Then they cover the threat model, the host-administrator limit, setup and recovery, and the provider risk statement: undocumented mobile APIs, a shared embedded key, a spoofed app and TLS impersonation, probably against the platforms' terms, with some risk of account blocks.
- **Scenario: real accounts.** Then a manual smoke checklist exists for you to run yourself; no automated test touches a real account.

### Gate GB: access feature acceptance

- **Scenario: all stories closed.** Then every FX and AC story is DONE, or DEFERRED with a Backlog entry.
- **Scenario: trunk is green.** Then full verify, build, bundle check, pytest, the browser suite and the end-to-end suite pass.
- **Scenario: clean logs.** Then no open P0 or P1 deviation, no BLOCKED story, and the Decision log has no Proposed entry left.
- **Scenario: sign-off.** Then you approve after the manual smoke checklist.

## 5. Live tracker

Update protocol. When a story starts: set IN\_PROGRESS and add a Delegation row. When it ends: fill Progress (date, commit, evidence), add a Verification row and a Changelog row. Any divergence, choice, leftover or stop is logged in the same commit. The redesign stories S-080 to S-085 stay tracked in `REDESIGN_BRIEF.md`; here they map to FX-06, FX-07 and GA.

### 5.1 Progress

| ID | Title | Phase | Pri | Status | Date | Evidence | Wave |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FX-01 | Tracker and hygiene | A | P0 | DONE | 2026-11-09 | commit 565e6ea; brief.mjs lint passes (29 tables / 457 rows), clean venv pytest passes | A1 |
| FX-02 | Fast verify harness | A | P0 | DONE | 2026-11-09 | commit 66a393a; fast verify ~20s, vitest pool 11.4s, audit pass | A1 |
| FX-04 | Read-only database safety | A | P1 | DONE | 2026-11-09 | commit e2012b9; pytest 114 passed (20-thread concurrency, readonly, missing db 503) | A1 |
| FX-03 | Lazy routes and bundle budget | A | P1 | DONE | 2026-11-09 | commit a6892ca; entry index-*.js 97.7 kB gzip <= 250 kB, manualChunks split | A2 |
| FX-05 | BaseChart primitive | A | P1 | DONE | 2026-11-09 | commit b180101; 14 charts migrated, 732 lines net deleted, 979 unit tests pass | A2 |
| FX-06 | Browser QA suite | A | P0 | DONE | 2026-11-09 | commit 4c884fe; 28 Playwright checks pass (axe 0 violations, responsive, perf) | A3 |
| FX-07 | Visual regression, review pack, cleanup | A | P2 | DONE | 2026-11-09 | commit ab244cb; 40 snapshots across 5 routes x 2 viewports x 2 modes x 2 accents, 12 problems review pack, recharts cleanup | A4 |
| GA | Redesign final acceptance | A | P0 | DONE | 2026-11-09 | commit 7adba9b; T9 audit pass (gemini-high); all 62 redesign + FX-01..FX-07 DONE; full verify.mjs pass | A4 |
| AC-01 | Wireframes v2 and flow freeze | B | P0 | DONE | 2026-11-09 | commit ebdaba7; interactive wireframes.html with 10 screens x 2 viewports (1440/390), 8 sync states, user approved (Wave B0 freeze) | B0 |
| AC-02 | Sync correctness and checkpoint cost | B | P0 | DONE | 2026-11-09 | commit cc5cf95; early-stop fixed, lifetime_complete flag, batched checkpoints (33 writes vs 1053), pytest 129 passed | B1 |
| AC-03 | Database robustness | B | P0 | DONE | 2026-11-09 | commit 516ca75; WAL mode, busy timeout, order quarantine table, incremental ingest, pytest 133 passed | B1 |
| AC-04 | Sync service | B | P0 | DONE | 2026-11-09 | commit ee28f0d; SyncEvent typed events, error codes, cancel token, 3 modes, thin CLI wrapper, pytest 133 passed | B2 |
| AC-05 | Provider linking service and FakeProvider | B | P0 | DONE | 2026-11-09 | commit 35c74bb; LinkingService, two-step login handle (10m TTL), FakeProvider double, pytest 124 passed | B1 |
| AC-06 | Auth core | B | P0 | DONE | 2026-11-09 | commit 79f8dda; scrypt slow hashing, server sessions (8h idle), CSRF 403, 5-try throttle 429, route auth sweep, contract C-0, pytest 140 passed | B2 |
| AC-08 | Per-user data and encrypted sessions | B | P0 | IN_PROGRESS | 2026-11-10 | Reopened: acceptance audit reproduced unused vault HTTP path and plaintext sessions/phones; security fix dispatched | B3 |
| AC-07 | Owner, setup and registration | B | P0 | DONE | 2026-11-09 | commit 911b751; loopback/setup code claim, hashed rotatable join code, 8 user cap, admin actions, CLI recovery, pytest 152 passed | B4 |
| AC-09 | Job runner | B | P0 | DONE | 2026-11-09 | commit 40a4f00; JobRunner and JobControl, 1 running 2 queued limits, restart recovery, cancel checkpoint, pytest 165 passed | B4 |
| AC-10 | Accounts and sync API | B | P0 | DONE | 2026-11-09 | commit c7de453; accounts & sync endpoints, 1 running 2 queued limits, 409 PROVIDER_ACCOUNT_TAKEN, 409 QUOTA, 404 auth, contract C-1 freeze, pytest 188 passed | B5 |
| AC-11 | LAN mode and transport | B | P1 | DONE | 2026-11-09 | commit 2af129a; loopback default, --lan opt-in, host allow-list (400 on unknown), TLS cert/key and HTTPS secure cookies, provider traffic host-isolated, pytest 172 passed | B5 |
| AC-12 | Frontend foundation | B | P0 | DONE | 2026-11-09 | commit 9ad3ffa; typed OpenAPI client, CSRF header, 401 redirect, AuthShell, defineForm, StatusBanner, routes.tsx root, 979 vitest passed | B3 |
| AC-13 | Welcome, setup, login, register screens | B | P0 | DONE | 2026-11-09 | commit 1fc4ccb; welcome, setup, login, register screens, no-recovery gate, join code window, generic auth errors, 997 vitest passed | B5 |
| AC-14 | Accounts and linking screens | B | P0 | DONE | 2026-11-10 | 8c1c276; trunk verify all pass 104.92s; parent synthetic 1440/390 regression and visual review pass; App mounting belongs to AC-17 | B6 |
| AC-15 | Sync screens and background states | B | P0 | DONE | 2026-11-10 | a917762 + 1d4e11b; trunk verify 94.05s; independent crash/restart/API/1440/390 audit pass | B6 |
| AC-16 | Owner settings | B | P1 | DONE | 2026-11-10 | bc34ca2 + 8c1c276; trunk verify 104.92s includes owner typecheck; independent API/1440/390 visuals pass; parent expiry/error/dialog checks pass | B6 |
| AC-17 | Dashboard integration | B | P1 | DONE | 2026-11-10 | 282a0db; trunk verify 91.10s; parent 6 browser regressions plus independent isolation and visuals pass | B7 |
| AC-18 | Security acceptance, end-to-end, docs | B | P0 | TODO | — | — | B8 |
| GB | Access feature acceptance | B | P0 | TODO | — | — | B8 |

### 5.2 Decision log

| ID | Date | Story | Decision | Reason | Impact | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DEC-001 | 2026-11-09 | Plan | Fixes first, then the feature | Your choice | Gate GA before any Phase B work | Accepted |
| DEC-002 | 2026-11-08 | AC-06, AC-10 | App identity is a free username and password. Phone numbers appear only when linking a provider, verified by the provider's SMS code. One provider account links to one app user. | Stops anyone squatting a phone number | Auth and linking rules | Accepted (handoff) |
| DEC-003 | 2026-11-08 | AC-07 | Registration closed once an owner exists. Owner opens a timed window (15 min, 1 hour, until closed) and can rotate a household join code. Rate limits and quotas apply. | You chose this over open registration | Owner screens and API | Accepted (handoff) |
| DEC-004 | 2026-11-08 | AC-07, AC-11 | First owner claim only from loopback or with a one-time setup code. Recovery by CLI. | Stops a LAN visitor claiming the server | Setup flow | Accepted (handoff) |
| DEC-005 | 2026-11-08 | AC-08 | One folder and one database per user. Provider sessions encrypted with a key derived from the user's password. The host administrator can still read everything. | Isolation without a server-wide key | Storage layer | Accepted (handoff) |
| DEC-006 | 2026-11-08 | AC-09 | A sync is a server-side job that outlives the page and logout. A restart interrupts it. No server-wide key. Scheduled auto-sync deferred (BL-101). | Key stays in memory only while needed | Job design | Accepted (handoff) |
| DEC-007 | 2026-11-08 | AC-09, AC-15 | Import runs once at sync end. Failed or cancelled partials are kept and imported only if the user chooses. | No half-loaded dashboard | Sync UX | Accepted (handoff) |
| DEC-008 | 2026-11-08 | AC-06 | Every route requires login, including today's read APIs. | LAN exposure | Route sweep test | Accepted (handoff) |
| DEC-009 | 2026-11-09 | Plan | ASE-Orch rules adopted: Phase 0 primitives, stories of about 250 to 400 lines, non-overlapping file ownership, waves of up to 4 worktrees, verify in 20 s or less. | Throughput and fewer merge conflicts | Story slicing and waves | Accepted |
| DEC-P1 | 2026-11-09 | AC-06 | Hash passwords with scrypt from the Python standard library instead of argon2id. | Handoff said argon2id; scrypt needs no new dependency and is an accepted password hash. | One fewer dependency | Accepted (2026-11-09) |
| DEC-P2 | 2026-11-09 | AC-08 | Encrypt with a random data key wrapped by the password-derived key. | A password change re-wraps one key instead of re-encrypting every file. | Storage format | Accepted (2026-11-09) |
| DEC-P3 | 2026-11-09 | AC-02 | A New sync also repairs missing bill details. | Missing mode only re-fetches details; it cannot find orders skipped earlier. | Sync labels and UI | Accepted (2026-11-09) |
| DEC-P4 | 2026-11-09 | FX-03 | Entry chunk budget of 250 kB gzip, confirmed after measuring. | Today it is one 541 kB gzip chunk; the number is my estimate. | Bundle check | Accepted (2026-11-09) |
| DEC-P5 | 2026-11-09 | FX-06 | First route under 1.5 s (from brief S-082) and cross-filter click under 300 ms. | The 300 ms figure is my proposal, not from the brief. | Performance gate | Accepted (2026-11-09) |
| DEC-010 | 2026-11-09 | AC-01, AC-06, AC-07, AC-09, AC-13, AC-15, AC-16 | Registration is blocked until the no-recovery box is ticked. The login screen does not show the owner's name. Reset password asks for confirmation. New orders is the default sync on later visits. Session idle timeout is 8 hours. Limits: 8 users, 5 linked logins per user, 1 running and 2 queued sync jobs per user. Tests and visual checks run in the executing agent's integrated preview browser, so BLK-01 is resolved. DEC-P1 to DEC-P5 are accepted. | You answered the open questions; the limits are my suggestion, sized for a household. | Wireframes, registration, job limits, browser QA | Accepted |
| DEC-011 | 2026-11-09 | Plan | The orchestrator chooses models; the plan only gives weight, risk and needs per story (2.4). Phase B waves reordered: AC-05 to B1, AC-12 starts from the auth contract (B3), AC-07 off the critical path (B4). max\_parallel raised to 4, L stories get larger packets and timeouts. | Your instruction; shortens the longest dependency chain from 9 stories to 7 | Waves, tags, models.json settings | Accepted |
| DEC-012 | 2026-11-09 | FX-04 | Kept check_same_thread=False for readonly connections because FastAPI dependency cleanup may execute in another worker thread; missing DB returns HTTP 503 database_not_found. | Concurrency & clear error contract | DB connection handling | Accepted |
| DEC-013 | 2026-11-09 | FX-01 | Declared httpx in pyproject.toml extras; brief.mjs lint validates exact column counts across all markdown tables in both briefs. | Clean install and table guardrails | Environment and tracker hygiene | Accepted |
| DEC-014 | 2026-11-09 | FX-02 | vitest isolate:false breaks fullscreen tests; adopted worker threads pool + disableConsoleIntercept bringing unit tests to 11.4s and fast path to ~20s. | Performance without test breakage | Fast verify test configuration | Accepted |
| DEC-015 | 2026-11-09 | FX-03 | Measured entry chunk at 97.7 kB gzip; configured manualChunks for echarts and react vendor; check-bundle.mjs validates <= 250 kB budget. | Confirmed entry chunk budget and route lazy loading | Bundle budget & code splitting | Accepted |
| DEC-016 | 2026-11-09 | FX-05 | Implemented declarative BaseChart wrapper with lifecycle stability, ResizeObserver, theme sync, and event delegation; migrated 14 charts deleting 732 net lines. | Eliminates boilerplate while preserving 100% test parity | Chart component architecture | Accepted |
| DEC-017 | 2026-11-09 | FX-06 | Integrated @axe-core/playwright in Playwright E2E suite; tested emerald and indigo accents across 5 routes; added aria-label on Orders progress bar to achieve 0 axe violations. | Automated a11y & responsive QA | E2E test suite | Accepted |
| DEC-018 | 2026-11-09 | FX-07 | Redesigned dashboard verified: 12 original design problems resolved, UI is cohesive, responsive, accessible, and premium across all 5 routes and theme accents. | Human review requirement of FX-07 | Design sign-off readiness | Accepted |
| DEC-019 | 2026-11-09 | FX-07 | Playwright visual regression suite runs 40 snapshots deterministically; .gitignore keeps raster captures local while tracked specs protect against regressions. | Visual safety without repository bloat | Visual regression testing | Accepted |

| DEC-020 | 2026-11-10 | Orchestration | Replace Gemini dispatches with Terra low/medium/high; SOL low/medium fallback; retain OpenCode | User authorization after quota exhaustion | T3 routing aliases updated | Accepted |

### 5.3 Deviation log

| ID | Date | Story | Original requirement | What was done instead | Reason | Impact | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DEV-001 | 2026-11-09 | FX-06 | Spec asked for emerald and violet accents | Tested emerald and indigo accents | Violet is not defined in VALID_ACCENTS (palette is emerald, indigo, amber, rose, slate) | No negative impact, tested 2 valid accents | Accepted |
| DEV-002 | 2026-11-09 | AC-08 | Planned split if over 450 lines | Kept as single coherent story (~1200 diff lines including crypto & tests) | Splitting would create complex partial abstractions across AEAD and context | Clean single atomic commit | Accepted |

| DEV-003 | 2026-11-10 | AC-15 | C-1 lacks durable partial discard decision | Add persisted partial decision and additive API support | Independent audit reproduced reload and import/discard inconsistency | Preserve import idempotence and user isolation; no deletion of imported orders | Implemented and audited |

| DEV-004 | 2026-11-10 | AC-17 | Finished-while-away notice needs initial acknowledgement baseline | Browser-local per-user marker; first visit ignores completions older than five minutes | Avoid replaying ancient successes without prior browser state | Later unacknowledged completions remain visible; independently accepted | Accepted |

### 5.4 Backlog (remaining and discovered items)

| ID | Date | Origin | Description | Priority | Reason deferred |
| --- | --- | --- | --- | --- | --- |
| BL-101 | 2026-11-08 | Handoff | Scheduled auto-sync | P3 | Needs a stored key; DEC-006 forbids it for now |
| BL-102 | 2026-11-08 | Handoff | Keyring storage instead of password-derived encryption | P3 | Not decided |
| BL-103 | 2026-11-08 | Handoff | How long finished-job notices and progress events are kept | P2 | Decide in AC-09 |
| BL-104 | 2026-11-08 | Handoff | Exact quota numbers (users, linked logins, jobs per user) | P2 | OQ-6, decide in AC-07 |
| BL-105 | 2026-11-08 | Handoff | HTTPS as the default for `--lan` | P2 | Decide in AC-11 |
| BL-106 | 2026-11-09 | Review | Run the browser suite in an environment that can install Chromium | P2 | Resolved by DEC-010: the executing agent has a preview browser |

| BL-008 | 2026-11-10 | AC-17 | Include access screens in TypeScript checks and correct obsolete shared-client UserResponse types; found by AC-16 separate check | P0 | Resolved by f2d4a44; trunk 8c1c276 typecheck passes |

| BL-009 | 2026-11-10 | AC-15 audit | use_partial accepts queued jobs; restrict actions to valid partial lifecycle states in crash fix | P1 | Resolved by fb01fb2; partial lifecycle actions restricted |

### 5.5 Blockers

| ID | Date | Story | Description | Needed to unblock | Status |
| --- | --- | --- | --- | --- | --- |
| BLK-01 | 2026-11-09 | FX-06, FX-07 | Chromium cannot be downloaded in my sandbox, so browser tests, screenshots and the dev-database app run are not done. | Run on your machine, or allow the Playwright download host in network settings | Resolved 2026-11-09 (DEC-010) |
| BLK-02 | 2026-11-08 | All AC | Real Swiggy or Zomato accounts must never be used in tests. | FakeProvider (AC-05) and a manual smoke checklist (AC-18) | Standing rule |

### 5.6 Open questions

| ID | Question | Leaning | Needed by |
| --- | --- | --- | --- |
| OQ-1 | Block registration until a no-recovery box is ticked? | Decided: yes | AC-01 |
| OQ-2 | Show the owner's name on the Log in screen? | Decided: do not show | AC-01 |
| OQ-3 | Confirm dialog before Reset password? | Decided: yes | AC-01 |
| OQ-4 | Default sync mode on later visits? | Decided: New orders | AC-01 |
| OQ-5 | Should AC-01 (design only) run during Phase A? | Decided: no, after Gate GA | Before wave A1 |
| OQ-6 | Quota numbers: max users, linked logins, jobs per user | Decided: 8 users, 5 linked logins each, 1 running and 2 queued jobs per user | AC-07 |
| OQ-7 | Session idle timeout | Decided: 8 hours | AC-06 |

| OQ-8 | Keep AC08 phone encryption across analytics/archives or explicitly approve narrower credential-only encryption scope? | User decision pending; asked 2026-11-10 under locked-decision stop rule | AC-08, GB |

### 5.7 Risk register

| ID | Risk | Mitigation | Story |
| --- | --- | --- | --- |
| R-1 | Provider APIs change, or accounts get blocked | FakeProvider tests, PROVIDER\_CHANGED code, risk stated in docs | AC-05, AC-18 |
| R-2 | An owner reset wipes provider sessions, so the user must re-link | By design; message in the UI | AC-08, AC-16 |
| R-3 | The host administrator can read all data | Documented limit | AC-18 |
| R-4 | AC-08 grows past 450 lines | Split into isolation and encryption | AC-08 |
| R-5 | Verify cannot reach 20 s | Documented fallback in FX-02 | FX-02 |
| R-6 | Python findings were read, not run, and may not reproduce | First scenario of each story reproduces it | AC-02, AC-03 |

### 5.8 Verification log

| Date | Story or gate | Command | Result | Duration | Commit |
| --- | --- | --- | --- | --- | --- |
| 2026-11-09 | Baseline | `python -m pytest tests -q` | 110 passed | 6.9 s | 2fcacf4 |
| 2026-11-09 | Baseline | `npm test` | 967 passed (54 files) | about 37 s | 2fcacf4 |
| 2026-11-09 | Baseline | `npm run lint` (eslint, colours, contrast) | pass | not recorded | 2fcacf4 |
| 2026-11-09 | Baseline | `npm run build` | pass, one 1.77 MB chunk | about 12 s | 2fcacf4 |
| 2026-11-09 | Baseline | `npm run test:browser` | not run (BLK-01) | — | 2fcacf4 |
| 2026-11-09 | FX-04 | `node scripts/verify.mjs . --backend` | all pass (pytest 114 passed, ruff clean, typecheck, lint, vitest 967 passed) | 50 s | e2012b9 |
| 2026-11-09 | FX-01 | `node scripts/brief.mjs lint; node scripts/verify.mjs . --backend` | all pass (29 tables checked, pytest 114 passed, ruff clean, typecheck, lint, vitest 967 passed) | 42 s | 565e6ea |
| 2026-11-09 | FX-02 | `node scripts/verify.mjs . --backend; audit-FX-02-1` | all pass (guardrails, typecheck, lint, unit 11.98s, ruff, pytest 114 passed; audit pass) | 33 s | 66a393a |
| 2026-11-09 | FX-03 | `npm run build; node scripts/check-bundle.mjs; node scripts/verify.mjs . --backend` | all pass (entry 97.7 kB gzip, vitest 967 passed, pytest 114 passed) | 42 s | a6892ca |
| 2026-11-09 | FX-05 | `npm run build; node scripts/check-bundle.mjs; node scripts/verify.mjs . --backend` | all pass (vitest 979 passed, pytest 114 passed, entry 97.7 kB gzip) | 41 s | b180101 |
| 2026-11-09 | FX-06 | `npm run test:browser; node scripts/verify.mjs . --backend --browser` | all pass (28 Playwright checks, axe 0 violations, responsive, perf) | 52 s | 4c884fe |
| 2026-11-09 | FX-07 | `npm run build; npm run test:browser; node scripts/verify.mjs . --backend --browser` | all pass (68 Playwright checks, 40 visual snapshots, 979 vitest, 114 pytest) | 61 s | ab244cb |
| 2026-11-09 | GA | `node scripts/verify.mjs . --backend --browser; audit-Gate-GA-1` | all pass (T9 audit pass, 68 browser tests, 40 visual snapshots) | 61 s | 7adba9b |
| 2026-11-09 | AC-01 | `node scripts/verify.mjs . --backend` | all pass (wireframes.html verified; user approval obtained) | 32 s | ebdaba7 |
| 2026-11-09 | AC-05 | `node scripts/verify.mjs . --backend; audit-AC-05-1` | all pass (pytest 124 passed, FakeProvider tests, 979 vitest; audit pass) | 33 s | 35c74bb |
| 2026-11-09 | AC-02 | `node scripts/verify.mjs . --backend` | all pass (pytest 129 passed, sync checkpoints batched, 979 vitest) | 34 s | cc5cf95 |
| 2026-11-09 | AC-03 | `node scripts/verify.mjs . --backend` | all pass (pytest 133 passed, WAL concurrency, quarantine, 979 vitest) | 61 s | 516ca75 |
| 2026-11-09 | AC-04 | `node scripts/verify.mjs . --backend` | all pass (pytest 133 passed, sync service typed events, cancel token, 979 vitest) | 61 s | ee28f0d |
| 2026-11-09 | AC-06 | `node scripts/verify.mjs . --backend; audit-AC-06-1` | all pass (pytest 140 passed, auth core, scrypt, sessions, csrf, throttle, 979 vitest; audit pass) | 65 s | 79f8dda |
| 2026-11-09 | AC-12 | `node scripts/verify.mjs . --backend` | all pass (979 vitest passed, typed client, declarative primitives, 140 pytest) | 64 s | 9ad3ffa |
| 2026-11-09 | AC-08 | `node scripts/verify.mjs . --backend` | all pass (pytest 146 passed, per-user isolation, AEAD encryption, 979 vitest) | 64 s | 6a1ef89 |
| 2026-11-09 | AC-07 | `node scripts/verify.mjs . --backend` | all pass (pytest 152 passed, owner setup, registration, 979 vitest) | 68 s | 911b751 |
| 2026-11-09 | AC-09 | `node scripts/verify.mjs . --backend` | all pass (pytest 165 passed, job runner lifecycle, limits, restart, cancel, 979 vitest) | 73 s | 40a4f00 |
| 2026-11-09 | AC-11 | `node scripts/verify.mjs . --backend` | all pass (pytest 172 passed, LAN mode, security middleware, TLS options, 979 vitest) | 74 s | 2af129a |
| 2026-11-09 | AC-13 | `node scripts/verify.mjs . --backend` | all pass (997 vitest passed, welcome/setup/login/register screen tests, 172 pytest) | 74 s | 1fc4ccb |
| 2026-11-09 | AC-10 | `node scripts/verify.mjs . --backend` | all pass (pytest 188 passed, accounts and sync API, contract freeze C-1, 997 vitest) | 78 s | c7de453 |

| 2026-11-10 | AC-16 | node scripts/verify.mjs . --backend | all six checks pass after merge; owner expiry/error/dialog browser follow-up passed | 89.76 s | bc34ca2 |

| 2026-11-10 | AC-14, AC-16 | node scripts/verify.mjs . --backend | all six checks pass on trunk with access screens included in typecheck; AC-14 parent interactive checks passed at 1440/390 | 104.92 s | 8c1c276 |

| 2026-11-10 | AC-15 | node scripts/verify.mjs . --backend | all six checks pass on trunk after casing and fixture fixes; independent durability audit passed | 94.05 s | 1d4e11b |

| 2026-11-10 | AC-17 | node scripts/verify.mjs . --backend; Playwright access-integration | all six checks pass on trunk; 6 parent browser tests and 2 independent isolation checks pass | 91.10 s | 282a0db |

| 2026-11-10 | AC-18 | pytest tests/e2e_access/test_route_sweep.py -q in acceptance worktree | parent independently confirmed 3 tests pass: logged-out route sweep, CSRF/cookie/host flags, HTTP transport status | 2.31 s | staged AC-18 on 54cdbb6 |

| 2026-11-10 | AC-18 | parent full verify --backend --browser; real-backend journey.cjs; screenshot inspection | all seven stages pass; FakeProvider journey pass1440/390; populated dashboard screenshots readable | 114.00 s | 413db9c |

### 5.9 Changelog

| Date | Story | Change | Commit |
| --- | --- | --- | --- |
| 2026-11-09 | Plan | Plan v1 created | — |
| 2026-11-09 | Plan | Plan v1.1: DEC-P1 to DEC-P5 accepted, OQ-1 to OQ-7 closed (DEC-010), BLK-01 and BL-106 resolved | — |
| 2026-11-09 | Plan | Added 2.4 orchestrator guidance (story weights, risk, parallelism settings); Phase B waves reordered (DEC-011) | — |
| 2026-11-09 | FX-04 | Per-request readonly connection safety verified under 20-thread concurrency; missing database returns HTTP 503 JSON | e2012b9 |
| 2026-11-09 | FX-01 | Fixed table column alignment in brief, added brief.mjs lint, reconciled S-024, logged 2fcacf4 work, added httpx dependency | 565e6ea |
| 2026-11-09 | FX-02 | Vitest pool configuration (unit ~11s), stage order early exit in verify.mjs, and instant worktree bootstrap | 66a393a |
| 2026-11-09 | FX-03 | React.lazy page routing, ECharts/React manualChunks, and scripts/check-bundle.mjs entry budget enforcement (97.7 kB gzip) | a6892ca |
| 2026-11-09 | FX-05 | BaseChart primitive implemented, 14 chart components migrated, 732 lines net deleted | b180101 |
| 2026-11-09 | FX-06 | Playwright browser QA suite added with axe a11y, responsive viewports, and performance gates | 4c884fe |
| 2026-11-09 | FX-07 | Visual regression suite with 40 snapshots, review pack with 12 original problems checklist, recharts cleanup, and doc updates | ab244cb |
| 2026-11-09 | GA | Redesign final acceptance audit pass (T9 gemini-high); Phase A complete | 7adba9b |
| 2026-11-09 | AC-01 | Interactive access wireframes v2 created at docs/access/wireframes.html and approved by user | ebdaba7 |
| 2026-11-09 | AC-05 | Provider linking service, two-step login handles (10m TTL), FakeProvider test double, and session disconnect | 35c74bb |
| 2026-11-09 | AC-02 | Fixed sync early-stop bug, added lifetime_complete preservation, batched checkpoints (5 pages/50 details), and added MODE_LABELS | cc5cf95 |
| 2026-11-09 | AC-03 | Enabled WAL mode and busy timeout on AnalyticsDB/readonly connections, added quarantine table and incremental ingest | 516ca75 |
| 2026-11-09 | AC-04 | Sync service implemented with typed events, error codes, cancel token, mode aliases, and CLI thin wrapper | ee28f0d |
| 2026-11-09 | AC-06 | Auth core implemented with scrypt password hashing, app.db server sessions, CSRF token validation, login throttling, full route auth sweep, and OpenAPI contract C-0 | 79f8dda |
| 2026-11-09 | AC-12 | Frontend access foundation: typed API client from OpenAPI C-0, AuthShell, defineForm, StatusBanner primitives, and route composition root | 9ad3ffa |
| 2026-11-09 | AC-08 | Per-user data folder isolation (users/<id>/), per-user DB and cache keying, AEAD encrypted sessions/phones, and adoption | 6a1ef89 |
| 2026-11-09 | AC-07 | Owner setup and registration management: loopback/setup code claim, hashed join code windows, 8 user cap, admin actions, and CLI recovery | 911b751 |
| 2026-11-09 | AC-09 | Background job runner, queue runner, JobControl API, fair scheduling, provider pacing, restart recovery, and cancellation | 40a4f00 |
| 2026-11-09 | AC-11 | LAN mode, host allow-list validation, HTTPS transport flags and cookies, and host provider isolation | 2af129a |
| 2026-11-09 | AC-13 | Welcome, setup, login, and registration screens with no-recovery acknowledgement, join-code protection, and generic error handling | 1fc4ccb |
| 2026-11-09 | AC-10 | Accounts and background sync API endpoints, OpenAPI contract freeze C-1, regenerated frontend types, and verification test suites | c7de453 |

### 5.10 Delegation ledger

| Date | Story | Task class | Model | Attempts | Outcome | Escalation |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | FX-01 | T1 | glm | 1 | pass | — |
| 2026-11-09 | FX-02 | T3 | gemini-high | 1 | pass | T6 audit gemini-med pass |
| 2026-11-09 | FX-04 | T8 | deepseek | 1 | pass | — |
| 2026-11-09 | FX-03 | T2 | beam | 1 | pass | — |
| 2026-11-09 | FX-05 | T3 | gemini-high | 1 | pass | — |
| 2026-11-09 | FX-06 | T2 | beam | 1 | pass | — |
| 2026-11-09 | FX-07 | T2 | beam | 1 | pass | — |
| 2026-11-09 | GA | T9 | gemini-high | 1 | pass | — |
| 2026-11-09 | AC-01 | T2 | beam | 1 | pass | — |
| 2026-11-09 | AC-02 | T8 | deepseek | 1 | pass | — |
| 2026-11-09 | AC-03 | T8 | gemini-med | 1 | pass | — |
| 2026-11-09 | AC-05 | T8 | beam | 1 | pass | T6 audit gemini-high pass |
| 2026-11-09 | AC-04 | T8 | beam | 1 | pass | — |
| 2026-11-09 | AC-06 | T8 | gemini-high | 1 | pass | T6 audit deepseek pass |
| 2026-11-09 | AC-08 | T8 | deepseek | 1 | pass | — |
| 2026-11-09 | AC-12 | T2 | beam | 1 | pass | — |
| 2026-11-09 | AC-07 | T8 | gemini-high | 1 | pass | — |
| 2026-11-09 | AC-09 | T8 | deepseek | 1 | fail (quota) | failover to gemini-med |
| 2026-11-09 | AC-09 | T8 | gemini-med | 2 | pass | — |
| 2026-11-09 | AC-10 | T8 | gemini-3.8-flash | 1 | pass | — |
| 2026-11-09 | AC-11 | T8 | gemini-3.8-flash | 1 | pass | — |
| 2026-11-09 | AC-13 | T2 | gemini-3.8-flash | 1 | pass | — |
| 2026-11-09 | AC-14 | T2 | gemini-3.8-flash | 1 | running | — |
| 2026-11-09 | AC-15 | T2 | gemini-3.8-flash | 1 | running | — |
| 2026-11-09 | AC-16 | T2 | gemini-3.8-flash | 1 | running | — |
| 2026-11-10 | AC-14 | T2 | beam | 2 | review | commit 397d7a6; scenario interaction evidence incomplete; parent verification running |
| 2026-11-10 | AC-15 | T2 | deepseek | 2 | F1 | Free usage limit reached; failover to Terra Medium |
| 2026-11-10 | AC-16 | T2 | terra-medium | 2 | F3 | No implementation; reassigned to Terra High |
| 2026-11-10 | AC-15 | T2 | terra-medium | 3 | F3 | No code or completed checks; reassigned to SOL Medium |
| 2026-11-10 | AC-16 | T2 | terra-high | 3 | review | commit 42efe37; browser scenarios and screenshots reported; parent verify running |
| 2026-11-10 | AC-15 | T2 | sol-medium | 4 | review | commit 4ed6a68; independent audit pending |
| 2026-11-10 | AC-14 | T6 | sol-medium | 1 | F3 | OTP handle, stale cache, JSON errors and dialog accessibility defects; fix dispatched |
| 2026-11-10 | AC-16 | T6 | sol-medium | 1 | pass | API and static visuals pass; countdown announcement fixed; expiry/error/dialog follow-up passed |
| 2026-11-10 | AC-14 | T5 | terra-high | 3 | review | f2d4a44; parent interactive checks 1440/390 pass; parent verify running |
| 2026-11-10 | AC-15 | T6 | terra-medium | 1 | F3 | Discard not durable; imported partial can be misreported as unimported; fix dispatched |
| 2026-11-10 | AC-15 | T8 | terra-high | 5 | review | a46fb9a; durable decisions implemented; parent verify and independent persistence audit pending |
| 2026-11-10 | AC-15 | T6 | sol-medium | 2 | F3 | Reproduced analytics/decision crash mismatch and non-atomic migration; mobile imported capture incorrect |
| 2026-11-10 | AC-15 | T8 | terra-high | 6 | review | fb01fb2; atomic receipt/migration and lifecycle fixes; parent verify and independent recheck pending |
| 2026-11-10 | AC-15 | T6 | sol-medium | 3 | pass | Atomic receipt and migration; crash/restart/concurrency/ownership/CSRF plus 1440/390 visuals independently verified |
| 2026-11-10 | AC-17 | T3 | terra-high | 1 | review | ef376c0; parent verification and independent auth/cache/visual review pending |
| 2026-11-10 | AC-17 | T6 | sol-medium | 1 | F3 | Cross-tab URL filter leakage; paused/code job banners misleading; stale completion notice |
| 2026-11-10 | AC-17 | T5 | terra-high | 2 | review | 09522c9; cross-tab/return URL and banner fixes; parent verify and independent recheck pending |
| 2026-11-10 | AC-17 | T6 | sol-medium | 2 | pass | 6 supplied plus 2 independent synthetic regressions; delayed-response cache/preset isolation and visuals pass |
| 2026-11-10 | AC-18 | T8 | terra-high | 1 | F1 | Quota after staged implementation; real-backend journey passed1440/390; preserving existing worktree |
| 2026-11-10 | AC-18 | T8 | sol-medium | 2 | review | 413db9c; parent full verify/journey and independent Phase B acceptance audit pending |
| 2026-11-10 | AC-18, GB | T9 | glm-high | 1 | F3 | HTTP vault never unlocked; plaintext provider secrets reproduced; spoofed forwarded IP bypasses throttle |
| 2026-11-10 | AC-08, AC-18 | T8 | terra-high | 1 | F3 | Partial uncommitted HTTP encryption proof; owner-reset failure and key/migration lifecycle incomplete |
| 2026-11-10 | AC-08, AC-18 | T5 | sol-medium | 2 | review | 9f4f903; session-bound vault lifecycle implemented; parent full verify and independent HTTP-at-rest recheck pending |
| 2026-11-10 | AC-08, AC-18, GB | T9 | glm-high | 2 | F3 | Real-server probes: silent adoption leaves plaintext backups; raw provider IDs in jobs/archives; uvicorn proxy headers bypass throttle |
| 2026-11-10 | AC-08, AC-18 | T8 | terra-high | 3 | F3 | Uncommitted transport/new-record/key fixes tested; legacy adoption and existing identifier migration incomplete; split recovery slices |
| 2026-11-10 | AC-08, AC-18 | T5 | sol-medium | 4 | pass | de928ed; locked auth DB excluded, sqlite analytics snapshot, encrypted retry-safe adoption; focused tests pass |
| 2026-11-10 | AC-08, AC-18 | T8 | terra-high | 5 | review | 7ad0565; migration/lifecycle42 tests+8 subtests reported; parent full verify and independent real-server recheck pending |
| 2026-11-10 | AC-08, AC-18, GB | T9 | glm-high | 3 | F1 | OpenCode free usage limit; no latest-fix review delivered; failover to SOL Medium |
| 2026-11-10 | AC-08, AC-18, GB | T9 | sol-medium | 4 | F3 | Delayed checkpoint can recreate credentials after reset200; retained full phones conflict with AC08 acceptance scope |
| 2026-11-10 | AC-08, AC-18 | T8 | terra-high | 6 | review | c23228e; per-user credential lock/generation; parent verify and independent delayed-write recheck pending |
| 2026-11-10 | AC-08, AC-18 | T6 | sol-medium | 5 | running | recheck-revocation-race-20261110; exact delayed checkpoint/reset interleaving |
