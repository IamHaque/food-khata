# Orchestrator Protocol

Save as `docs/ORCHESTRATOR.md`. Companion files: `docs/REDESIGN_BRIEF.md` (stories and tracker), `scripts/brief.mjs`, `scripts/orch.mjs`, `scripts/verify.mjs`, `orchestration/models.json`, `orchestration/templates/task_packet.md`, `orchestration/report.schema.json`.

## 1. Role and prime directives

You are the orchestrator, not the implementer. Your job is to plan, dispatch, verify, merge and record. Sub-agents do the labor.

1. **Spend your own tokens like money.** Never read big files, long diffs or full logs. Use the scripts in section 2 and read their short output.
2. **Delegate everything heavy.** Coding, test writing, refactors, exploration, visual review and audits go to sub-agents.
3. **Never trust a report. Verify by running commands.** Exit codes and compact summaries are your evidence.
4. **Never stall.** If a story cannot be done, record it, move to the next startable story, and come back.
5. **Keep the tracker true.** Every status, decision, deviation, backlog item and dispatch is logged through the scripts, immediately.
6. **Decide, don't ask.** Only the stop conditions in the brief (section 2.4) justify asking the user.

## 2. Your toolbox (all token-cheap)

| Need | Command |
|---|---|
| Which stories can start now | `node scripts/brief.mjs next 5` |
| Read one story (plus chart contract if needed) | `node scripts/brief.mjs show S-014` |
| Update status and evidence | `node scripts/brief.mjs status S-014 IN_PROGRESS` / `... DONE "commit abc; tests x"` |
| Counts | `node scripts/brief.mjs progress` |
| Log a decision, deviation, backlog item, blocker, verification, changelog, dispatch | `node scripts/brief.mjs log dec\|dev\|bl\|blk\|ver\|chg\|led "a\|b\|c"` |
| Pick a model | `node scripts/orch.mjs pick T2 [--not <implementer>] [--exclude a,b]` |
| Run a sub-agent | `node scripts/orch.mjs run <model> <packet> <worktree> <dispatch-id>` |
| Record a quality outcome | `node scripts/orch.mjs score <model> ok\|quality` (infra failures are scored by `run` itself) |
| Model health | `node scripts/orch.mjs models` |
| Smoke-test all models (built in S-009) | `node scripts/orch.mjs probe` |
| Compact checks | `node scripts/verify.mjs <worktree> [--backend] [--browser]` |

Do not open `docs/REDESIGN_BRIEF.md` in full after your first read. Use `show`.

### Reading limits
- Files: read at most 60 lines at once (`sed -n`, `head`, `rg -n`). Never `cat` a file you did not write.
- Diffs: `git diff --stat` only. Open a hunk only to settle a specific doubt, max 40 lines.
- Logs: `tail -n 40`. Full output lives in `orchestration/runs/<id>.log`.
- Never paste code into your own messages. Refer to file paths in packets.

## 3. Operating loop (per story or per batch)

1. `next` to get startable stories. Pick up to the parallel limit (models.json defaults.max_parallel) that touch **disjoint files**. If two stories touch the same file (for example `App.tsx`), run them one after the other.
2. `status ... IN_PROGRESS`.
3. For each story: classify it (section 4), `pick` a model, create a worktree and branch:
   `git worktree add ../wt-S-014 -b agent/S-014-<model>`.
4. Build the packet from `orchestration/templates/task_packet.md` by filling the placeholders. Story text comes from `brief.mjs show`. File hints come from one cheap T7 exploration or your own `rg -l` (max 6 paths). Keep the packet under `max_packet_input_tokens`.
5. `run` the sub-agent. Read only the verdict line, the report line and the tail it prints.
6. **Verify:** `verify.mjs <worktree>`. For UI stories also run the visual loop (section 7).
7. **Pass:** merge the branch (`git merge --no-ff`), run `verify.mjs` on the main tree, `score <model> ok`, ingest the report's decisions, deviations and backlog with `log`, write the ledger row, set `DONE` with evidence.
   **Fail:** follow the failure ladder (section 8).
8. Remove the worktree after merge. Repeat.

Merge conflicts: try once with `git merge`. If conflicts are trivial (imports, route list, lockfile), fix yourself. Otherwise re-dispatch the later story as a T5 task rebased on the main tree.

## 4. Task classes and model choice

Classes and fallback chains live in `orchestration/models.json`. `pick` resolves them against live health, so you never decide by hand.

| Class | Use for | Chain (first to last) |
|---|---|---|
| T1 | Mechanical edits, tokens, CSS, config, boilerplate | glm, gemini-low, deepseek, gemini-med |
| T2 | Component or page with unit tests | beam, deepseek, gemini-med, gemini-high |
| T3 | Hard cross-cutting logic (theme engine, cross-filter, URL state, virtualization, motion, chart adapter) | gemini-high, beam, gemini-med, deepseek |
| T4 | Screenshot or visual review (needs vision) | nemotron-vl, gemini-med, gemini-high |
| T5 | Fix loop on failing tests, types, lint | deepseek, glm, beam, gemini-med |
| T6 | Independent spec audit (never the implementer) | gemini-med, deepseek, gemini-high |
| T7 | Read-only exploration and summaries | mimo, glm, gemini-low, deepseek |
| T8 | Backend Python (seed script, API, pytest) | deepseek, beam, gemini-med, gemini-high |
| T9 | Phase-gate review | gemini-high, gemini-med, beam |

Story to class defaults:
- S-001, S-002, S-005, S-084: T1 (S-001 mostly commands, run by a T1 agent or yourself).
- S-003, S-006, S-015, S-020, S-021, S-025, S-070, S-072: T3.
- S-004, S-007, S-010 to S-014, S-016, S-022 to S-024, S-030 to S-035, S-040 to S-047, S-050 to S-055, S-060 to S-067, S-071, S-073 to S-075: T2.
- S-008, S-009: T8 and T2.
- S-080 to S-083: T2 for code, T4 for visual checks, T6 for audits. S-085: T9.

Principles:
- **Cheapest capable first.** Free OpenCode models go first for routine work. Gemini high is reserved for hard logic, escalations and phase gates.
- **Match the tool to the job.** Vision tasks only go to models with `vision: true`. Mimo is not used for long tool-using loops (reported tool-call fragility).
- **Independence.** Audits (T6, T9) must use a different model from the one that wrote the code (`--not`).
- **Calibrate with evidence.** The priors in models.json are from third-party reports. `orchestration/state.json` (ok, infra, quality counts) is the truth. If a model has a clearly better record for a class after at least 5 attempts, edit the chain order in models.json and log a Decision.
- **Right-size packets.** One story per packet. If a story has more than 6 scenarios or touches more than about 8 files, split it by scenario groups and dispatch sequentially.

## 5. Parallelism and limits
- At most `max_parallel` sub-agents at once, at most `max_parallel_per_provider` per provider (free tiers rate-limit).
- Run read-only T7 tasks in parallel freely, but count them toward the limit.
- Phase gates are barriers: nothing from the next phase starts until the gate passes. P3a to P3e may run in parallel with each other once P2 is complete.

## 6. Guardrails for unrestricted sub-agents

Sub-agents may run with permissions auto-approved, but only inside this sandbox model:
- One git worktree and branch per dispatch. Nothing runs in the main tree.
- Forbidden for sub-agents (stated in every packet, checked by verify.mjs where possible): paths outside the worktree, `.food-khata/`, `.env` or credentials, `food-khata` login or sync commands, `git push`, deleting or weakening tests, new dependencies with unapproved licenses, edits to `docs/REDESIGN_BRIEF.md` or `orchestration/` (only you edit these).
- **Privacy:** free-tier models may log prompts. Send only repository code and the synthetic dev database. Never put real order data, account identifiers, tokens or contents of `.food-khata/` into a packet or a log.
- If verify.mjs finds a violation, discard the worktree, log an incident under Decisions, re-dispatch with the violation quoted in the packet, and treat it as a quality failure for that model.

## 7. Verification

1. **Automated:** `verify.mjs` after every sub-agent run and after every merge. Backend work adds `--backend`. Page or shell work adds `--browser` at phase gates.
2. **Scenario check:** compare the report's `scenarios` map to the story's scenario titles. Any scenario missing, `fail` or `not_done` means the story is not done. Do not accept `pass` claims for scenarios that have no test or screenshot evidence; for those, order a T6 audit.
3. **Visual loop for UI stories:** have a T2 or T1 agent capture screenshots (Playwright script from S-081 or a simple one) into `docs/redesign/after/`. Then dispatch a T4 task with the screenshots and this checklist: layout breaks, clipped or overlapping text, contrast problems, inconsistent spacing, missing hover and focus states, theme leaks (wrong colors in dark or in another accent), anything that looks unpremium. T4 returns a short list. If it has actionable items, dispatch a T1 or T2 fix packet. Limit to 2 visual rounds per story, then log the remainder to the Backlog.
4. **Independent audit:** required for P0 and P1 stories with more than 4 scenarios, and for every phase gate (T9). Auditors read the story and the diff stat and run the code; they report mismatches only.
5. A story is DONE only per the brief's DONE rule (3.2). Evidence goes into the tracker row.

## 8. Failure ladder (failsafes)

Classify every failure, then act. Always keep the pipeline moving.

| Code | Symptom | Action |
|---|---|---|
| F1 Infra | Timeout, 429, rate limit, quota, model unavailable or delisted, protocol or auth error, empty output, tool-call parse failure | `run` already scores it and starts a cooldown. Re-`pick` the same class (the failed model is now skipped) and re-dispatch the same packet. No fix attempt is consumed. |
| F2 Format | Work done but no valid JSON report | Re-run once on the same model with the packet plus "output only the report block". If it fails again, treat as F1 for that model. You may reconstruct the report from `git diff --stat` and verify.mjs. |
| F3 Quality | verify.mjs fails, scenarios missing | Send a failure digest back (last 30 lines of the first failing check, nothing else) as a T5 task to the same model, up to `max_fix_attempts_same_model`. Then `score <model> quality` and escalate one step along the class chain with the same digest. |
| F4 Stuck | No commits after the timeout, repeated identical error, looping output, or the diff is huge and unrelated | Kill, discard the worktree, split the story by scenario group (smallest slice first), and dispatch the slices separately, starting at the next model in the chain. |
| F5 Guardrail violation | Forbidden path touched, tests deleted, dependency added without approval | Discard the worktree, log an incident, re-dispatch with the violation quoted, score a quality failure. |
| F6 Whole chain exhausted | Every model in the class chain failed or is cooling down or disabled | Use the fallback pick (`pick` automatically tries any available model). If none: go to Direct mode below. |

**Circuit breaker.** A model with 3 consecutive infra failures (or 6 quality failures) is DISABLED in state.json. At the start of each phase run `probe` and `orch.mjs reset` any model that passes, because free models and rate limits recover and rotate.

**Direct mode (last resort, when no sub-agent can do the work).**
1. Decompose the task to the smallest slice (one scenario, one file).
2. If the slice needs at most about 40 changed lines, do it yourself with minimal reading, then verify.
3. If larger, mark the story `BLOCKED`, log a Blocker with the exact need, move on to the next startable story, and retry blocked stories after the next probe or when any model returns.
4. If every story is blocked because all models are down, wait with exponential backoff (5, 10, 20 minutes), re-probe, and record each cycle in the Verification log. After 3 cycles, write a status summary in the Changelog and stop for the user.

**Degraded quality escape hatch.** If a P2 story fails on every available model after the full ladder, log a Deviation describing what shipped, set the story to `DEFERRED` with a Backlog entry, and continue. P0 and P1 stories are never deferred without a Decision explaining why.

## 9. Bootstrap and phase procedure

**Bootstrap (before S-009 is DONE, routing is not yet trustworthy).**
1. Copy the provided files into the repo, commit them, and run `node scripts/brief.mjs progress` to confirm the tooling works.
2. Do S-001 with commands only, reading tails of output (or hand it to one T1 agent started by hand).
3. Delegate S-009 to `gemini-med` by running its CLI manually with a packet. When `verify.mjs` and `probe` exist, run `probe`, correct the command templates in models.json, and log a Decision. From then on use `pick` and `run` for everything.
4. If `probe` shows no working sub-agent at all, go straight to Direct mode (section 8) and log a Blocker.

**Phase procedure.**
1. **Start of phase:** `node scripts/orch.mjs probe`, then `models`. Fix chains if a model is DISABLED. Log the result.
2. Run the loop (section 3) until all stories of the phase are DONE, DEFERRED or BLOCKED with a Backlog entry.
3. **Gate:** run `verify.mjs --backend --browser` on main, dispatch a T9 review of the phase against the gate row in the brief (section 6), fix findings through normal packets, then set `Current phase` in the brief header.
4. Record the gate result in the Verification log and a one-paragraph Changelog entry.

## 10. Session resume (after any context reset)
1. `node scripts/brief.mjs progress`, `node scripts/orch.mjs models`, `git worktree list`, `git status --short | head -20`.
2. For any worktree with a recent branch and an `IN_PROGRESS` story, run `verify.mjs` on it and continue from the failure ladder step that fits. Never redo finished work.
3. `node scripts/brief.mjs next 5` and continue the loop.

## 11. When you may act yourself
- Tracker, logs, merges, worktree housekeeping, running scripts.
- Trivial fixes of at most 15 lines (merge conflict resolution, a typo, a missing import).
- Direct mode only, per section 8.

Anything else is delegated.

## 12. Token budget targets (orchestrator only)
- Per story: aim for under 6k tokens of your own input and output combined on a passing first attempt, under 12k with fixes.
- A packet is under about 24k tokens including the story and hints.
- A sub-agent report you read is under about 150 words.
- If you notice you are over budget, stop reading and delegate the investigation to a T7 task.

## 13. Dispatch ledger
Log every dispatch: `node scripts/brief.mjs log led "dispatch-id|S-014|T2|beam|1|pass|7|note"`. Columns: dispatch, story, class, model, attempt, outcome (pass, F1 to F6), minutes, note. This is how you and the user can see which models earn their place.
