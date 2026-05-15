# Production Deployment Completion Policy

## Purpose

Ensure that no issue affecting a live system is marked done until changes have been deployed and verified in production. This prevents the pattern where code is written and tested locally but the live system continues running old code.

**Driving incident:** The Chase Telegram guardrail fix was coded and tested but never deployed. The live bot ran old code while the issue was marked complete.

## The Eight-Step Completion Gate

No issue affecting a live system may be marked **done** until ALL applicable steps are complete:

| # | Step | Description |
|---|------|-------------|
| 1 | **Code changes complete** | All required implementation work is finished |
| 2 | **Tests pass** | Relevant tests pass (unit, integration, smoke) |
| 3 | **Repo is clean** | No uncommitted changes in the working tree |
| 4 | **Changes committed** | Changes are committed to the repository |
| 5 | **Deployed to live environment** | Changes are pushed to production or the correct target environment |
| 6 | **Deployed version verified** | The deployed version is confirmed to contain the expected changes |
| 7 | **Live behavior tested** | For user-facing fixes, behavior is verified against the live system |
| 8 | **QA approval with scope** | QA (or delegated reviewer) approves with an explicit statement of verification scope |

Steps may be skipped only when a step is demonstrably not applicable. The skipping agent must document why in the completion comment.

## Definitions

### Code Complete

All code changes required by the issue have been written, type-check, and are functionally correct in a development or staging environment. The implementation satisfies the issue's acceptance criteria.

### Committed

Changes have been staged and committed to the local branch with a meaningful commit message. An empty or placeholder commit ("wip", "fix", etc.) does not satisfy this definition.

### Deployed

The commit containing the fix has been pushed to the correct live environment (production, staging, or the target environment specified by the issue). This means:

- For bot/agent software: the running process has been restarted with the new code
- For web services: the new version is serving traffic
- For infrastructure: the new configuration is applied
- For database changes: the migration has been run

"Pushed to a branch" or "merged to main" is not deployed. The change must be running in the target environment.

### Live Verified

The deployed version has been checked to confirm it is running the expected code. Verification methods include:

- Checking the deployed version string or git SHA via a status endpoint
- Confirming the bot's startup log shows the new commit hash
- Running a health check that returns the expected version
- Verifying via the deployment system's status

### Done

All eight applicable steps are complete AND QA has approved with explicit verification scope. The issue is truly done only when the fix is running in production and confirmed.

## Agent Comment Rules

Every agent comment on a production-facing issue MUST state deployment status in the final disposition comment. This applies to all agents and all issue transitions to `done`.

### Required Information

Every completion comment must explicitly address:
1. **Deployment status** — deployed or not deployed
2. **Where deployed** — environment name (production, staging, etc.)
3. **Verification method** — how the deployed version was confirmed
4. **Live test result** — for user-facing changes, what was tested against the live system

### Acceptable Examples

> "Fix implemented, tests pass, committed as abc123. Deployed to production and verified via /health endpoint returning sha abc123. Live test confirms Telegram guardrail now fires correctly. QA approved with scope: end-to-end guardrail behavior."

> "Infra change applied. Terraform plan applied to production, confirmed via `terraform show` and driftscan. No user-facing behavior change. QA approved scope: infra drift check."

### Unacceptable Examples

> "Done" — No deployment status, no verification, no QA scope.

> "Code is complete, tests pass." — Missing deployment and live verification.

> "Merged to main." — Merging is not deploying.

> "Deployed." — Missing verification method and QA scope.

### Comment Template

```markdown
## Completion Summary
- **Deployment status:** [deployed / not applicable]
- **Target environment:** [production / staging / other]
- **Verification method:** [how version was confirmed]
- **Live test result:** [what was tested / N/A]
- **QA approval scope:** [what was reviewed]

## Details
[Any additional context or caveats]
```

## Dirty Repo Rule

A working tree with uncommitted changes is **always** incomplete. An agent may not mark an issue done if any of the following are true:

- Untracked files exist in the working tree
- Modified files exist that are not staged
- Staged changes exist that are not committed
- The commit has not been pushed to remote (when deployment depends on remote)

Exception: files that are explicitly documented as ephemeral (logs, temp files covered by .gitignore, build artifacts) do not count as dirty.

## Scope

This policy applies to any issue that:

- Changes code running in a live environment
- Modifies infrastructure, deployment config, or CI/CD pipelines
- Alters database schemas or data in a shared/production database
- Changes auth, secrets, or environment configuration
- Modifies a service or agent that serves customers or other agents
- Fixes a bug in any deployed system

This policy does NOT apply to:

- Documentation-only changes (typos, README updates)
- Internal development tooling that does not touch production
- Purely speculative or planning issues

## Enforcement

This policy is enforced through:

1. **Execution policy reviews** — Issues in scope MUST have a review stage (see [Quinn QA Gate](knowledge-base/quinn-qa-gate.md)).
2. **Completion gate checklist** — The eight-step gate serves as the definitive completion criteria.
3. **QA verification** — Quinn or the designated reviewer confirms deployment and live verification before marking done.
4. **Consequences** — An agent found to have marked a production issue done without deployment and verification will have the issue reopened and may be subject to process review.

## Related Documents

- [Quinn QA Gate](knowledge-base/quinn-qa-gate.md) — Review stage mechanism and QA responsibilities
- [Execution Policy Guide](../guides/execution-policy.md) — How execution policies work in Paperclip
