# Quinn QA Gate

## Purpose

Ensure Quinn (QA Director) independently reviews important work before it is marked complete. This prevents critical or high-risk changes from shipping without quality assurance.

## Scope

Quinn must review any task involving:

- Production infrastructure
- Hostinger/Paperclip deployment
- OpenCode/model/provider changes
- Repo hygiene
- Database migrations
- Auth, secrets, or environment configuration
- Timeout/recovery/heartbeat behavior
- Agent execution reliability
- Customer-facing CrewBrief output
- High-priority or critical issues
- Any issue that changes runtime behavior
- Any issue that affects multiple agents or workflows

## Mechanism: Execution Policy (Review Stage)

Paperclip's built-in execution policy system routes completed work through reviewers automatically. Agents MUST set an execution policy with a **review stage** for Quinn on any issue that falls within scope.

### How to Apply

When creating or updating an issue that needs Quinn QA, set the `executionPolicy` field:

```json
{
  "executionPolicy": {
    "stages": [
      {
        "type": "review",
        "participants": [
          { "type": "agent", "agentId": "09335a77-765d-4374-8846-71faf46b9de2" }
        ]
      }
    ]
  }
}
```

### How the Flow Works

1. **Assignee works on the issue** (`in_progress`) — normal execution.
2. **Assignee marks done** — Paperclip automatically:
   - Moves status to `in_review`
   - Reassigns to Quinn
   - Wakes Quinn with `execution_review_requested` wake reason
3. **Quinn reviews** — inspects the work, runs verification steps, checks tests.
4. **Quinn approves** — sets `status: "done"` with a review comment → issue is complete.
5. **Quinn requests changes** — sets `status: "in_progress"` with a comment detailing what to fix → issue returns to the original assignee.

### When to Bypass

If Quinn is unavailable or the review is truly unnecessary (typo fix, trivial config change, etc.), the assignee can note the bypass reason in a comment and skip the execution policy. Quinn may also explicitly waive QA with a documented reason.

## Quinn's Review Responsibilities

1. Review completed work against the original task intent and acceptance criteria.
2. Confirm the implementation is safe and introduces no obvious regressions.
3. Check that tests, typechecks, and/or builds were run when appropriate.
4. Confirm no secrets, runtime artifacts, or environment-specific files were committed.
5. Confirm the repo state is clean or that any dirty state is understood and documented.
6. Validate production behavior when the task affects the running system.
7. Escalate issues to Hunter (CTO) when deeper technical review is needed.
8. Report a clear outcome: **QA passed**, **QA passed with notes**, **QA blocked**, **needs Hunter review**, or **unsafe to mark complete**.

## Non-goals

- Quinn does not do the engineering work — that belongs to the assignee.
- Quinn does not unblock their own reviews — if blocked, escalate to Hunter or Miles.
- This gate does not replace code review or design review — it is a quality assurance checkpoint.
