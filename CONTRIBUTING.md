# PayPal-rec development workflow

Use shadrackbond/PayPal-rec as the central repository. Each issue represents one reviewable outcome. Start with sandbox retrieval (#2 if numbered in WBS order; see the issue titled 02).

## Board policy
To Do: acceptance criteria and dependencies recorded. In Progress: claim the issue, move the card and open a short-lived branch; one active implementation per contributor. A blocked item stays in progress with the blocker and next action recorded. Done: acceptance evidence attached and implementation merged, or the non-code deliverable verified. Reopen and move back if acceptance fails.

## Version control
Keep main runnable. Use feat/<issue>-<slug>, fix/<issue>-<slug> or docs/<issue>-<slug>. Open a pull request targeting main with “Closes #N”, behavior changed, test evidence and limitations. Require passing relevant checks before squash merge; request peer review when available. Solo contributors self-review the diff and attach reproducible checks. Delete merged branches. These are team rules; protection settings are separate.

## Testing
- Unit (each PR): exact decimal amounts and currency boundaries, source-span validation, unsupported claims, attribution and stale approvals. Use synthetic documents and fixed model outputs.
- Integration (each affected PR): migrate a disposable PostgreSQL database; exercise authenticated case/upload/job/review/export paths, worker retries and two-merchant access isolation. Stub PayPal/model calls in ordinary CI. Never expose secrets to fork PRs.
- Sandbox smoke (adapter changes and before release): retrieve an actual sandbox payment server-side and record sanitized ID, amount, currency and timestamp. Label merchant imports and simulated restriction notices distinctly. No live customer records.
- UAT (feature freeze): an independent tester starts a clean case, reconciles two invoices to USD 2,400, rejects an unrelated match, verifies evidence for two of three deliverables, corrects the payer relationship and audits the revised PDF/ZIP. Repeat with different names and amounts; deleting evidence must change the conclusion. Verify case deletion revokes access.
- Release blockers: cross-case access, unsupported exported material claims, stale approved packages or unlabelled simulation. Report missed links as well as false links.
- The foundation issue establishes lockfile-based install, lint, typecheck, unit tests and build in CI; integration jobs start with persistence. No application tests exist until implementation lands.
