# PayPal-rec development workflow

Use shadrackbond/PayPal-rec as the central repository. Each issue represents one reviewable outcome. Check the selected issue's dependencies and current implementation before starting work.

## Board policy
To Do: acceptance criteria and dependencies recorded. In Progress: claim the issue, move the card and open a short-lived branch; one active implementation per contributor. A blocked item stays in progress with the blocker and next action recorded. Done: acceptance evidence attached and implementation merged, or the non-code deliverable verified. Reopen and move back if acceptance fails.

## Version control
Keep main runnable. Use feat/<issue>-<slug>, fix/<issue>-<slug> or docs/<issue>-<slug>. Open a pull request targeting main with “Closes #N”, behavior changed, test evidence and limitations. Require passing relevant checks before squash merge; request peer review when available. Solo contributors self-review the diff and attach reproducible checks. Delete merged branches. These are team rules; protection settings are separate.

## Current checks

Use Node.js 26 from `.nvmrc`. Pull requests targeting `main` and pushes to `main` run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` in GitHub Actions.

- Unit and route tests use Node's test runner and synthetic records to check exact amounts, currency boundaries, source locations, unsupported claims, attribution, review versions, session tokens and packet filtering. Matching is deterministic; no model service is configured.
- Integration tests apply the SQL migrations to disposable PGlite databases and exercise imports, notice capture, matching, review snapshots and ZIP generation. They cover merchant-key ownership checks and cross-case isolation. PayPal requests are stubbed. They do not exercise browser Server Actions or a standalone PostgreSQL server in CI.
- For standalone PostgreSQL 16+, apply both migrations and run the rollback-based SQL smoke test in [db/README.md](db/README.md). This is separate from the CI workflow.

## Acceptance and release requirements

- Sandbox smoke (adapter changes and before release): retrieve an actual sandbox payment server-side and record sanitized ID, amount, currency and timestamp. Label merchant imports and simulated restriction notices distinctly. No live customer records.
- Current merchant UAT: give a fresh reviewer the [task brief](docs/merchant-acceptance-task.md), then record findings and pass/fail in the [acceptance record](docs/merchant-acceptance-results.md). Check the allocation of two invoices to USD 2,400, receipts for two of three deliverables, the payer follow-up, exclusion of the unrelated handoff and the exported PDF/JSON. The excluded handoff is outside the proposal queue and has no Reject action.
- Future release requirements: repeat with different names and amounts; changing or removing supporting evidence must change the conclusion and invalidate old approvals. Verify payer corrections and authorized case deletion when those application flows exist. The current UI has no evidence-editing, payer-correction or case-deletion flow. The database smoke test covers SQL deletion; that does not establish a browser deletion flow.
- Future integration requirements: when multi-merchant authentication, background jobs or model services are introduced, add authenticated isolation, job/retry and fixed model-output checks. The current Sandbox key grants shared workspace access and does not identify a reviewer. Never expose secrets to fork PRs.
- Release blockers: cross-case access, unsupported exported material claims, stale approved packages or unlabelled simulation. Report missed links as well as false links.
