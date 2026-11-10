# AC-18 acceptance evidence

Run from the repository root with the installed Python development/serve and
dashboard dependencies. All accounts and data in these checks are synthetic.

```sh
node scripts/verify.mjs . --full --backend --browser
npm --prefix dashboard-ui run build
node scripts/check-bundle.mjs
node tests/e2e_access/journey.cjs
```

On 2026-11-10 in the AC-18 Windows worktree, all four commands passed.
Full verify completed in 125.35s: guardrails, typecheck, lint, full unit suite,
Ruff, full pytest and browser suite all PASS. The build completed in 19.76s;
the largest entry was 101.8 kB gzip against a 250 kB budget. The journey reported
`PASS synthetic journey 1440` and `PASS synthetic journey 390`. Build warnings
about third-party pure annotations and the ECharts chunk size were nonfatal.

The journey starts a fresh backend and data directory per width (1440 and 390),
using a FakeProvider subclass, with no API interception. It creates an owner,
opens registration, registers a member, links an account, syncs six orders and
opens the populated dashboard. Screenshots: [desktop](journey-1440.png) and
[phone](journey-390.png).

The owner's session probes the member's account/job lists, dashboard, order and
metadata views, individual bill, job and events, direct account-file URLs, and
account/job mutation endpoints with valid CSRF and code payloads. Captured server
output is checked for seeded passwords, verification code and provider token.
`tests/e2e_access/test_route_sweep.py` checks logged-out API routes, CSRF rejection,
HTTPS cookie flags, Host rejection and HTTP transport status. The frontend warning
and CSRF fixes have unit regressions.

The separate browser suite uses API mocks for UI/visual coverage. Its 40 new
Windows baselines cover five pages, two widths, two modes and two accents; a
fixed clock makes relative sync labels repeatable. Existing baselines and visual
tolerances are unchanged. These snapshots are not evidence of backend isolation.

See [security and recovery](security-and-recovery.md) for the threat model and
provider risks, and the [manual checklist](manual-smoke.md) for real-account
validation. Automated acceptance does not verify real provider compatibility,
network deployment or protection from the host administrator. Gate GB remains
pending the user's manual checks and explicit approval; this evidence does not
close other tracker stories or approve the gate.

## Final trunk verification (2026-11-10)

At trunk commit `4e1adf5`, the parent ran the full verification suite (171.59s),
production build, bundle budget check and real-backend FakeProvider journeys at
1440 and 390 pixels; all passed. Largest entry: 101.8 kB gzip / 250 kB budget.
This supersedes the initial worktree-only checks above and includes the vault,
revocation, adoption, identifier migration and Windows SQLite test lifecycle fixes.

The approved encryption scope is DEC-021. Provider credentials and account metadata
are protected; analytics and raw archive payloads remain ordinary protected files.
The [personal-data inventory](personal-data-inventory.md) confirms full delivery
addresses and precise coordinates in SQLite and synthetic recipient names and
phones in archives. Full-disk encryption and separately encrypted backups are
recommended. All 25 implementation stories are DONE. The user explicitly approved Gate GB on 2026-11-10. Completion of the
[manual checklist](manual-smoke.md) was not independently confirmed; no real accounts
or real LAN deployment were tested by automation.
