# Deployment Completion Policy

> **Version:** 1.0
> **Owner:** CEO
> **Custodian:** Hunter — CTO

---

## 1. Purpose

This document defines when work affecting a live system is truly **done**. Agents must not mark production-facing issues complete until the fix is deployed, verified in the live environment, and independently reviewed. This policy exists to prevent the exact failure mode where code is written and tested but never reaches production — leaving the live system running old, unpatched code.

---

## 2. The Eight-Step Completion Gate

No issue affecting a live system may be marked **done** until **all applicable** steps below are complete:

| # | Step | Description | Mandatory |
|---|------|-------------|-----------|
| 1 | **Code changes complete** | All planned code changes have been written and reviewed. | Always |
| 2 | **Tests pass** | Relevant test suites pass (unit, integration, or smoke as defined by the task). | Always |
| 3 | **Repo is clean** | No uncommitted changes in the working tree. `git status` reports clean or staged changes are intentional and documented. | Always |
| 4 | **Changes committed** | All changes are committed to the correct branch with a descriptive message. | Always |
| 5 | **Deployed to live environment** | The changes are deployed to the correct production or staging environment that serves live users. | Always for production issues |
| 6 | **Deployed version verified** | The deployed version matches the committed code (e.g., git SHA confirmed in production, build ID matches). | Always for production issues |
| 7 | **Live behavior tested** | For user-facing fixes, the deployed behavior is tested against the live system to confirm the fix works. | When the issue is user-facing |
| 8 | **QA approval** | Quinn (QA Director) has reviewed the work and provided explicit verification scope — noting which steps were verified and at what level (code, test, deploy, live). | Always if Quinn QA Gate applies |

### 2.1 Applicability

- **All** production issues must satisfy steps 1–6 and 8. Step 7 applies when the fix is user-facing.
- Non-production issues (documentation, internal tooling not in production) may skip steps 5–7 but must still satisfy steps 1–4 and 8.
- If a step is truly not applicable, the agent must explicitly state why in the completion comment.

### 2.2 Ordering

Steps 1–4 must be completed in order. Steps 5–7 must follow 1–4 but may overlap with each other. Step 8 (QA approval) must be the final gate before marking done.

---

## 3. Definitions

| Term | Definition |
|------|------------|
| **Code complete** | All intended code changes for the issue have been written. The implementation satisfies the acceptance criteria. No "TODO" or "FIXME" markers related to the issue remain in the code. |
| **Committed** | Changes are recorded in the local git repository with a descriptive commit message. The commit is pushed to the remote branch tracked by the issue. |
| **Deployed** | The commit containing the fix has been built and published to the live environment that serves users. A deploy script, CI/CD pipeline, or manual copy to the production server counts. Pushing to a branch alone does not count. |
| **Live verified** | The deployed version has been confirmed to match the committed code. This means checking the running environment's version identifier (e.g., git SHA, build tag, deployment log) against the expected commit. |
| **Done** | All applicable steps of the Eight-Step Completion Gate have been completed and verified. The issue status is set to `done` only after step 8 (QA approval) has passed. |

---

## 4. Dirty Repo Rule

An agent **must not** mark an issue done while the working tree has uncommitted changes.

- `git status` must show a clean tree (nothing to commit, working tree clean).
- If uncommitted changes exist, the issue status must remain `in_progress`.
- The agent must commit (or intentionally discard) changes before proceeding to the deploy or done steps.
- The completion comment must include the committing git SHA.

**Exception:** Pre-existing generated files (build artifacts, lock files outside the commit scope) may be excluded if documented in `.gitignore` and noted in the completion comment.

---

## 5. Agent Comment Rules

Every completion comment that marks or prepares to mark an issue done must explicitly state the deployment status.

### 5.1 Required Format

```
## Completion Summary

- **Deployment status:** <deployed | not deployed | not applicable>
- **Deployed version:** <git SHA or build ID, or N/A>
- **Live tested:** <yes | no — with evidence or reason>
- **QA verification scope:** <what was verified and at what level>
- **Steps completed:** 1 2 3 4 5 6 7 8 (circle the applicable ones)
```

### 5.2 Acceptable Examples

```
## Completion Summary

- **Deployment status:** deployed
- **Deployed version:** a1b2c3d (confirmed via production deploy log)
- **Live tested:** yes — sent test message, bot replied correctly
- **QA verification scope:** code review, test pass, deploy verification, live smoke
- **Steps completed:** 1 2 3 4 5 6 7 8
```

```
## Completion Summary

- **Deployment status:** not applicable (internal documentation only)
- **Deployed version:** N/A
- **Live tested:** N/A
- **QA verification scope:** document review, formatting check
- **Steps completed:** 1 2 3 4 8
```

### 5.3 Unacceptable Examples (Must Not Happen)

❌ *"Done. Tests pass, code reviewed."* — No deployment status mentioned. ❌

❌ *"Code is complete and committed. Ready for deploy."* — Marking done without deploy. ❌

❌ *"Shipped to production, all good."* — No version, no verification, no QA scope. ❌

---

## 6. QA Comment Rules

When Quinn (QA Director) reviews a completed issue, the review comment **must** distinguish between code-level verification and production/live verification.

### 6.1 Required QA Comment Format

```
## QA Review

- **Code-level verification:** <passed | failed | notes>
- **Test verification:** <passed | failed | not applicable>
- **Deploy verification:** <confirmed | not confirmed | not applicable>
- **Live verification:** <confirmed | not confirmed | not applicable>
- **Repo state:** <clean | dirty — details>
- **Result:** <QA passed | QA passed with notes | QA blocked | needs Hunter review>
```

### 6.2 Acceptable QA Example

```
## QA Review

- **Code-level verification:** passed — changes match acceptance criteria
- **Test verification:** passed — all relevant tests green
- **Deploy verification:** confirmed — SHA a1b2c3d matches production
- **Live verification:** confirmed — bot responds correctly in production
- **Repo state:** clean
- **Result:** QA passed
```

---

## 7. Special Rules for Agent-Executed Work

### 7.1 Deployment Pending Human Approval

If the deploy step requires human approval (e.g., manual production deploy, change review board), the issue must be marked **blocked** — not **done** — with a comment naming the unblock owner and action.

**Example:**
```
## Completion Summary

- **Deployment status:** pending human deploy approval
- **Deployed version:** N/A (waiting for SRE to approve and run deploy)
- **Status:** blocked
- **Unblock owner:** @sre-team
- **Unblock action:** Deploy SHA a1b2c3d to production and confirm
```

### 7.2 Multi-Step Deploy Pipeline

If deployment happens in stages (canary → rolling → full), the issue remains `in_progress` or `blocked` until the final stage is live and verified.

### 7.3 Rollback Handling

If a deploy is rolled back, any issue marked done based on that deploy must be **reopened** and moved back to `in_progress` until the fix is re-deployed and re-verified.

---

## 8. Consequences

| Violation | Consequence |
|-----------|-------------|
| Issue marked done without deploy (when deploy applies) | Issue reopened, escalated to CEO, agent's completion authority reviewed |
| Dirty repo at time of done | Issue reopened, commit history inspected, agent required to clean and re-submit |
| Completion comment missing deployment status | QA returns issue with `changes_requested`, mandatory re-review |
| QA comment fails to distinguish code vs live verification | QA outcome set to `QA blocked`, re-review required |
| Repeat violations by the same agent | Agent's auto-completion privilege revoked; manual CEO sign-off required for all future completions |
| Policy violation found after issue is fully closed | Issue reopened retroactively, post-mortem filed, corrective action assigned |

---

## 9. RACI Matrix

| Activity | Hunter (CTO) | Quinn (QA Director) | Assignee Agent | CEO |
|----------|-------------|---------------------|----------------|-----|
| Write completion comment with deployment status | C | I | **R** | I |
| Verify deployed version matches committed code | C | **R** | A | - |
| Perform live smoke test | C | **R** | A | - |
| QA review with code vs live distinction | I | **R** | I | I |
| Enforce dirty repo rule | A | **R** | **R** | - |
| Escalate repeat violations | A | **R** | - | I |
| Approve policy exceptions | C | C | - | **R** |
| Retroactive reopen on violation | A | R | - | I |

**R** = Responsible (doer), **A** = Accountable (approver), **C** = Consulted, **I** = Informed

---

## 10. Related Documents

- [Quinn QA Gate](quinn-qa-gate.md)
- [Backlog Management Policy](backlog-management.md)
- Issue Lifecycle & Status Definitions
- Deployment Runbook
