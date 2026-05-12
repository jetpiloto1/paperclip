import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";

/**
 * E2E: Communications alert pipeline.
 *
 * Validates the full lifecycle of the issue-graph liveness detection and
 * escalation dispatch:
 *   1. Stage a blocked issue chain (issue A blocked by unassigned issue B)
 *   2. Trigger the liveness auto-recovery reconciliation
 *   3. Verify detection — an escalation issue is created
 *   4. Verify dispatch — the escalation is assigned, parented, and the
 *      source issue is blocked on it with a comment
 *
 * Requires local_trusted deployment mode (set in playwright.config.ts).
 */

const PORT = Number(process.env.PAPERCLIP_E2E_PORT ?? 3199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const COMPANY_NAME = `E2E-Alert-${Date.now()}`;

interface TestContext {
  companyId: string;
  companyPrefix: string;
  managerId: string;
  engineerId: string;
  boardRequest: APIRequestContext;
  issueIds: string[];
  agentIds: string[];
  keyIds: string[];
}

async function setupCompany(boardRequest: APIRequestContext): Promise<TestContext> {
  const healthRes = await boardRequest.get(`${BASE_URL}/api/health`);
  expect(healthRes.ok()).toBe(true);
  const health = await healthRes.json();
  if (health.deploymentMode !== "local_trusted") {
    throw new Error(
      `Alert pipeline e2e tests require local_trusted deployment mode, ` +
        `but server is in "${health.deploymentMode}" mode.`,
    );
  }

  const companyRes = await boardRequest.post(`${BASE_URL}/api/companies`, {
    data: { name: COMPANY_NAME },
  });
  if (!companyRes.ok()) {
    throw new Error(`POST /api/companies -> ${companyRes.status()}: ${await companyRes.text()}`);
  }
  const company = await companyRes.json();
  const companyId = company.id;
  const companyPrefix = company.issuePrefix ?? company.urlKey ?? "E2E";

  async function createAgent(name: string, role: string, title: string, reportsTo?: string) {
    const agentRes = await boardRequest.post(`${BASE_URL}/api/companies/${companyId}/agents`, {
      data: {
        name,
        role,
        title,
        reportsTo: reportsTo ?? null,
        adapterType: "process",
        adapterConfig: {
          command: process.execPath,
          args: ["-e", "process.stdout.write('done\\n')"],
        },
      },
    });
    expect(agentRes.ok()).toBe(true);
    const agent = await agentRes.json();
    return agent;
  }

  const manager = await createAgent("CTO", "cto", "CTO");
  const engineer = await createAgent("Engineer", "engineer", "Engineer", manager.id);

  return {
    companyId,
    companyPrefix,
    managerId: manager.id,
    engineerId: engineer.id,
    boardRequest,
    issueIds: [],
    agentIds: [manager.id, engineer.id],
    keyIds: [],
  };
}

test.describe("Communications alert pipeline", () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    const boardRequest = await pwRequest.newContext({ baseURL: BASE_URL });
    ctx = await setupCompany(boardRequest);
  });

  test.afterAll(async () => {
    if (!ctx) return;
    // Clean up issues, agents, company (best-effort)
    for (const issueId of ctx.issueIds) {
      await ctx.boardRequest
        .patch(`${BASE_URL}/api/issues/${issueId}`, {
          data: { status: "cancelled", comment: "E2E test cleanup." },
        })
        .catch(() => {});
    }
    for (const agentId of ctx.agentIds) {
      await ctx.boardRequest.delete(`${BASE_URL}/api/agents/${agentId}`).catch(() => {});
    }
    await ctx.boardRequest.delete(`${BASE_URL}/api/companies/${ctx.companyId}`).catch(() => {});
    await ctx.boardRequest.dispose();
  });

  test("stage blocked issue -> detect liveness -> dispatch escalation", async () => {
    const { companyId, managerId, engineerId, boardRequest } = ctx;

    // Create blocker issue (unassigned, todo status)
    const blockerRes = await boardRequest.post(`${BASE_URL}/api/companies/${companyId}/issues`, {
      data: {
        title: "Missing unblock owner",
        status: "todo",
        priority: "medium",
      },
    });
    expect(blockerRes.ok()).toBe(true);
    const blockerIssue = await blockerRes.json();
    ctx.issueIds.push(blockerIssue.id);

    // Create blocked issue (blocked, assigned to engineer)
    const blockedRes = await boardRequest.post(`${BASE_URL}/api/companies/${companyId}/issues`, {
      data: {
        title: "Blocked parent",
        status: "blocked",
        priority: "medium",
        assigneeAgentId: engineerId,
        blockedByIssueIds: [blockerIssue.id],
      },
    });
    expect(blockedRes.ok()).toBe(true);
    const blockedIssue = await blockedRes.json();
    ctx.issueIds.push(blockedIssue.id);

    // Verify the blocker relation was established
    const blockedGet = await boardRequest.get(`${BASE_URL}/api/issues/${blockedIssue.id}`);
    expect(blockedGet.ok()).toBe(true);
    const blockedData = await blockedGet.json();
    expect(blockedData.status).toBe("blocked");
    expect(blockedData.blockedBy).toBeDefined();
    const blockerIds = blockedData.blockedBy.map((b: { id: string }) => b.id);
    expect(blockerIds).toContain(blockerIssue.id);

    // Trigger liveness reconciliation
    const runRes = await boardRequest.post(
      `${BASE_URL}/api/instance/settings/experimental/issue-graph-liveness-auto-recovery/run`,
      { data: { lookbackHours: 1 } },
    );
    expect(runRes.ok()).toBe(true);
    const runResult = await runRes.json();

    // Verify detection: at least one finding was created
    expect(runResult.findings).toBeGreaterThanOrEqual(1);

    // Verify dispatch: at least one escalation was created or already exists
    const totalEscalations = runResult.escalationsCreated + runResult.existingEscalations;
    expect(totalEscalations).toBeGreaterThanOrEqual(1);

    // Query the escalation issues directly
    const allIssuesRes = await boardRequest.get(
      `${BASE_URL}/api/companies/${companyId}/issues?q=harness_liveness_escalation`,
    );
    expect(allIssuesRes.ok()).toBe(true);
    const allIssues = await allIssuesRes.json();

    // Or use the escalationIssueIds from the result
    const escalationIds: string[] = runResult.escalationIssueIds ?? [];
    expect(escalationIds.length).toBeGreaterThanOrEqual(1);

    // Fetch the first escalation issue and verify its properties
    const escalationRes = await boardRequest.get(`${BASE_URL}/api/issues/${escalationIds[0]}`);
    expect(escalationRes.ok()).toBe(true);
    const escalation = await escalationRes.json();

    // The escalation should be parented under the blocker issue
    expect(escalation.parentId).toBe(blockerIssue.id);

    // The escalation should be assigned to the manager (CTO)
    expect(escalation.assigneeAgentId).toBe(managerId);

    // Verify the source blocked issue now has the escalation as a blocker
    const blockedAfterRes = await boardRequest.get(`${BASE_URL}/api/issues/${blockedIssue.id}`);
    expect(blockedAfterRes.ok()).toBe(true);
    const blockedAfter = await blockedAfterRes.json();
    const afterBlockerIds = blockedAfter.blockedBy.map((b: { id: string }) => b.id);
    expect(afterBlockerIds).toContain(escalation.id);

    // Verify a comment was added to the source issue about the liveness incident
    const commentsRes = await boardRequest.get(
      `${BASE_URL}/api/issues/${blockedIssue.id}/comments`,
    );
    expect(commentsRes.ok()).toBe(true);
    const comments = await commentsRes.json();
    const livenessComment = comments.find(
      (c: { body: string }) =>
        c.body && c.body.includes("harness-level liveness incident"),
    );
    expect(livenessComment).toBeTruthy();
  });
});
