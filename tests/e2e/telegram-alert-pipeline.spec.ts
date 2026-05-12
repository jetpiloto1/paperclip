import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execFileAsync = promisify(execFile);

/**
 * E2E: Telegram alert pipeline.
 *
 * Validates the full lifecycle of the standalone Telegram alert script:
 *   1. Stage a blocked issue (status=blocked with blocker chain)
 *   2. Run the telegram-exec-alert monitor script against the local API
 *   3. Verify the audit log captures the blocked issue
 *   4. Run again — verify the cooldown skips recently-alerted items
 *
 * Requires local_trusted deployment mode (set in playwright.config.ts).
 */

const PORT = Number(process.env.PAPERCLIP_E2E_PORT ?? 3199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const COMPANY_NAME = `E2E-Telegram-${Date.now()}`;
const TSX = join(__dirname, "../../cli/node_modules/.bin/tsx");
const SCRIPT = join(__dirname, "../../scripts/telegram-exec-alert/index.ts");

interface TestContext {
  companyId: string;
  companyPrefix: string;
  agentId: string;
  agentToken: string;
  agentKeyId: string;
  boardRequest: APIRequestContext;
  issueIds: string[];
  stateDir: string;
}

async function setupCompany(boardRequest: APIRequestContext): Promise<TestContext> {
  const healthRes = await boardRequest.get(`${BASE_URL}/api/health`);
  expect(healthRes.ok()).toBe(true);
  const health = await healthRes.json();
  if (health.deploymentMode !== "local_trusted") {
    throw new Error(
      `Telegram alert e2e tests require local_trusted deployment mode, ` +
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

  const agentRes = await boardRequest.post(`${BASE_URL}/api/companies/${companyId}/agent-hires`, {
    data: {
      name: "MonitorBot",
      role: "engineer",
      title: "Monitor Bot",
      adapterType: "process",
      adapterConfig: {
        command: process.execPath,
        args: ["-e", "process.stdout.write('done\\n')"],
      },
    },
  });
  expect(agentRes.ok()).toBe(true);
  const hire = await agentRes.json();
  const agent = hire.agent;
  if (hire.approval) {
    await boardRequest.post(`${BASE_URL}/api/approvals/${hire.approval.id}/approve`, {
      data: { decisionNote: "Approved for telegram e2e setup." },
    });
  }

  const keyRes = await boardRequest.post(`${BASE_URL}/api/agents/${agent.id}/keys`, {
    data: { name: "e2e-telegram" },
  });
  expect(keyRes.ok()).toBe(true);
  const keyData = await keyRes.json();

  const stateDir = join("/tmp", `e2e-telegram-${Date.now()}`);

  return {
    companyId,
    companyPrefix,
    agentId: agent.id,
    agentToken: keyData.token,
    agentKeyId: keyData.id,
    boardRequest,
    issueIds: [],
    stateDir,
  };
}

test.describe("Telegram alert pipeline", () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    const boardRequest = await pwRequest.newContext({ baseURL: BASE_URL });
    ctx = await setupCompany(boardRequest);
  });

  test.afterAll(async () => {
    if (!ctx) return;
    for (const issueId of ctx.issueIds) {
      await ctx.boardRequest
        .patch(`${BASE_URL}/api/issues/${issueId}`, {
          data: { status: "cancelled", comment: "E2E test cleanup." },
        })
        .catch(() => {});
    }
    await ctx.boardRequest.delete(`${BASE_URL}/api/agents/${ctx.agentId}/keys/${ctx.agentKeyId}`).catch(() => {});
    await ctx.boardRequest.delete(`${BASE_URL}/api/agents/${ctx.agentId}`).catch(() => {});
    await ctx.boardRequest.delete(`${BASE_URL}/api/companies/${ctx.companyId}`).catch(() => {});
    await ctx.boardRequest.dispose();
    rmSync(ctx.stateDir, { recursive: true, force: true });
  });

  test("stage blocked issue -> run monitor -> verify audit log", async () => {
    const { companyId, agentId, agentToken, boardRequest, stateDir } = ctx;

    // Create blocker issue (unassigned)
    const blockerRes = await boardRequest.post(`${BASE_URL}/api/companies/${companyId}/issues`, {
      data: { title: "Telegram test blocker", status: "todo", priority: "medium" },
    });
    expect(blockerRes.ok()).toBe(true);
    const blockerIssue = await blockerRes.json();
    ctx.issueIds.push(blockerIssue.id);

    // Create blocked issue
    const blockedRes = await boardRequest.post(`${BASE_URL}/api/companies/${companyId}/issues`, {
      data: {
        title: "Telegram test blocked issue",
        status: "blocked",
        priority: "medium",
        assigneeAgentId: agentId,
        blockedByIssueIds: [blockerIssue.id],
      },
    });
    expect(blockedRes.ok()).toBe(true);
    const blockedIssue = await blockedRes.json();
    ctx.issueIds.push(blockedIssue.id);

    // Verify blocker relation
    const blockedGet = await boardRequest.get(`${BASE_URL}/api/issues/${blockedIssue.id}`);
    expect(blockedGet.ok()).toBe(true);
    const blockedData = await blockedGet.json();
    expect(blockedData.status).toBe("blocked");

    // Prepare fresh state directory for the script
    rmSync(stateDir, { recursive: true, force: true });
    mkdirSync(stateDir, { recursive: true });

    const env = {
      ...process.env,
      PAPERCLIP_API_URL: BASE_URL,
      PAPERCLIP_API_KEY: agentToken,
      PAPERCLIP_COMPANY_ID: companyId,
      TELEGRAM_ALERT_STATE_DIR: stateDir,
    };

    // Act 1: Run the Telegram alert script
    const { stdout } = await execFileAsync(TSX, [SCRIPT], { env, timeout: 15_000 });

    // Verify script executed and found items
    expect(stdout).toContain("Sending");
    expect(stdout).toContain("alert(s) sent");

    // Verify audit log
    const auditLogPath = join(stateDir, "audit.log");
    expect(existsSync(auditLogPath)).toBe(true);
    const auditLog = readFileSync(auditLogPath, "utf-8");

    // Script found 1 blocked issue but skipped Telegram send (no bot token)
    expect(auditLog).toContain("SKIP no BOT_TOKEN/CHAT_ID");
    expect(auditLog).toContain("DONE sent 1 alert(s)");

    // Act 2: Run again — verify cooldown skips recently-alerted items
    rmSync(auditLogPath, { force: true });
    const { stdout: stdout2 } = await execFileAsync(TSX, [SCRIPT], { env, timeout: 15_000 });

    expect(stdout2).toContain("No new items to alert");
    const auditLog2 = readFileSync(auditLogPath, "utf-8");
    expect(auditLog2).toContain("CHECK no new items to alert");
  });
});
