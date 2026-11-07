# TASK PACKET {{DISPATCH_ID}}

You are a sub-agent. Do exactly this one task in the current git worktree, then stop. You have full tool access inside this worktree. Do not ask questions; decide and note decisions in your report.

## Task
Story: {{STORY_ID}}  (class {{CLASS}}, attempt {{ATTEMPT}})
Goal in one line: {{ONE_LINE_GOAL}}

## Spec (authoritative; do not weaken any scenario)
{{STORY_TEXT}}

{{CHART_CONTRACT_IF_ANY}}

## Context you need (read only these first)
{{FILE_HINTS}}
Project facts: React 18 + Vite + TypeScript + Tailwind 3 + Radix/shadcn, ECharts only for charts, TanStack Query, zod. Frontend in dashboard-ui/. Tokens only for colors (no hex/rgb literals outside the token files). Currency en-IN. Min text 12px captions / 14px body. Honor prefers-reduced-motion. No new dependencies unless the license is MIT/Apache-2.0/ISC/BSD and you list it under decisions.

## Previous attempt feedback (empty on first attempt)
{{FAILURE_DIGEST}}

## Guardrails (hard rules)
- Work only inside this worktree. Never touch `.food-khata/`, home directories, credentials, `.env`, or anything outside the repo.
- Never run `food-khata` login or sync commands. Use only the dev database at `.test-tmp/dev-data` for any server run.
- No `git push`, no `git reset --hard` of shared branches, no deleting or weakening existing tests, no unrelated refactors.
- Keep changes minimal and limited to this story. Out-of-scope ideas go under `backlog` in your report.
- Run: `cd dashboard-ui && npm run typecheck && npm run lint && npm test` (plus `python -m pytest tests -q` and `python -m ruff check .` if you changed Python). Fix failures before reporting.
- Commit on the current branch with message `feat(S-xxx): summary`.

## Output contract
Finish with ONE fenced json block and nothing after it, matching orchestration/report.schema.json:
```json
{"story":"S-000","status":"done|partial|failed","files_changed":[],"tests_run":[{"cmd":"","result":"pass|fail|not_run"}],"scenarios":{"<scenario title>":"pass|fail|not_done|na"},"decisions":[],"deviations":[],"backlog":[],"blockers":[],"notes":"max 80 words"}
```
Be honest: mark a scenario `pass` only if you verified it.
