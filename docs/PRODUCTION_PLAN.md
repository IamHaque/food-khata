# Food Khata: Production Readiness Plan (BDD)

Plan v1.1 · 11 Nov 2026 · baseline commit `30d2a6c` · 0 of 20 stories DONE · Gates G0 and GC not started

## 1. Scope, order and rules

One phase set, in this order. **P0** fixes what you reported and what makes login unusable. **P1** fixes data and flow bugs found in the architecture review. **P2** makes concurrency and speed predictable. **P3** closes security and operations gaps. **P4** removes dead code, adds the load suite, and aligns docs. Nothing in P2 to P4 starts before Gate G0 (P0 merged and green).

**Goal.** A server a household can run for months without babysitting: no login loops, no cross-user surprises, no silent data loss, no wedged queues, bounded memory, and one document that says how to run, back up and recover it.

**Intake.** Your findings are U-1 to U-3. U-1 (the double login prompt) is deferred by you (DEC-P11, BL-206); it is not worked on, but R-13 (restart leaves a half-logged-in session) was reproduced and stays in PR-02. The review findings are R-01 to R-29. Both are in section 1.1 and every row maps to exactly one story.

**Evidence base.** Read: all Python under `food_khata/`, the access feature of `dashboard-ui/src`, `docs/ACCESS_PLAN.md`, `docs/architecture.md`, `README.md`, CI and `scripts/verify.mjs`. **Ran on 11 Nov** (backend only, `TestClient`, synthetic data): the owner setup then login sequence, a server restart with a kept session cookie, a stale CSRF login, and the job table after a restart (rows in section 5.8). **Not run:** pytest, vitest, Playwright, any load or timing measurement, any browser. Anything marked *by reading* must be reproduced by the story's first scenario before a fix is written; if it does not reproduce, log a DEV and drop that fix. Every number in section 2 is a proposal, not a measurement.

**Tracker rules** (same as the access plan):

- Statuses: TODO, IN\_PROGRESS, BLOCKED, DEFERRED, DONE. One IN\_PROGRESS story per worktree.
- DONE only when every scenario passes in `verify` on trunk after merge, and the Progress row holds date, commit and evidence. Anything less stays IN\_PROGRESS.
- A change from a story's text goes in the Deviation log in the same commit. A choice goes in the Decision log. Work found but not done goes in the Backlog. A stop goes in Blockers.
- Logs are tables with fixed columns. `brief.mjs lint` fails verify on a ragged row.

**Hard rules.**

- Synthetic data only. No automated test logs in to Swiggy or Zomato. Every test uses `FakeProvider`, enabled only through the test-only switch from PR-04.
- **The main agent writes, reviews and merges every line of production code in high-risk stories** (auth, sessions, encryption, migrations, concurrency, job runner, deletion). Sub-agents are used only where section 3.2 allows, and their output is read line by line before merge.
- Every schema change is additive and versioned (PR-10 adds the version table). No story drops or rewrites user data in place without a backup step and a test on a copy.
- Every concurrency fix ships with a test that really runs concurrent actors (threads or processes), not a mock of one.
- Every performance fix logs a before and after number from the same dataset in the Verification log.
- Contract changes follow C-1 rules: additive changes go in C-2 with regenerated frontend types; a breaking change needs a DEC.

**IDs.** PR = production story, G = gate, U = your finding, R = review finding. DEC, DEV, BL, BLK, OQ = log entries.

### 1.1 Findings register

Evidence: **RUN** = reproduced by a command on 11 Nov, **READ** = from reading the code, **USER** = your report (root cause partly by reading).

| ID | Source | Finding | Evidence | Sev | Story |
| --- | --- | --- | --- | --- | --- |
| U-1 | You | Owner enters credentials, presses Login, is asked to log in again, then reaches the dashboard | USER; ordinary login did not reproduce | Deferred | BL-206 |
| U-2 | You | Login and register end on the dashboard (`/`) instead of Home (`/home`) | USER; READ (`returnUrl` defaults to `/`, Setup and Register route to `/login`) | P0 | PR-03 |
| U-3a | You | A fake provider is offered in the UI and accepted by the API; it is the default choice | USER; READ (`LinkAccount.tsx` default `"fake"`, API and storage allow `fake`) | P0 | PR-04 |
| U-3b | You | An "All Accounts" (all data) entry exists next to real accounts | USER; READ (`AccountSelector.tsx`); meaning assumed, see OQ-9 | P0 | PR-05 |
| R-13 | Review | A session can be valid but locked: after a restart `/api/auth/me` returns 200 while `/api/accounts` returns 401; the client answers any 401 with a hard page redirect; a stale CSRF token gives 403 | RUN | P0 | PR-01, PR-02 |
| R-23 | Review | Legacy single-database fallback can serve one shared database to any logged-in user | READ | P1 | PR-05 |
| R-01 | Review | An account can only be synced, re-verified and listed for its first provider; Zomato plus Swiggy on one phone merge into one account that the UI treats as one provider | READ | P1 | PR-06 |
| R-02 | Review | `submit_code` only verifies a code when a provider instance is attached; only tests attach one. In production it re-queues the stale session | READ | P1 | PR-07 |
| R-12 | Review | After a restart a queued job stays queued forever (no payload) and counts against the 2-queued limit, blocking new syncs | RUN | P1 | PR-07 |
| R-03 | Review | Incremental ingest skips every order id already imported, so repaired details and later status changes never reach analytics | READ | P1 | PR-08 |
| R-04 | Review | If auto-import fails after a successful sync the job is still `done` and the UI says "Sync complete" | READ | P1 | PR-08 |
| R-15 | Review | Disconnect-and-wipe deletes only `orders` and `order_items` rows, with default pragmas and `except: pass`; restaurants, addresses, imports and quarantine remain, and failures are hidden | READ | P1 | PR-09 |
| R-16 | Review | `prune_job_events` and expired-session cleanup are never scheduled; owner cannot remove a user's data | READ | P1 | PR-09 |
| R-09 | Review | "One owner per provider account" is a file scan across users and is not atomic; quota is checked after the SMS code is spent | READ | P2 | PR-10 |
| R-24 | Review | First-owner claim is check-then-insert (two requests can both win); `transfer_ownership` can target a disabled user | READ | P2 | PR-10 |
| R-25 | Review | Login handles and the in-memory login service have no size cap or sweep | READ | P2 | PR-10 |
| R-17 | Review | At most one running job per provider across all users, with no queue position or ETA; Swiggy at about 1 request per second makes later users wait for hours | READ | P2 | PR-11 |
| R-18 | Review | Every progress event opens new SQLite connections (two per event) and the pacing lock sleeps while held, so cancel is blind to it | READ | P2 | PR-11 |
| R-19 | Review | One `/api/dashboard` call runs about 25 serial queries for all five pages; `health` runs about 12; item leaders run one query per row; `/api/orders/slim` is unbounded; the cache has no total bound | READ | P2 | PR-12 |
| R-14 | Review | Every authenticated request writes the session row and commits (idle-timeout touch) | READ | P2 | PR-02 |
| R-22 | Review | Banners poll `/api/sync/jobs` every 3 s on every page, forever | READ | P2 | PR-13 |
| R-05 | Review | `/api/owner/setup` is not rate limited and the setup code is 32 bits; the same code is accepted through register's `join_code` field | READ | P3 | PR-14 |
| R-07 | Review | No HTTP route lets a user change their own password; the library function exists | READ | P3 | PR-14 |
| R-28 | Review | Password rule is length 8 only; sessions have an idle limit but no absolute lifetime; no "log out everywhere" | READ | P3 | PR-14 |
| R-20 | Review | `x-session-id` header is accepted as a session; cookie `Secure` is decided from a client-supplied `x-forwarded-proto` | READ | P3 | PR-15 |
| R-21 | Review | No security headers (CSP, frame, nosniff, referrer), no body-size limit, no audit trail for admin actions | READ | P3 | PR-15 |
| R-06 | Review | Keys, login handles, job payloads and cache live in process memory; a second server on the same data folder silently diverges | READ | P3 | PR-16 |
| R-26 | Review | No backup or restore command, no readiness probe, no structured redacted log, no run-as-a-service guidance | READ | P3 | PR-16 |
| R-11 | Review | Dead and duplicated code: `SyncService` stubs, alias chains, `isAuthenticated()` reading an unused token, copy-pasted helpers, duplicate lazy route imports | READ | P4 | PR-17 |
| R-10 | Review | README and `architecture.md` describe 5 or 7 routes, a loopback-only server and a read-only API; the code has LAN mode, write endpoints and 5 pages plus redirects | READ | P4 | PR-19 |
| R-27 | Review | Dependencies are ranges, not locked for Python; no audit step in CI | READ | P4 | PR-20 |
| R-29 | Review | No automated concurrency, soak or failure-injection suite | READ | P4 | PR-18 |
| R-08 | Review | Merged into U-3a (fake provider reachable through production routes) | READ | P0 | PR-04 |

## 2. Definition of production ready

All values are proposals (DEC-P1 to DEC-P3) until measured on the `--large` synthetic dataset on the machine you will run on.

| Area | Target | Checked in |
| --- | --- | --- |
| Login flow | One login request lands on Home; after a server restart exactly one clean redirect to `/login` | PR-01, PR-02, PR-03 |
| Login cost | p95 under 600 ms (two scrypt runs per login) | PR-02 |
| Session check | Under 5 ms p95 added to an authenticated request; no write on most requests | PR-02 |
| Dashboard | p95 under 500 ms cold and under 50 ms cached (or 304) for 20,000 orders | PR-12 |
| Concurrency | 8 users reading while 2 syncs write for 5 minutes: zero 5xx, zero "database is locked" | PR-18 |
| Job writes | At most 1 progress write per second per job | PR-11 |
| Queue | No job stays queued after a restart; every queued job shows position and ETA | PR-07, PR-11 |
| Memory | Idle server under 200 MB; 8 users and 2 jobs under 400 MB; flat over a 30 minute soak | PR-18 |
| Data integrity | Kill the server at random points in a sync: no duplicate or half-imported orders; a resume finishes | PR-18 |
| Security | Every item in the PR-14 and PR-15 scenarios passes; no secret in logs | PR-14, PR-15 |
| Operations | Backup then restore on an empty folder reproduces the data; second server on the same folder refuses to start | PR-16 |
| Docs | A new user can install, claim, link (fake), sync and back up from the README alone | PR-19 |

## 3. Orchestration design (main agent plus sub-agents)

### 3.1 Pre-planning checklist

| Check | Result | Handled in |
| --- | --- | --- |
| Repetitive patterns abstracted | Auth and user lookups are repeated across four routers; helpers are copy-pasted (`_get_client_ip`, `_is_loopback_client`, `_cached_status`, `get_auth_db`) | PR-17 creates `serve/deps.py`; PR-02 starts it for auth |
| Story count balanced | 20 stories plus 2 gates, each aimed at 150 to 350 diff lines; the three biggest (PR-07, PR-10, PR-11) may split at 450 | Stories below |
| File boundaries non-overlapping | Every story lists `Owns`. Shared files (`runner.py`, `routes_accounts.py`, `app.py`) are owned by one story per wave | 3.3 |
| Reproduce before fixing | PR-01 writes failing tests first for U-2, U-3 and R-13 | PR-01 |
| Verify under 20 s | The existing fast path is about 20 s by its own log; browser and load suites run only at gates | FX-02 harness (already merged) |
| Context too large for one agent | The backend is about 11k lines and the frontend about 2k lines of access code; high-risk stories need the whole auth, storage and runner picture at once | 3.2 |

### 3.2 When to use a sub-agent

The main agent keeps the whole picture. A task goes to a sub-agent only if all four hold: it is isolated to files the packet names, the packet is 12,000 tokens or less (the free models have small contexts), a test or script can prove it right or wrong, and it is not security, crypto, migration or concurrency core.

| Task type | Who | Why |
| --- | --- | --- |
| Reproduction tests for U-2, U-3, R-13 (PR-01) | Sub-agent, browser | Mechanical, provable, needs Playwright |
| Auth, sessions, vault, ownership, uniqueness (PR-02, PR-10, PR-14) | Main agent | A wrong line is a security bug; needs all of `auth/`, `users/`, `serve/app.py` in view |
| Job runner, recovery, import integrity (PR-07, PR-08, PR-11) | Main agent | Concurrency and data integrity; needs `jobs/`, `services/`, `db.py` together |
| Delete and wipe paths (PR-09) | Main agent | Data loss risk |
| Query plan evidence for PR-12 | Sub-agent report only | Produces `EXPLAIN QUERY PLAN` and timings; the main agent writes the fix |
| Frontend polling and defaults (PR-13), dead-code purge (PR-17), docs (PR-19), dependency lock and audit (PR-20), load harness (PR-18 harness part) | Sub-agent | Mechanical or additive, each proven by tests or scripts |
| Final review at gates | A different model family than the implementers, read-only | Independent check |

Sub-agent rules: the packet includes the full text of section 3.7; it works in its own worktree; it gets repo code and synthetic data only; it returns a diff plus the `verify` result; it must not touch files outside `Owns`; the main agent re-runs `verify` on trunk after merge. If a sub-agent fails verify twice, the main agent takes the story over.

### 3.3 Waves

| Wave | Stories (parallel) | Executor | Barrier after |
| --- | --- | --- | --- |
| W0 | PR-01, PR-20 | sub, sub | PR-01 tests are red for the right reasons |
| W1 | PR-02, PR-04, PR-05 | main (3 worktrees) | verify on trunk, PR-01 restart test turns green |
| W2 | PR-03, PR-06, PR-10 | main | **Gate G0**: PR-01 fully green, browser suite green |
| W3 | PR-07, PR-09, PR-12 | main, main, sub report then main | verify |
| W4 | PR-08, PR-11, PR-14 | main | verify and soak smoke |
| W5 | PR-13, PR-15, PR-16 | sub, main, main | contract freeze C-2 after PR-06 and PR-07 |
| W6 | PR-17, PR-18, PR-19 | sub | verify, load suite |
| W7 | Gate GC | independent review sub-agent, then you | GC |

At most 3 stories per wave. Start any story as soon as its dependencies merge and a slot is free.

### 3.4 Dispatch, trunk check and failover

- Worktrees symlink `node_modules` and the venv. Never copy them.
- Pre-merge: the story's agent runs `verify` in its worktree. Post-merge: the main agent runs `verify` on trunk. Gates add build, bundle check, browser suite, load suite and the full pytest run.
- Merge one branch at a time.
- Model ladder (DEC-P10), by task class. **High-risk stories (main agent):** the strongest Gemini model available; on quota or 429 the next Gemini model; Haiku only as a last resort. **Sub-agent and mechanical work:** an opencode free model first, then a Gemini Flash-class model, then Haiku as a last resort. After 2 failed verifications of one story, move up one rung with only the short failure diff; after 2 more, mark BLOCKED. Haiku is never used to read large files, and every Haiku use is logged in the Delegation ledger with the reason.
- Task packet fields: story ID, `Owns`, scenarios verbatim, files to read, the test command, the 100-line cap on new domain logic, and the sentence "do not touch files outside Owns".

### 3.5 Guidance for the orchestrator

**Weight:** S under 150 diff lines, M 150 to 300, L over 300. **Risk:** normal, or high (security, data loss, concurrency, shared base).

| Story | Weight | Kind | Risk | Executor | Needs |
| --- | --- | --- | --- | --- | --- |
| PR-01 | M | test infra | normal | sub | browser |
| PR-02 | L | auth, frontend | high | main | browser |
| PR-03 | S | frontend | normal | main | browser |
| PR-04 | S | backend, frontend | normal | main | none |
| PR-05 | M | backend, frontend | high (isolation) | main | browser |
| PR-06 | L | backend, frontend | high (shared contract) | main | browser |
| PR-07 | L | backend, frontend | high (concurrency) | main | none |
| PR-08 | L | backend | high (data integrity) | main | none |
| PR-09 | M | backend | high (data loss) | main | none |
| PR-10 | L | backend | high (concurrency, security) | main | none |
| PR-11 | L | backend | high (concurrency, performance) | main | none |
| PR-12 | M | backend | normal | sub report, main fix | none |
| PR-13 | S | frontend | normal | sub | browser |
| PR-14 | L | backend, frontend | high (security) | main | browser |
| PR-15 | M | backend | high (security) | main | none |
| PR-16 | M | backend, docs | normal | main | none |
| PR-17 | M | refactor | normal | sub | none |
| PR-18 | L | test infra | normal | sub harness, main reads results | none |
| PR-19 | S | docs | normal | sub | none |
| PR-20 | S | config | normal | sub | none |

**Critical path.** PR-01, PR-02, PR-03 (user-visible fixes first), then PR-02, PR-10, PR-07, PR-08, PR-11, PR-18, GC. Seven stories long.

### 3.6 Engineering rules for speed and concurrency (apply to every story)

1. **One writer per file.** All writes to `app.db` go through short transactions that take the write lock once (`BEGIN IMMEDIATE`) and finish in under 50 ms. Never hold a lock across a network call or a sleep.
2. **No connection per event.** Hot paths (progress, session lookup) reuse one connection per thread or batch their writes.
3. **Idempotent by key.** Every write that a retry could repeat has a unique key or a receipt (job id, content hash, handle).
4. **Lock order is fixed:** `app.db` transaction, then per-user credential lock, then per-account lock. A test asserts no reverse order exists.
5. **Bound everything in memory:** handles, cache entries, events, payloads. Each bound has a constant, a sweep, and a test.
6. **Fail closed, say so out loud:** any swallowed exception in a data path becomes a logged, user-visible error or is deleted.
7. **Measure first.** A performance story begins by logging the baseline number; a fix with no before and after is not DONE.

### 3.7 Lean agent rules (token budget; applies to the orchestrator and every sub-agent)

Tokens are limited. Agents do not have the ponytail skill, so its rules are written out here and must be pasted into every task packet. Act as a lazy senior developer: the best code is the code never written. Solve the whole problem with the least new code, and write replies a busy human reads in one go.

**Before you write.** Read the story and the code it touches. List every place the change must reach (callers, tests, fixtures, config, exports) and what it could break for users (data destroyed or exposed, callers that stop working). That is scope; extra features are not.

**Take the first option that fully works:**

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line.
2. Already in this codebase (helper, component, service, pattern)? Use it the way the surrounding code does.
3. Standard library or platform feature? Use it, unless the project has its own.
4. An installed dependency? Use it. Never add a dependency for a few lines.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise the minimum code that works.

**Rules**

- Lazy about the solution, never about the change: finish every caller, test and fixture the change breaks.
- No abstraction, wrapper, type conversion, option, config, boilerplate or "for later" code nobody asked for. Deletion beats addition. Keep the existing structure, layers and conventions.
- Shortest working diff wins once you know everything it must touch. A one-liner that needs decoding is not short.
- Comment only the why the code cannot show, in one line.
- Bug fix: grep every caller of the function you touch, then fix the root cause once in the shared code.
- Code you move or merge keeps its error handling and validation.
- Between options of equal size, take the one correct on edge cases.
- New non-trivial logic (a branch, loop, parser, money or security, a new script) gets one small test or assert. Trivial changes need none. Extend existing fixtures.
- A shortcut with a known limit gets the comment `shortcut: <the limit>, <when to upgrade>`.
- **Never cut:** validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything the story's scenarios name.

**Token discipline**

- Read narrow: `grep` and line ranges, only the `Owns` files and their direct callers. Never `cat` big files, lockfiles or generated types; do not re-read an unchanged file.
- Quiet tools: pipe test and build output through `tail -n 30`; show failures only; quote the one failing line.
- Status is at most 5 lines: story, result, evidence (command, pass or fail), deviations, next. No narration, no restating the plan, no summarising a diff.
- Update the tracker tables in the commit, not in chat.
- Run the story's own tests and fast `verify` first; browser, load and soak suites only at wave barriers and gates.
- **End every reply with one or two lines:** what you skipped or did not check, and any risk.

## 4. Stories

### Phase P0: login, landing, fake provider, account scope

#### PR-01 Reproduction harness for the reported bugs \[P0\]

Owns: `dashboard-ui/e2e/auth-flow.spec.ts`, `tests/e2e_access/test_auth_flow.py`, `tests/e2e_access/server.py` (test server flags). Depends: none. Size: about 250 lines. Executor: sub-agent. Covers U-2, U-3, R-13.

- **Scenario: one clean login (regression guard).** Given a fresh data folder and the real backend with the injected test provider (test hook only, no network, switch off) / When the owner is claimed and then logs in once / Then the test records navigations and `/api/*` statuses and fails if `/login` is visited more than once or any 401 follows the login response. It may already pass; U-1 itself is deferred (DEC-P11).
- **Scenario: restart variant (R-13).** Given a logged-in owner / When the server restarts and the owner reloads / Then the test records whether the app stays on a broken page, redirects once, or loops, and asserts the target behaviour (one redirect, one clean login).
- **Scenario: U-2 reproduced.** When login, setup and register each succeed / Then the test asserts the final URL is `/home` and fails today.
- **Scenario: U-3 reproduced, switch off.** Given the server runs with the fake-provider switch off (production-like) and a test-only injected provider / When the Link account screen opens / Then the list is rendered from `GET /api/accounts/providers`, contains no testing option, and nothing is preselected; with one account the selector shows no aggregate row. Both fail today.
- **Scenario: switch on, tested separately.** Given the switch is on / Then the list includes `fake` and linking works (see PR-04). One server cannot be both, so these are two server configurations (DEV-01).
- **Scenario: red for the right reason.** Then each failing test names the story that fixes it, and no test is skipped.

#### PR-02 Session consistency across restarts and 401 handling \[P0\]

Owns: `food_khata/auth/sessions.py`, the two middlewares in `serve/app.py`, `serve/routes_auth.py`, `serve/deps.py` (new: current user, cipher), `dashboard-ui/src/features/access/api/client.ts`, `auth/index.tsx`, `welcome/Login.tsx`. Depends: PR-01. Size: about 350 lines. Executor: main agent. Covers R-13, R-14.

Scope note: the double prompt (U-1) is deferred. This story fixes only what was reproduced or is cheap: the locked-session state after a restart, the hard page reload on 401, and CSRF recovery. Do not hunt for U-1.

- **Scenario: no key means no session.** Given sessions are stored in `app.db` but keys live only in memory / When the server starts / Then every row in `sessions` is deleted at startup, so a cookie from before a restart gets one clean 401 `SESSION_EXPIRED` and never a half-authenticated state.
- **Scenario: locked session is closed, not half open.** Given a valid session row with no key in memory (a worker race or manual DB edit) / When any authenticated request arrives / Then the middleware deletes the session and returns 401 `SESSION_EXPIRED`, and `/api/auth/me` and `/api/accounts` always agree.
- **Scenario: login seeds the user.** When the owner submits correct credentials once / Then the client seeds `["auth","me"]` from the login response so the next route needs no extra fetch.
- **Scenario: 401 handling without page reloads.** When any request returns 401 / Then the client handles it once (single flight), clears the cache, and navigates with the router to `/login?return=<path>&reason=expired`; it never uses `window.location`; it does nothing if already on an access page; `/api/auth/me` returning 401 is handled by `RequireAuth`, not by the global handler.
- **Scenario: login page knows you are logged in.** Given a valid session / When `/login`, `/welcome` or `/register` opens / Then the app redirects to the landing page (PR-03) after one `/me` call.
- **Scenario: CSRF recovery.** When a state-changing request gets 403 `forbidden` for CSRF / Then the client refreshes the token once and retries once; a second 403 is shown as an error.
- **Scenario: session touch is cheap (R-14).** Then `last_active` is written at most once per 60 s per session, the lookup is a single indexed read, and a test with 1,000 requests shows at most 20 writes.
- **Scenario: login cost.** Then the two scrypt runs (password check and vault unwrap) run off the event loop (sync route in the threadpool or `run_in_threadpool`), and 8 parallel logins do not stall `/health`.
- **Scenario: message for the user.** Given `reason=expired` / Then the login screen says "Your session ended. Sign in again." and keeps the typed username.

#### PR-03 Landing on Home and navigation rules \[P0\]

Owns: `features/access/welcome/{Login,Register,Setup,Welcome}.tsx`, `features/access/auth/index.tsx` (landing helper only), `app/App.tsx` (route table), `features/access/accounts/Home.tsx`. Depends: PR-02. Size: about 150 lines. Executor: main agent. Covers U-2.

- **Scenario: login lands on Home.** Given no `return` parameter / When login succeeds / Then the URL is `/home`.
- **Scenario: explicit return is respected.** Given `return=/orders` that passes `safeReturnPath` / Then login lands on `/orders`; any other value falls back to `/home`. The `return` parameter keeps its query string.
- **Scenario: setup lands on Home.** When the owner claim succeeds / Then the app goes to `/home` directly, because the server already created the session; it does not show the login screen.
- **Scenario: register.** When registration succeeds / Then the user goes to `/login?registered=true`, and after login lands on `/home`.
- **Scenario: dashboard needs data.** Given a user with zero linked accounts / When they open `/` / Then they are redirected to `/home` (no empty dashboard shell).
- **Scenario: Home is the hub.** Then Home lists accounts and the latest sync state, has Link account, Sync now and Open dashboard actions, and the header brand links to `/home` for access pages and `/` for the dashboard.
- **Scenario: no duplicate routes.** Then `/accounts` and `/home` are one route (the other redirects) and the lazy imports are not duplicated.

#### PR-04 Remove the fake provider from the product \[P0\]

Owns: `providers/base.py`, `storage.py` (`_provider`), `services/linking.py`, `serve/routes_accounts.py` (provider validation only), `features/access/accounts/LinkAccount.tsx`, `tests/e2e_access/server.py`. Depends: none. Size: about 120 lines. Executor: main agent. Covers U-3a, R-08.

- **Scenario: off by default.** Given a normal start / When `POST /api/accounts/link/start` names `fake` / Then it returns 400 `INVALID_PROVIDER`, the same as any unknown name.
- **Scenario: test switch.** Given `FOOD_KHATA_ENABLE_FAKE_PROVIDER=1` is set by a test server or test fixture / Then `fake` works and `GET /api/accounts/providers` includes it. The switch is read once at startup, is never settable over HTTP, and the server prints a warning line when it is on.
- **Scenario: server-driven list.** Then the UI builds its provider list from `GET /api/accounts/providers` (no hard-coded options) and nothing is preselected; the Send code button is disabled until a provider is chosen.
- **Scenario: leftovers.** Given an existing `fake` account in a real data folder / Then Home shows it with a Remove action, dashboards never count it (ingest already ignores it, now covered by a test), and `food-khata purge-fake` (PR-16 CLI group) removes it.
- **Scenario: injected test provider.** Then browser and e2e tests that only need a provider use one provider attached through the test hook of `create_app` (no env var, no CLI flag, no HTTP, no network), and a test proves a normal `serve` start has none. Tests that exercise `fake` itself set the switch through one fixture.

#### PR-05 Account scope: what "All" means, and no shared database \[P0\]

Owns: `dashboard-ui/src/app/AccountSelector.tsx`, `FilterContext.tsx`, `serve/db.py`, the `connection` dependency in `serve/app.py`, `serve/filters.py` (account ids guard). Depends: none. Size: about 200 lines. Executor: main agent. Covers U-3b, R-23.

- **Scenario: one account, no aggregate.** Given a user with exactly 1 linked account / Then the selector shows that account's label with no "All" row, and the filter is implicit.
- **Scenario: several accounts.** Given 2 or more / Then the aggregate row reads "All my accounts (n)", and its tooltip says it covers only the signed-in user's accounts.
- **Scenario: never another user's data.** Given users A and B / When A requests with `account_ids` that belong to B / Then the API returns 422 `INVALID_ACCOUNT` (or an empty result with that code), and `/api/meta/filters.all_accounts` lists only A's accounts. A test covers every endpoint that accepts `account_ids`.
- **Scenario: legacy fallback is off in production.** Then `resolve_user_database` never returns a shared legacy file in a real `serve` run; the fallback exists only behind an explicit `legacy_single_db=True` argument used by old tests, and `serve` cannot set it.
- **Scenario: empty user.** Given a user with no database yet / Then the API returns 200 with empty aggregates (or 503 `database_not_found` only for a missing file that should exist), and the UI shows the PR-03 redirect rather than an error banner.
- **Scenario: labels.** Then accounts are labelled by provider and last four digits ("Swiggy ••••1234"), never by raw ids.

### Phase P1: data and flow correctness

#### PR-06 One account, several providers \[P1\]

Owns: `serve/routes_accounts.py`, `serve/routes_sync.py` (create and resume), `serve/schemas_accounts.py`, `schemas_sync.py`, `features/access/accounts/**`, `features/access/sync/**`. Depends: PR-04, PR-05. Size: about 350 lines. Executor: main agent. Covers R-01. Contract C-2 (additive).

- **Scenario: reproduce.** Given a local account bound to the same phone for Zomato and Swiggy / When `GET /api/accounts` runs / Then today it returns one row for one provider. The test fails first.
- **Scenario: one row per provider.** Then the list returns one row per (account, provider), each with its own status, last sync, and order count.
- **Scenario: explicit provider.** Then `POST /api/sync/jobs`, verify-again and disconnect take a `provider` field; when the account has exactly one provider the field is optional, otherwise omitting it returns 422 `PROVIDER_REQUIRED`.
- **Scenario: jobs per provider.** Then two providers on one account can have two jobs, each in its own archive file, and the runner's per-provider rules apply.
- **Scenario: UI.** Then Home shows one card per provider with its own Sync, Verify again and Disconnect, and the Link flow says "added Zomato to the account for ••••1234" when the phone matches.
- **Scenario: disconnect one.** Then disconnecting Swiggy keeps Zomato's session and data.

#### PR-07 Job recovery and the needs-code path \[P1\]

Owns: `jobs/runner.py` (startup and control only), `jobs/db.py`, `serve/routes_sync.py` (`/code`, resume), `features/access/sync/Sync.tsx`. Depends: PR-02, PR-10. Size: about 300 lines. Executor: main agent. Covers R-02, R-12. Contract C-2.

- **Scenario: no orphan queue.** Given jobs left `queued`, `needs_code` or `paused` in `app.db` / When the server starts / Then each becomes `interrupted` with code `RESTART` and an event, and a user with 2 such jobs can submit a new sync at once. (RUN: today a `queued` job survives and counts against the limit.)
- **Scenario: needs code is a re-login.** When a job hits an expired provider session / Then it becomes `needs_code` with the account and provider named, and the UI offers Verify again for that account; after the SMS code verifies, the job is resumed automatically with the fresh session.
- **Scenario: no fake success.** Then the `POST /api/sync/jobs/{id}/code` route is removed from C-2 (DEV logged), because a code cannot repair an expired provider session without a new login; a request to it returns 404.
- **Scenario: expiry is database-driven.** Given a `needs_code` or `paused` job older than 24 h / When the sweeper runs (PR-09 scheduler) / Then it becomes `interrupted`, whether or not an in-memory payload exists.
- **Scenario: one active job per account and provider.** Given a job is queued or running for an account and provider / When another is submitted / Then it returns 409 `ACCOUNT_BUSY` (backed by a partial unique index, not a check-then-insert).
- **Scenario: resume after restart.** When the user logs in after a restart and presses Resume / Then the job re-queues with a session read from storage, runs from the last checkpoint, and creates no duplicate orders.

#### PR-08 Import integrity and fresh data \[P1\]

Owns: `food_khata/db.py` (ingest and migration), `jobs/runner.py` (finish stage and `use_partial` only), `serve/routes_sync.py` (retry import), `services/sync.py` (refresh window). Depends: PR-07. Size: about 400 lines (split ingest from runner at 450). Executor: main agent. Covers R-03, R-04.

- **Scenario: reproduce R-03.** Given an order imported with history only / When a `missing` sync adds its details / Then today the analytics row stays without details. The test fails first.
- **Scenario: upsert on change.** Then `orders` gets an additive `source_hash` column (hash of the stored history and details); ingest skips an order only when its hash is unchanged, so repaired details and refreshed statuses update the row, its items, and `financial_verified`, in one savepoint per order.
- **Scenario: recent orders refresh.** Given orders younger than 14 days whose status is not final / When a `new` sync runs / Then their details are fetched again (capped at 50 per run) so refunds and cancellations appear.
- **Scenario: import is a visible stage.** Then a finished archive moves the job to phase `importing`, and an import error ends it `failed` with code `IMPORT_FAILED`, `resumable` and `import_pending=true`; the UI shows "Fetched, import failed" and a Retry import button; no "Sync complete" appears.
- **Scenario: retry import is idempotent.** When Retry import runs twice / Then orders are not duplicated and the second run reports 0 changes.
- **Scenario: data health shows the truth.** Then `archive_imports` is updated only after a successful import, and the Data health panel lists the quarantine count with a link to the reasons.
- **Scenario: speed.** Given 5,000 archived orders and 5 changed / When incremental ingest runs / Then only changed orders are parsed (hash comparison is in SQL or a single set lookup) and the time is logged before and after.

#### PR-09 Data lifecycle: wipe, remove user, retention \[P1\]

Owns: `serve/routes_accounts.py` (disconnect), `serve/routes_owner.py` (remove user), `auth/owner.py`, `users/context.py`, `food_khata/maintenance.py` (new scheduler), `db.py` (delete helpers). Depends: PR-06. Size: about 300 lines. Executor: main agent. Covers R-15, R-16.

- **Scenario: wipe is complete.** When a user disconnects an account with wipe / Then, in one transaction on a connection with WAL and busy-timeout set, the account's orders, items, quarantine rows, `archive_imports` row and receipts are deleted, orphaned restaurants and addresses are removed, the account folder is deleted, and a dashboard query afterwards shows nothing for it.
- **Scenario: failures are loud.** When any step fails / Then nothing is half deleted (the database step rolls back and the files stay), the API returns 500 `WIPE_FAILED`, and the error is logged without personal data.
- **Scenario: running job blocks wipe.** Given a running job for that account / Then the wipe cancels it first and waits for it to stop, or returns 409 `ACCOUNT_BUSY`.
- **Scenario: owner removes a user.** When the owner removes user X with their own password / Then X's sessions, jobs, provider links (PR-10), `users/<id>/` folder and row are deleted, the username can be reused, and the owner cannot remove themselves.
- **Scenario: scheduler.** Then one background thread runs hourly: delete expired sessions, prune `failed_logins` and `registration_attempts`, prune `job_events` older than 7 days (BL-103 decided) and terminal jobs older than 90 days, and checkpoint the WAL; each task is a function with its own test and a logged count.
- **Scenario: no overlap.** Then the scheduler holds no lock longer than 50 ms per batch (deletes run in chunks of 500).

### Phase P2: concurrency and performance

#### PR-10 Atomic ownership, uniqueness and bounded state \[P2\]

Owns: `auth/sessions.py` (schema and migrations), `auth/owner.py`, `serve/routes_auth.py` (register and claim), `services/linking.py`, `serve/routes_accounts.py` (link start and verify), `food_khata/migrations.py` (new). Depends: PR-02. Size: about 400 lines. Executor: main agent. Covers R-09, R-24, R-25.

- **Scenario: migration framework.** Then `schema_migrations(version, applied_at)` exists in `app.db`, each migration runs once inside a transaction, a failed one leaves the database unchanged, and a test starts from the current schema with data in it.
- **Scenario: one owner, always.** Given 20 simultaneous first-claim requests (threads) / Then exactly one succeeds and the rest get 404 or 409, enforced by a partial unique index on `users(is_owner) WHERE is_owner = 1` and `BEGIN IMMEDIATE`; ownership transfer swaps in one transaction and refuses a disabled target.
- **Scenario: provider account exclusivity.** Then `provider_links(provider, identity_hash PRIMARY KEY, user_id, account_id)` replaces the file scan; the link is inserted in the same step as the account bind; two users linking the same provider account at once gives one success and one 409 `PROVIDER_ACCOUNT_TAKEN`; startup backfills the table once from existing folders; disconnect and user removal delete the row.
- **Scenario: quota first.** Given a user at 5 linked logins / When they press Send code for a new phone / Then they get 409 `QUOTA` before any SMS is requested.
- **Scenario: handles are bounded.** Then the login-handle store holds at most 200 entries and 3 pending per user, expired ones are swept every minute, a handle is deleted on use, and a test proves the dict returns to empty.
- **Scenario: lock order.** Then a test takes the credential lock and an account lock in both orders from two threads and finds no deadlock because only one order exists in code.

#### PR-11 Job runner throughput and write cost \[P2\]

Owns: `jobs/runner.py`, `jobs/db.py`, `services/sync.py` (events), `providers/http.py` (cancel-aware waits), `serve/schemas_sync.py` (position, ETA). Depends: PR-07, PR-10. Size: about 450 lines (split runner from store at 450). Executor: main agent. Covers R-17, R-18.

- **Scenario: baseline.** Given a `FakeProvider` with 1,000 orders and 8 users / When all start a sync / Then the test logs connections opened, progress writes, and total time. The numbers go in the Verification log.
- **Scenario: cheap progress.** Then each job thread keeps one connection, progress writes are coalesced to at most one per second per job (plus phase changes and the final state), and `job_events` rows per job are capped by sampling (first, last, every Nth, and all errors).
- **Scenario: provider concurrency is configuration.** Then `--provider-concurrency swiggy=1,zomato=1` (default 1 each, DEC-P4) sets how many jobs may run per provider; pacing is per provider and uses a monotonic slot, not a sleep while holding a lock.
- **Scenario: fair order.** Given user A has 2 queued jobs and users B and C have 1 each / Then the start order is A, B, C, A (round robin by user, oldest first within a user), not first-come across the whole table.
- **Scenario: queue is visible.** Then every queued job returns `queue_position` and `eta_seconds` (from recent page timings, or null with no history), and the Sync screen shows "3rd in line, about 40 minutes".
- **Scenario: cancel is prompt.** Given a job waiting inside a provider retry sleep / When cancel is pressed / Then the job stops within 2 s, because sleeps and pacing waits check the cancel token every 250 ms.
- **Scenario: graceful shutdown.** When the server gets Ctrl-C or SIGTERM / Then running jobs checkpoint and become `interrupted` with code `SHUTDOWN` within 10 s, and the process exits.
- **Scenario: no lock held while waiting.** Then `process_queue` reads candidates in one indexed query outside the runner lock and takes the lock only to start threads.

#### PR-12 Dashboard and read-path performance \[P2\]

Owns: `serve/app.py` (read endpoints only), `serve/{metrics,charts,food,behavior,places,spending,filters}.py`, `docs/proposed_indexes.sql` (becomes a migration), `scripts/make_synthetic_data.py`. Depends: PR-05. Size: about 350 lines. Executor: sub-agent writes the plan report, main agent writes the fix. Covers R-19. Contract C-2 (additive `sections`).

- **Scenario: evidence first (sub-agent report).** Given `make_synthetic_data.py --orders 20000` / Then a report lists every query behind `/api/dashboard`, `/api/meta/*`, `/api/restaurants`, `/api/items` with `EXPLAIN QUERY PLAN`, timings, and rows scanned. No code change in this step.
- **Scenario: indexes.** Then the useful indexes from the report (starting from `idx_orders_account_platform_date` and `idx_items_order_category`) are applied by a migration, each with a before and after timing; unused ones are dropped from the proposal.
- **Scenario: only what the page needs.** Then `POST /api/dashboard` accepts an optional `sections` list (overview, spending, food, behavior, places); the UI asks for the section of the open page; the default stays "all" so C-1 clients keep working.
- **Scenario: health in two queries.** Then data health uses at most 2 queries instead of about 12.
- **Scenario: no N+1.** Then item leaders fetch all price trends in one grouped query for the page's items.
- **Scenario: bounded responses.** Then `/api/orders/slim` is paged or capped at 5,000 rows with a `truncated` flag, and `/api/meta/filters` is cached per user and database version.
- **Scenario: cache is bounded.** Then the dashboard cache is an LRU with at most 64 entries total and 8 per user, and responses carry an `ETag` from the database version so an unchanged page returns 304.
- **Scenario: targets.** Then the section 2 dashboard numbers pass on the `--large` dataset, and a regression test fails if the query count per endpoint grows.

#### PR-13 Frontend load and polling \[P2\]

Owns: `features/access/banners/AccessBanners.tsx`, `app/providers.tsx`, `lib/api.ts`, `hooks/api.ts`, `features/access/sync/Sync.tsx` (poll only). Depends: PR-02. Size: about 150 lines. Executor: sub-agent. Covers R-22.

- **Scenario: adaptive polling.** Then job polling is 3 s only while a job is active, 30 s otherwise, and stops while the tab is hidden; on return it refetches once.
- **Scenario: sensible query defaults.** Then `QueryClient` sets `staleTime` 30 s, `retry` 1 for network errors and 0 for 4xx, and `refetchOnWindowFocus` off for dashboard queries.
- **Scenario: cancel stale requests.** Then switching filters aborts the previous in-flight request (signals already passed; the test proves the abort).
- **Scenario: error boundary.** Then a thrown render error shows a recoverable error screen with Reload and Go to Home, not a white page.
- **Scenario: budget holds.** Then the entry chunk stays within the existing 250 kB gzip budget.
- **Scenario: one polling request.** Then two components that need the job list share one query and one network request per interval.

### Phase P3: security and operations

#### PR-14 Owner claim, passwords and session lifetime \[P3\]

Owns: `serve/routes_owner.py` (setup), `serve/routes_auth.py` (register, change password, sessions), `auth/{owner,passwords,registration}.py`, `users/context.py` (change), `features/access/owner/**`, a new `features/access/account/Password.tsx`. Depends: PR-10. Size: about 400 lines. Executor: main agent. Covers R-05, R-07, R-28.

- **Scenario: one claim path.** Then `/api/auth/register` never creates the owner and never accepts a setup code; only `/api/owner/setup` claims, and the join code is separate from the setup code.
- **Scenario: claim is throttled.** Given 5 wrong setup codes from one address in 10 minutes / Then the next returns 429 with `Retry-After`; the setup code is 10 characters from a 32-letter alphabet (50 bits), expires after 30 minutes, and a new one prints on the next `--lan` start.
- **Scenario: change own password.** When a user posts their current and new password / Then the vault is re-wrapped (provider sessions stay readable), the password hash changes, all other sessions of that user are deleted, a new session is issued, and a wrong current password counts as a failed login.
- **Scenario: password rule.** Then new passwords need 10 or more characters and are rejected if they equal the username or appear in a bundled list of the 1,000 most common passwords; the register screen shows the rule before submit.
- **Scenario: absolute lifetime.** Then a session ends 7 days after login even if active, in addition to the 8 h idle limit, and the message says why.
- **Scenario: log out everywhere.** When the user asks / Then every session for that user is deleted, and keys for them leave memory.
- **Scenario: owner admin rules.** Then reset and transfer keep asking for the owner password, and every admin action writes an audit row (PR-15).

#### PR-15 HTTP hardening and audit trail \[P3\]

Owns: `serve/security.py`, the middlewares in `serve/app.py` (headers only), `auth/sessions.py` (cookie flags), `serve/cli.py`, `food_khata/audit.py` (new). Depends: PR-02. Size: about 250 lines. Executor: main agent. Covers R-20, R-21.

- **Scenario: cookie only.** Then the `x-session-id` header is no longer accepted as a session; only the cookie is.
- **Scenario: Secure flag from config.** Then `Secure` is set when the server runs TLS or when `--behind-https-proxy` is passed; a client `x-forwarded-proto` header never changes it.
- **Scenario: trusted proxy is opt-in.** Given `--trusted-proxy 192.168.1.1` / Then the client address for throttling comes from `X-Forwarded-For` only when the peer is that address; otherwise the header is ignored.
- **Scenario: headers.** Then every response has `Content-Security-Policy` (self only, no inline script; the built UI is checked against it in the browser suite), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Strict-Transport-Security` when HTTPS.
- **Scenario: body limit.** Then request bodies over 64 KB return 413 for JSON routes.
- **Scenario: audit trail.** Then `audit_log(at, actor, action, target, ip)` records logins (success and failure), owner claim, window open and close, join code rotation, user disable, reset, remove, ownership transfer, and password changes; it holds no passwords, codes or phone numbers, and the owner can read the last 200 rows in Settings.
- **Scenario: no secrets in logs.** Then a test greps captured logs from a full journey for passwords, setup codes, join codes, OTP codes, tokens and full phone numbers and finds none.

#### PR-16 Operability \[P3\]

Owns: `serve/cli.py`, `cli.py` (new subcommands), `food_khata/config.py` (new), `food_khata/logging.py` (new), `food_khata/backup.py` (new), `docs/RUNBOOK.md`. Depends: PR-09, PR-15. Size: about 300 lines. Executor: main agent. Covers R-06, R-26.

- **Scenario: one server per data folder.** Given a server is running on a data folder / When a second starts on it / Then it exits with a clear message and code 2, using an OS lock on `<data-dir>/.server.lock` that is released when the process dies.
- **Scenario: readiness.** Then `GET /health/ready` (no login) returns 200 only when `app.db` opens, migrations are current, and the scheduler is alive, with no counts or names in the body; `/health` stays as liveness.
- **Scenario: configuration.** Then every flag has an environment variable (`FOOD_KHATA_*`), flags win over env, and `food-khata serve --print-config` shows the effective values with secrets hidden.
- **Scenario: logs.** Then logs are one JSON line per event with level, time, request id and user id (never username or phone), pass through a redaction filter, and rotate at 10 MB with 5 files.
- **Scenario: backup.** When `food-khata backup --out FILE` runs (server stopped or running) / Then it uses SQLite's backup API for each database, copies archives and vaults, writes a tar with a manifest and checksums, and reports that archives and analytics inside are not encrypted.
- **Scenario: restore.** When `food-khata restore FILE --data-dir EMPTY` runs / Then an empty folder is rebuilt, checksums are verified, and a non-empty folder is refused; a test restores and logs in.
- **Scenario: purge helpers.** Then `food-khata purge-fake` removes fake accounts (PR-04) after a confirmation.
- **Scenario: running it for real.** Then `docs/RUNBOOK.md` has a Windows service (Task Scheduler or NSSM) and a systemd unit, the update procedure (stop, backup, pull, build, start), and the recovery commands.

### Phase P4: cleanup, load, docs, supply chain

#### PR-17 Dead code and duplication purge \[P4\]

Owns: `services/sync.py` (stubs), `services/linking.py` (aliases), `jobs/runner.py` (aliases), `serve/deps.py`, `routes_*.py` (helpers only), `features/access/auth/index.tsx`, `features/access/routes.tsx`. Depends: PR-06, PR-07, PR-14. Size: about 250 lines, net deletion. Executor: sub-agent. Covers R-11.

- **Scenario: aliases gone.** Then `SyncService`, `use_partial_import` and friends, `ProviderLinkingService`, `Linking`, `JobControl.submit` and `enqueue`, the unused `sync()` keyword aliases (`on_event`, `event_cb`, `callback`, `cancel`, `token`), and `isAuthenticated()` are deleted, with their callers moved to one name.
- **Scenario: one helper each.** Then `_get_client_ip`, `_is_loopback_client`, `_is_secure_request`, `_cached_status` and `get_auth_db` live once in `serve/deps.py`.
- **Scenario: nothing breaks.** Then all tests pass unchanged except renamed imports, and total lines go down.
- **Scenario: legacy decision.** Then `/legacy` and `food-khata export` are either removed with a DEC or kept with a test and a line in the README (DEC-P5).

#### PR-18 Load, soak and failure-injection suite \[P4\]

Owns: `scripts/load_test.py`, `tests/stress/**`, `docs/PERFORMANCE.md`. Depends: PR-11, PR-12. Size: about 400 lines. Executor: sub-agent writes the harness; the main agent runs it and reads the results. Covers R-29.

- **Scenario: mixed load.** Given 8 users and `--large` data / When 6 browse and 2 sync (FakeProvider) for 5 minutes / Then there are zero 5xx and zero "database is locked", and p95 per endpoint is written to `docs/PERFORMANCE.md`.
- **Scenario: kill test.** Given a sync in progress / When the server is killed at 20 random points over 20 runs / Then after restart and resume there are no duplicate orders, no half-imported order, and the final counts equal an uninterrupted run.
- **Scenario: soak.** When the mixed load runs for 30 minutes / Then resident memory at the end is within 10% of minute 5, and the thread and file-handle counts are flat.
- **Scenario: concurrency matrix.** Then simultaneous claim, link of the same provider account, double sync submit, login storm and wipe during sync all end in the specified result codes.
- **Scenario: failure injection.** Then a disk-full style error during checkpoint, a locked `app.db`, and a provider that returns garbage each produce a failed or interrupted job with a code, never a hang.

#### PR-19 Documentation and runbooks \[P4\]

Owns: `README.md`, `docs/architecture.md`, `docs/access/*.md`, `docs/RUNBOOK.md` (review), `docs/PERFORMANCE.md` (link). Depends: PR-16, PR-18. Size: about 250 lines. Executor: sub-agent. Covers R-10.

- **Scenario: accurate.** Then README and `architecture.md` describe the real routes, LAN mode, write endpoints, per-user layout, job states, and the PR-14 and PR-15 behaviour, and every command in them was run once.
- **Scenario: first-hour path.** Then a new user can follow the README to install, build, claim, link with the fake switch on a throwaway folder, sync, view the dashboard, and take a backup.
- **Scenario: honest limits.** Then the docs state that archives and analytics are not encrypted, that the host administrator can read everything, that provider APIs are unofficial and may block accounts, and that one server per data folder is required.
- **Scenario: diagrams.** Then `architecture.md` has the system diagram and the job state diagram from the review.

#### PR-20 Supply chain and CI \[P4\]

Owns: `pyproject.toml`, `requirements-lock.txt` (new), `.github/workflows/checks.yml`, `scripts/licenses.*`. Depends: none. Size: about 120 lines. Executor: sub-agent. Covers R-27.

- **Scenario: locked installs.** Then Python dependencies have a lock file used by CI and the release instructions, and `httpx` is declared once.
- **Scenario: audit (DEC-P9).** Then one script, used by CI and `verify`, parses `pip-audit` JSON and `npm audit --omit=dev --json` and fails only on high or critical findings that have a fix (for npm, `fixAvailable` is not false); unfixed findings print as warnings and get one Backlog entry each; an allowlist file (advisory ID, reason, expiry date) permits reasoned exceptions and an expired entry fails the build.
- **Scenario: licenses.** Then the existing frontend license script runs in CI and a Python license listing is added.
- **Scenario: release check.** Then CI builds the UI, runs the bundle check, and uploads the built `dist` as an artifact on tags.

### Gates

#### Gate G0: user findings closed (after W2)

- **Scenario: your findings.** Then PR-01's browser tests are green for U-2, U-3 and the restart variant (R-13) at 1440 and 390 wide.
- **Scenario: trunk is green.** Then full verify, build, bundle check, pytest and the browser suite pass.
- **Scenario: sign-off.** Then you run the login, register and link screens by hand and approve. P2 to P4 do not start before this.

#### Gate GC: production acceptance

- **Scenario: all stories closed.** Then every PR story is DONE, or DEFERRED with a Backlog entry and a DEC.
- **Scenario: trunk is green.** Then full verify, build, bundle check, pytest, browser suite and PR-18's mixed load, kill and soak tests pass.
- **Scenario: targets met.** Then every row of section 2 is checked with a measured number in the Verification log.
- **Scenario: independent review.** Then a sub-agent that implemented none of the stories reviews security, concurrency and data-loss paths read-only, and every P0 or P1 finding it raises is fixed or logged.
- **Scenario: clean logs.** Then no open P0 or P1 deviation, no BLOCKED story, no Proposed decision left.
- **Scenario: sign-off.** Then you complete `docs/access/manual-smoke.md` plus the PR-16 backup and restore steps and approve.

## 5. Live tracker

Update protocol. When a story starts: set IN\_PROGRESS and add a Delegation row. When it ends: fill Progress (date, commit, evidence), add a Verification row and a Changelog row. Any divergence, choice, leftover or stop is logged in the same commit.

### 5.1 Progress

| ID | Title | Phase | Pri | Status | Date | Evidence | Wave |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR-01 | Reproduction harness for the reported bugs | P0 | P0 | DONE | 2026-11-11 | auth-flow.spec.ts at 1440 and 390: 6 pass, 4 red for PR-02 (session-ended message) and PR-03 (setup lands on /login) | W0 |
| PR-02 | Session consistency and login without bounce | P0 | P0 | DONE | 2026-11-11 | pytest + vitest + browser (restart test green at 1440 and 390); verify on trunk after merge | W1 |
| PR-03 | Landing on Home and navigation rules | P0 | P0 | DONE | 2026-11-11 | browser suite 84 pass incl. [PR-03] at 1440 and 390; vitest 1024; verify on trunk after merge | W2 |
| PR-04 | Remove the fake provider from the product | P0 | P0 | DONE | 2026-11-11 | verify --backend green on branch pr-04; trunk re-run after merge | W1 |
| PR-05 | Account scope and no shared database | P0 | P0 | DONE | 2026-11-11 | verify --backend green on branch pr-05; trunk re-run after merge; browser not run | W1 |
| G0 | User findings closed | P0 | P0 | DONE | 2026-11-11 | owner approved by hand: login, register and link scenarios | W2 |
| PR-06 | One account, several providers | P1 | P1 | DONE | 2026-11-11 | test_one_account_several_providers; browser 84 pass; verify on trunk after merge | W2 |
| PR-07 | Job recovery and the needs-code path | P1 | P1 | DONE | 2026-11-11 | tests in test_serve_sync.py and test_jobs.py; verify on trunk after merge | W3 |
| PR-08 | Import integrity and fresh data | P1 | P1 | DONE | 2026-11-11 | tests/test_pr08.py 4 pass; vitest 1025; verify on trunk after merge | W4 |
| PR-09 | Data lifecycle: wipe, remove user, retention | P1 | P1 | DONE | 2026-11-11 | tests/test_pr09.py 4 pass; verify on trunk after merge | W3 |
| PR-10 | Atomic ownership, uniqueness and bounded state | P2 | P1 | DONE | 2026-11-11 | tests/test_pr10.py 7 pass (20 threads claim, 2 threads link); verify on trunk after merge | W2 |
| PR-11 | Job runner throughput and write cost | P2 | P1 | DONE | 2026-11-11 | tests/test_pr11.py 6 pass (threads); 8 users x 1,000 orders: 10.9 s to 3.7 s, connections 27,498 to 389, progress writes 8,824 to 40; verify on trunk after merge | W4 |
| PR-12 | Dashboard and read-path performance | P2 | P1 | DONE | 2026-11-11 | cold dashboard 5240 to 796 ms (all sections), 276 to 361 ms per page section, cached 43 ms, on 20,000 orders; test_read_path_budgets_and_sections; browser 84 pass; DEVs 15 to 17 | W3 |
| PR-13 | Frontend load and polling | P2 | P2 | DONE | 2026-11-11 | polling.test.tsx 4 pass; vitest 1030; browser 85 pass; entry chunk 102.9 kB gzip | W5 |
| PR-14 | Owner claim, passwords and session lifetime | P3 | P1 | DONE | 2026-11-11 | tests/test_pr14.py 9 pass; vitest 1026; browser 84 pass (one load flake, passes alone); verify on trunk after merge | W4 |
| PR-15 | HTTP hardening and audit trail | P3 | P1 | DONE | 2026-11-11 | tests/test_pr15.py 5 pass; e2e/csp.spec.ts passes (claim, Home, `/` under the CSP, no violations); vitest 1026; verify on trunk after merge | W5 |
| PR-16 | Operability | P3 | P1 | DONE | 2026-11-11 | tests/test_pr16.py 7 pass (real second process exits 2, backup then restore then login); verify on trunk after merge | W5 |
| PR-17 | Dead code and duplication purge | P4 | P2 | DONE | 2026-11-11 | 7 files, 69 insertions and 129 deletions; verify green on trunk | W6 |
| PR-18 | Load, soak and failure-injection suite | P4 | P1 | DONE | 2026-11-11 | mixed load 0 5xx of 3,303; kill 20 of 20 runs identical; soak 30 min flat; tests/stress 9 pass; numbers in docs/PERFORMANCE.md | W6 |
| PR-19 | Documentation and runbooks | P4 | P2 | TODO | | | W6 |
| PR-20 | Supply chain and CI | P4 | P2 | DONE | 2026-11-11 | tests/test_audit.py 6 pass; verify green on trunk; CI itself not run | W0 |
| GC | Production acceptance | P4 | P0 | TODO | | | W7 |

### 5.2 Decision log

| ID | Date | Story | Decision | Reason | Impact | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DEC-P1 | 2026-11-11 | Plan | Section 2 targets are proposals to be confirmed after measuring | No timing was run in this review | Gates GC | Proposed |
| DEC-P2 | 2026-11-11 | PR-02 | Delete all sessions at server start | Keys live only in memory, so a surviving session is unusable and causes the half-logged-in state | One re-login after each restart | Proposed |
| DEC-P3 | 2026-11-11 | PR-07 | Remove the mid-sync code route; recovery is Verify again then auto-resume | A code cannot repair an expired provider session without a new login | C-2 breaking change, logged as DEV | Proposed |
| DEC-P4 | 2026-11-11 | PR-11 | Default provider concurrency stays 1 each, configurable | Raising it risks provider blocks; queue visibility fixes the wait | Config flag | Proposed |
| DEC-P5 | 2026-11-11 | PR-17 | Keep `food-khata export` (there is no `/legacy` route in the code any more); README gets one line in PR-19 | Removing it means deleting its tests, which verify forbids, and it has a test | Docs and tests | Approved by owner |
| DEC-P6 | 2026-11-11 | PR-08 | Add `source_hash` and refresh recent non-final orders | Without it the dashboard can never show refunds or fix repaired orders | Additive migration | Proposed |
| DEC-P7 | 2026-11-11 | PR-14 | Password minimum 10 characters; session absolute lifetime 7 days | Household server, possibly on a LAN | UI copy | Proposed |
| DEC-P8 | 2026-11-11 | Plan | The main agent writes all high-risk code; sub-agents get only the work in 3.2 | One reviewer holds the whole auth, storage and runner picture | Wave plan | Proposed |
| DEC-P9 | 2026-11-11 | PR-20 | Audit gate fails only on high or critical findings that have a fix; unfixed ones warn and go to the Backlog; allowlist with expiry | A gate nobody can satisfy blocks every merge | CI and verify | Approved by owner |
| DEC-P10 | 2026-11-11 | Plan | Model ladder: Gemini strongest for high-risk, opencode free then Gemini Flash for mechanical work, Haiku last resort; packets 12k tokens; lean rules in 3.7 | Only these models are available and tokens are limited | Wave plan, 3.2, 3.4, 3.7 | Approved by owner |
| DEC-P11 | 2026-11-11 | Plan | U-1 (double login prompt) is deferred; reopen only if it still occurs after PR-02 | Ordinary login did not reproduce; owner chose to test later | BL-206 | Approved by owner |

### 5.3 Deviation log

| ID | Date | Story | Original requirement | What was done instead | Reason | Impact | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEV-01 | 2026-11-11 | PR-01, PR-04 | U-3 check and the switch-on list on one test server | Two server configurations: switch off for the production-UI check, switch on for the list test; test provider injected through the test hook only | One server cannot both include and exclude `fake` | Browser suite has two server setups | Approved by owner |
| DEV-02 | 2026-11-11 | PR-04 | Leftover `fake` accounts: dashboards-never-count test, `purge-fake` | Home keeps the existing Disconnect action for them; `purge-fake` stays in PR-16; no ingest filter by name exists in code, so a count test needs real fake-account data and is left to PR-16 | Leftover fake accounts can still be listed and disconnected, not purged by CLI yet | Open |
| DEV-03 | 2026-11-11 | All | Strongest Gemini model for high-risk stories | Only Gemini 3.8 Flash is in the catalog; the main agent (Claude Sonnet 5.5) writes high-risk code itself, as DEC-P8 says | None on scope | Open |
| DEV-04 | 2026-11-11 | PR-20 | Audit script used by CI and verify | CI only: audit needs `pip-audit` and `npm audit` JSON, which need network; verify does not call it | A no-argument call audited nothing | `verify` has no audit step; run `scripts/audit.py` in CI | Open |
| DEV-05 | 2026-11-11 | PR-05 | Empty user gets 200 with empty aggregates | A user with no database still gets 503 `database_not_found`; the PR-03 redirect to Home covers the UI; changing the API now would touch every read endpoint | New users see no error banner once PR-03 lands | Open |
| DEV-06 | 2026-11-11 | PR-05 | Edits only in Owns | Also edited `serve/cli.py` (serve always passes a data root), `scripts/parity_check.py` and five test files (pass `legacy_single_db=True`) because they are callers of the changed `create_app` | None | Closed |
| DEV-07 | 2026-11-11 | PR-01 | Register in the U-2 test | Register needs an open registration window and join code; the register landing check moves to PR-03, which owns `Register.tsx` | One of three U-2 paths is covered later | Open |
| DEV-08 | 2026-11-11 | PR-02 | `serve/deps.py`; "keeps the typed username"; login p95 number | `deps.py` is left to PR-17 (nothing needs it yet); the login screen is re-mounted after the redirect so no username is kept; the login p95 is measured at Gate GC | Fewer files, two small gaps | Open |
| DEV-09 | 2026-11-11 | PR-02 | Edits only in Owns | Also edited `features/access/routes.tsx` (RedirectIfAuthed wrapper), `e2e/access-integration.spec.ts` (labels from PR-05, login tab starts signed out) and removed unused `isAuthenticated()` | PR-05's label change had broken the access-integration spec; fixed here | Closed |
| DEV-10 | 2026-11-11 | PR-03 | `return` keeps its query string | `account_ids` and `restaurant_ids` are dropped from the return path, because they are the previous user's ids and the cross-tab test (and PR-05's 422) require it | Other parameters are kept | Closed |
| DEV-11 | 2026-11-11 | PR-10 | Handles "swept every minute"; lock-order test; `authenticate_client` default owner | Handles are swept on every new login (comment marks the shortcut; PR-09's scheduler can call `sweep()` each minute); the lock-order test runs `bind` and `save_session` from two threads and checks for no deadlock, because the code has no per-account lock, only the root and credential file locks; two test helpers now pass `is_owner=False` for second users because the owner index forbids a second owner | Weaker lock test than written | Open |
| DEV-12 | 2026-11-11 | PR-06 | Reproduce first; jobs per provider | The reproduction test was written together with the fix, not before it (R-01 was clear from the code); jobs already used one archive file per provider, so only the provider choice was added; `last_sync` is still account-level | Per-provider last sync waits for PR-11 job data | Open |
| DEV-13 | 2026-11-11 | PR-07 | `/code` route removal logged as DEV (DEC-P3); resume-after-restart no-duplicates test | The route is removed from C-2 as planned; the no-duplicate-orders check for resume stays with PR-08/PR-18 (existing resume tests only check status); six tests that queued several jobs on one account now use several accounts because of the new unique index | Test fixtures changed | Open |
| DEV-14 | 2026-11-11 | PR-09 | Wipe cancels the running job then waits; scheduler tasks log their counts; test for a lock longer than 50 ms | Wipe returns 409 instead (the allowed alternative); counts are logged once per run as one line; chunk size is tested, the 50 ms bound is not measured | None | Open |
| DEV-15 | 2026-11-11 | PR-12 | UI asks for the open page's `sections` | Server side is done and measured, but the pages read charts across sections (Spending reads behavior and calendar), so the UI still sends no `sections`; adopting it needs a per-page audit (BL-208) | The full dashboard call is 796 ms cold, above the 500 ms target; each section is under 500 ms | Open |
| DEV-16 | 2026-11-11 | PR-12 | Indexes by migration; ETag 304; `/api/meta/filters` cache | The evidence report shows neither proposed index changes any plan or timing (noise under 5 percent), so none is added; browsers do not revalidate POST, so no ETag (the cached call is already 43 ms); the filters cache is left out (159 ms, Backlog BL-209) | Fewer changes | Open |
| DEV-17 | 2026-11-11 | PR-12 | Data health in at most 2 queries | Three queries (imports, orders in one pass, items) | 16 queries to 3 | Open |
| DEV-18 | 2026-11-11 | PR-08 | Refresh orders younger than 14 days, not final; quarantine link; first-import speed | The runner stores the open order ids (status not DELIVERED or CANCELLED, last 14 days, 50 at most) in the archive after each import and the next `new` or `all` sync fetches them again, because sync has no provider-neutral date or status; the quarantine count has no link because no reasons endpoint exists (BL-210); the first import is about 3x slower once; `archive_imports` was already written in the import transaction, so only the test was added | Reasons for quarantined orders not browsable | Open |
| DEV-19 | 2026-11-11 | PR-11 | Owns; event sampling | Also edited `providers/swiggy.py`, `providers/zomato.py` (their sleeps use the cancel-aware wait), `cli.py`, `serve/cli.py`, `serve/app.py` (the flag) and a zomato test patch target; job events are coalesced rather than sampled (first, last, every Nth), because a one-second limit already bounds them; the baseline and after numbers come from a scratch script, not a committed test | None | Closed |
| DEV-20 | 2026-11-11 | PR-14 | List of the 1,000 most common passwords; audit rows; lifetime message | No list exists on this machine and none may be fetched, so the bundled list holds about 250 well-known passwords of 10 or more characters (shorter ones already fail the length rule), BL-211 extends it; audit rows for admin actions arrive with PR-15; the login banner names both limits (8 hours idle, 7 days) instead of the exact cause; vault rewrap and the hash update are two steps, so a crash between them could leave a user needing the old password for the vault (rare, logged); tests moved to longer passwords and now claim the owner through `/api/owner/setup` | Weaker common-password check for now | Open |
| DEV-21 | 2026-11-11 | PR-15 | Owns; CSP check of the full dashboard; no-secrets-in-logs | Also edited `index.html`, `public/theme-init.js` (an inline script cannot run under `script-src 'self'`), `routes_auth.py`, `routes_owner.py`, `cli.py`, `serve/cli.py`, `migrations.py`, `OwnerSettings.tsx`; the CSP browser test covers claim, Home and the empty dashboard only, not the charts with data (inline styles stay allowed: `style-src 'unsafe-inline'`); the log test greps one journey with debug logging on, and the app logs no request bodies by design | CSP on a populated dashboard unchecked | Open |
| DEV-22 | 2026-11-11 | PR-16 | Owns; DEV-02 closed | Also edited `serve/app.py` (readiness, request id), `serve/cli.py`, `cli.py` (new actions and a second positional), `maintenance` state; `purge-fake` is in `cli.py` and uses the PR-09 wipe helper, which closes DEV-02; the runbook says there is no UI button to remove a user | None | Closed |
| DEV-23 | 2026-11-11 | PR-17 | Remove the `sync()` keyword aliases; `routes.tsx` duplicates | `event_callback` stays (the one real name); the `Home` duplicate was already removed in PR-03; `LinkingService._cached_status` now calls the shared helper, a small services-to-serve import | None | Closed |
| DEV-24 | 2026-11-11 | PR-18 | Targets section 2 | Two misses: the concurrent cold dashboard is p95 5.0 s under the mixed load (every call a new filter; BL-208 would fix it by asking for one section), and the 8-user memory peak is 438 MB against 400 MB (368 MB at the end); the soak script's fd check used single samples and failed once, now medians; the free opencode quota ran out mid-story, so I finished the harness myself; PR-19 went to Gemini 3.8 Flash | Two section-2 rows not met; DEC-P1 targets stay proposals | Open |

### 5.4 Backlog (remaining and discovered items)

| ID | Date | Origin | Description | Priority | Reason deferred |
| --- | --- | --- | --- | --- | --- |
| BL-201 | 2026-11-11 | Review | Optional at-rest encryption of archives and analytics with a recovery key (continues BL-102, BL-107) | P2 | Needs recovery-key design; DEC-021 narrowed scope |
| BL-202 | 2026-11-11 | Review | Scheduled auto-sync (continues BL-101) | P3 | Needs a stored key; conflicts with the in-memory key rule |
| BL-203 | 2026-11-11 | Review | Docker image and compose file | P3 | The service docs in PR-16 cover the first release |
| BL-204 | 2026-11-11 | Review | Two-factor login for the owner | P3 | Not needed for a household LAN; revisit if exposed to the internet |
| BL-206 | 2026-11-11 | Owner | Reproduce the owner double login prompt (U-1) at Gate G0 with browser, URL and restart details; reopen only if it still occurs | P2 | Deferred by owner (DEC-P11) |
| BL-208 | 2026-11-11 | PR-12 | Make the UI request only the open page's `sections` (audit cross-page chart reads first) | P2 | Needs a per-page audit |
| BL-209 | 2026-11-11 | PR-12 | Cache `/api/meta/filters` per user and database version | P3 | 159 ms; not on the critical path |
| BL-210 | 2026-11-11 | PR-08 | Endpoint and link that list quarantined orders with their reasons | P3 | Not in PR-08 scope |
| BL-211 | 2026-11-11 | PR-14 | Bundle the full list of the 1,000 most common passwords | P2 | No source available offline; the current list has about 250 entries |
| BL-212 | 2026-11-11 | PR-14 | `e2e/auth-flow.spec.ts` "switch on" test failed once under `--workers=3` and passes alone; give the backend start more slack | P3 | Load flake |
| BL-205 | 2026-11-11 | Review | Move app state to a shared store so several workers can run | P3 | One worker is enough; PR-16 enforces it |
| BL-207 | 2026-11-11 | PR-20 verify | `tests/test_serve_sync.py::test_discard_partial_api_persists_across_restart` fails about 2 runs in 5 (KeyError `partial_decision`), passes alone; root cause: the real job thread started by the test holds `app.db`, a request after restart gets 503 `database_unavailable`; the test now waits for the job; the product-side lock contention is for PR-11 | P1 | Test stabilised in PR-05; contention left to PR-11 |

### 5.5 Blockers

| ID | Date | Story | Description | Needed to unblock | Status |
| --- | --- | --- | --- | --- | --- |
| BLK-01 | 2026-11-11 | PR-01, PR-02 | The exact click path behind U-1 is not reproduced | Nothing now; see BL-206 | Deferred |
| BLK-02 | 2026-11-08 | All | Real Swiggy or Zomato accounts must never be used in tests | FakeProvider behind the test switch, manual smoke checklist | Standing rule |

### 5.6 Open questions

| ID | Question | Leaning | Needed by |
| --- | --- | --- | --- |
| OQ-9 | By "All User (All Data) account" do you mean the "All Accounts" row in the account selector, or an account row you saw somewhere else? | The selector row; plan hides it for one account and scopes it to the user's own accounts | PR-05 |
| OQ-11 | Is this server ever reachable from the internet, or only from a LAN? | LAN only; internet exposure would raise BL-204 | PR-15 |
| OQ-12 | Keep the `/legacy` offline dashboard and `export` command? | Remove (DEC-P5) | PR-17 |
| OQ-13 | Is waiting about 20 minutes per 1,000 Swiggy orders, queued behind other users, acceptable with an ETA shown? | Yes | PR-11 |

### 5.7 Risk register

| ID | Risk | Mitigation | Story |
| --- | --- | --- | --- |
| R-A | U-1 still occurs after PR-02 | Deferred by owner; test at G0, then BL-206 | PR-02 |
| R-I | Free models are weaker and have small contexts | 12k packets, high-risk work on Gemini, trunk verify after every merge, independent review at GC | All |
| R-B | Deleting sessions at startup annoys users | One re-login after a restart with a clear message; the alternative is a stored key, which BL-202 rejects | PR-02 |
| R-C | Hash-based ingest changes existing rows | Additive column, backfill on first run, tested on a copy of a synthetic database | PR-08 |
| R-D | Removing the code route breaks a client | Local app, one UI; C-2 is regenerated and logged as DEV | PR-07 |
| R-E | Provider blocks accounts if pacing loosens | Default concurrency 1 per provider; pacing per provider; risk stated in docs | PR-11, PR-19 |
| R-F | A sub-agent change slips a bug into shared files | 3.2 limits; line-by-line review; trunk verify after every merge | All |
| R-G | Migrations corrupt `app.db` | One transaction per migration; backup before first migration run; test from the current schema | PR-10 |
| R-H | Provider APIs change | FakeProvider tests, `PROVIDER_CHANGED` code, documented risk | PR-19 |

### 5.8 Verification log

| Date | Story or gate | Command | Result | Duration | Commit |
| --- | --- | --- | --- | --- | --- |
| 2026-11-11 | Baseline, U-1 | `TestClient`: csrf, owner setup, me, accounts, login, me, accounts, jobs, filters | setup 200; me 200; accounts 200; login 200; me 200; accounts 200; jobs 200; filters 503 (no data yet). The backend sequence is clean | not recorded | 30d2a6c |
| 2026-11-11 | Baseline, R-13 | `TestClient` with cookies kept across a new app instance (server restart) | `/api/auth/me` 200, `/api/accounts` 401, `/api/sync/jobs` 200; relogin 200, then accounts 200. Half-authenticated state confirmed | not recorded | 30d2a6c |
| 2026-11-11 | Baseline, U-1 | Second login with a stale CSRF token | 403 `forbidden` | not recorded | 30d2a6c |
| 2026-11-11 | Baseline, R-12 | Job table with queued, running and needs\_code rows, then `mark_interrupted_on_startup` | running becomes interrupted; queued and needs\_code stay; active (running, queued) = (0, 1) | not recorded | 30d2a6c |
| 2026-11-11 | Baseline | `verify . --backend` (typecheck, lint, vitest, ruff, pytest) | all PASS | 98 s | f62003d |
| 2026-11-11 | PR-18 | `load_test.py --duration 300`; `kill --runs 20`; `--soak --duration 1800` | 0 5xx and 0 locked of 3,303; kill 20 of 20 ok (300 orders, 0 duplicates); RSS 93 MB idle, 438 MB peak, 368 MB at minute 30, threads 21 to 23 | 5 + 10 + 30 min | pr-18 |
| 2026-11-11 | PR-17 | `verify . --backend` on trunk after merge | see below | — | pr-17-review |
| 2026-11-11 | PR-13 | `npm test`, `check-bundle.mjs`, `npx playwright test` on trunk | all PASS; entry chunk 102.9 kB (budget 250) | — | pr-13-review |
| 2026-11-11 | PR-16 | `verify . --backend` on branch pr-16 | all PASS | — | pr-16 |
| 2026-11-11 | PR-15 | `verify . --backend`, `npx playwright test e2e/csp.spec.ts e2e/auth-flow.spec.ts` on branch pr-15 | all PASS | — | pr-15 |
| 2026-11-11 | PR-14 | `verify . --backend` and `npx playwright test` on branch pr-14 | all PASS | — | pr-14 |
| 2026-11-11 | PR-11 | Baseline and after: FakeProvider, 8 users x 1,000 orders, all `mode=all`, one zomato slot | total 10.9 s to 3.7 s; sqlite connections opened 27,498 to 389; progress writes 8,824 to 40 | — | pr-11 |
| 2026-11-11 | PR-08 | Bench: 5,000 archived orders, 5 changed, incremental ingest | before 23 ms and 0 changes imported (the 5 edits were ignored); after 52 ms and 5 imported; first import 0.63 s to 2.02 s (hash and update per order, once per order) | — | pr-08 |
| 2026-11-11 | PR-12 | Bench: 20,000 orders, `POST /api/dashboard`, 5 runs median, distinct filter per call (before = master `30d2a6c`+PR-10; after = pr-12) | cold all sections 5240 ms to 796 ms; sections overview 347, spending 276, food 361, behavior 307, places 310 ms; cached 38 to 43 ms; data-health 16 to 3 queries; items 45 to 4 queries | — | pr-12 |
| 2026-11-11 | PR-09 | `verify . --backend` on branch pr-09 | see Progress | — | pr-09 |
| 2026-11-11 | PR-07 | `verify . --backend` on branch pr-07 | see Progress | — | pr-07 |
| 2026-11-11 | G0 | `verify . --backend --browser` (twice), `npm run build`, `check-bundle.mjs` on trunk | all PASS; browser 84 pass at 1440 and 390; entry chunk 102.4 kB gzip (budget 250) | 125 s | trunk |
| 2026-11-11 | PR-06 | `verify . --backend`, `npx playwright test` on branch pr-06 | all PASS | — | pr-06 |
| 2026-11-11 | PR-10 | `verify . --backend` on branch pr-10 | all PASS | — | pr-10 |
| 2026-11-11 | PR-03 | `npx playwright test` (all) and `verify . --backend` on branch pr-03 | all PASS | — | pr-03 |
| 2026-11-11 | PR-02 | `verify . --backend` and `npx playwright test` on branch pr-02 | see Progress | — | pr-02 |
| 2026-11-11 | PR-01 | `npx playwright test e2e/auth-flow.spec.ts` | 6 pass, 4 fail as designed: [PR-02] restart lacks "Your session ended" message, [PR-03] setup ends on `/login?setup=complete` | 24 s | trunk |
| 2026-11-11 | PR-05 | `verify . --backend` on branch pr-05 and trunk | all PASS | 96 s | pr-05 |
| 2026-11-11 | PR-04 | `verify . --backend` on branch pr-04 | all PASS (pytest 88 s) | 106 s | pr-04 |

### 5.9 Changelog

| Date | Story | Change | Commit |
| --- | --- | --- | --- |
| 2026-11-11 | Plan | Plan v1.0 created from the architecture review and user findings U-1 to U-3 | — |
| 2026-11-11 | Plan | v1.1: U-1 deferred (DEC-P11); U-3 check split (DEV-01); audit gate threshold (DEC-P9); model ladder and lean rules (DEC-P10, 3.7) | — |
| 2026-11-11 | PR-18 | `scripts/load_test.py` (mixed, kill, soak), `tests/stress` (matrix, failure injection, kill wrapper; skipped by default with `-m stress`), `docs/PERFORMANCE.md`; found and fixed three bugs: `app.db` connections used across worker threads (503 on login under load), database errors swallowed without a log line, and six cold dashboard builds thrashing the GIL (27 s to 7 s with a two-at-a-time gate) | pr-18 |
| 2026-11-11 | PR-17 | Deleted `SyncService`, `use_partial_import` and aliases, `ProviderLinkingService`, `Linking`, `JobControl.submit` and `enqueue`, `start_linking`; one copy each of the client address, loopback, secure, session status and app.db helpers in `serve/deps.py` | pr-17-review |
| 2026-11-11 | PR-13 | Job list polls every 3 s only while a job is active, every 30 s otherwise, never while the tab is hidden, and refetches once on return (one shared hook); QueryClient defaults (30 s stale, retry once on network errors, never on 4xx, no refetch on focus); error boundary with Reload and Go to Home | pr-13-review |
| 2026-11-11 | PR-16 | `.server.lock` (second server exits 2); `GET /health/ready`; `FOOD_KHATA_<FLAG>` for every flag and `--print-config`; JSON logs with request id and user id, redacted, rotating; `food-khata backup` and `restore` (SQLite backup API, checksums, non-empty folder refused); `purge-fake`; `docs/RUNBOOK.md` | pr-16 |
| 2026-11-11 | PR-15 | Session from the cookie only; `Secure` from TLS or `--behind-https-proxy`, never a header; `--trusted-proxy ADDR` for X-Forwarded-For; CSP, nosniff, DENY, no-referrer on every response (HSTS over HTTPS); 413 above 64 KB; `audit_log` (migration 5) for logins, claim, window, join code, disable, enable, reset, remove, transfer, password change, log out everywhere, readable as the last 200 rows in Settings; the inline theme script moved to `theme-init.js` for the CSP | pr-15 |
| 2026-11-11 | PR-14 | Only `/api/owner/setup` claims (register needs an owner and a join code); wrong network setup codes locked out after 5 in 10 minutes (429 Retry-After); setup code is 10 characters from 32 symbols, valid 30 minutes, fresh at every `--lan` start; `POST /api/auth/password` (vault re-wrapped, other sessions ended, new session) and `POST /api/auth/logout-all`; password rule (10 or more, not the username, not common); 7-day absolute session lifetime; Password screen and rule text on Register | pr-14 |
| 2026-11-11 | PR-11 | One connection per job thread; progress and events coalesced to 1 per second per job (phase changes and coded events always); `--provider-concurrency` (default 1 each); pacing reserves a monotonic slot and waits outside the lock in 250 ms steps; provider retry sleeps stop within 250 ms of a cancel; fair round-robin start order; `queue_position` and `eta_seconds` on queued jobs and the Sync screen text; shutdown makes running jobs interrupted/`SHUTDOWN`; the queue is read before the lock | pr-11 |
| 2026-11-11 | PR-08 | `orders.source_hash` (additive); incremental import skips an order only when its archive content is unchanged, so repaired details and new statuses update the row and items; import is the visible `importing` stage and a failure ends the job `failed` with `IMPORT_FAILED` (`import_pending`), with `POST /api/sync/jobs/{id}/retry-import`; still-open orders from the last import are fetched again on the next sync (cap 50); Data health shows quarantined orders | pr-08 |
| 2026-11-11 | PR-12 | `kpi_history` in two grouped queries (was two per month, about 4 s); dish count by join (5x); per-request metrics memo; data health one pass over orders; item price trends one grouped query; `sections` on `POST /api/dashboard` (C-2 additive, unlisted sections return empty shapes); `/api/orders/slim` capped at 5,000 with `truncated`; dashboard cache bounded 8 per user and 64 total; query-count budgets in tests; types regenerated | pr-12 |
| 2026-11-11 | PR-09 | `delete_account_data` (one transaction, orphans removed, rolls back); wipe renames the folder first, 409 `ACCOUNT_BUSY` with a running job, 500 `WIPE_FAILED`; `POST /api/owner/users/{id}/remove`; `maintenance.py` hourly thread (sessions, attempts, events 7 d, jobs 90 d, WAL checkpoint) in chunks of 500 | pr-09 |
| 2026-11-11 | PR-07 | Startup marks running, queued, needs_code and paused jobs interrupted/RESTART; `/jobs/{id}/code` removed (404) and the Sync screen sends users to Verify again; verify-again resumes the account's needs_code job; expiry works from the database; unique index (migration 4) gives 409 `ACCOUNT_BUSY`; types regenerated | pr-07 |
| 2026-11-11 | PR-06 | C-2 additive: `GET /api/accounts` one row per (account, provider); optional `provider` on sync create, verify-again and disconnect (422 `PROVIDER_REQUIRED` when ambiguous); `added_to_existing` on link verify; Home one card per provider; selector groups by account; types regenerated | pr-06 |
| 2026-11-11 | PR-10 | `migrations.py` (schema_migrations, backup before first run, one transaction each); unique owner index and `BEGIN IMMEDIATE` claim; transfer refuses disabled target; `provider_links` table replaces the folder scan (backfilled at startup, freed on disconnect); quota checked at Send code; login handles capped at 200 and 3 per user | pr-10 |
| 2026-11-11 | PR-03 | Login and setup land on `/home`; `return` keeps query; zero accounts at `/` redirect to Home; `/accounts` redirects to `/home`; Open dashboard and Sync now on Home; brand links | pr-03 |
| 2026-11-11 | PR-02 | Sessions deleted at startup; middleware closes a key-less session with 401 `SESSION_EXPIRED`; touch at most once a minute; client handles 401 once through the router, retries a stale CSRF once, seeds `/me` from login; login page redirects when signed in; expired banner | pr-02 |
| 2026-11-11 | PR-01 | Browser repro suite: backend serves the built UI, restart reuses data folder and port, two widths | trunk |
| 2026-11-11 | PR-05 | `create_app(legacy_single_db=False)` default, `serve` always has a data root; `account_ids` checked against the user's own account folders (422 `INVALID_ACCOUNT`); selector reads "All my accounts (n)" with tooltip and "Swiggy ••••1234" labels | pr-05 |
| 2026-11-11 | PR-04 | Fake provider off unless `FOOD_KHATA_ENABLE_FAKE_PROVIDER=1`; `GET /api/accounts/providers`; Link screen server-driven, nothing preselected; tests/conftest.py fixture turns the switch on except `no_fake` tests | pr-04 |

### 5.10 Delegation ledger

| Date | Story | Task class | Model | Attempts | Outcome | Escalation |
| --- | --- | --- | --- | --- | --- | --- || 2026-11-11 | PR-13 | W5 frontend | opencode/beam-free | 1 | merged after review; it shipped no tests, so I added `polling.test.tsx` and changed Go to Home to `/home` | main agent finished it |
| 2026-11-11 | PR-12 | Query plan report | opencode/beam-free | 1 | report accepted as written | — |
| 2026-11-11 | PR-01 | W0 test harness | opencode/beam-free | 1 | merged; spec could not start (ESM path, cross-origin proxy, restart used a new data folder), so I rewrote it | main agent took over after the sub-agent could not run a browser |
| 2026-11-11 | PR-20 | W0 config | opencode/beam-free | 1 | merged after review; removed dead `run_cmd` and a verify step that audited nothing | — |
| 2026-11-11 | G0 sign-off | Claude Haiku 5.5 (session switched via /model) | 1 | Owner approved G0 by hand; W3 not started | Haiku is last resort for high-risk stories (PR-07, PR-09, PR-12); switch back to Sonnet 5.5 before PR-07 |
| 2026-11-11 | PR-18 | W6 harness | opencode/beam-free | 1 | quota ended mid-story; main agent finished and fixed it | Gemini rung not used; main agent took over |
| 2026-11-11 | PR-19 | W6 docs | antigravity gemini-3.8-flash | 1 | review pending | opencode quota ended |
