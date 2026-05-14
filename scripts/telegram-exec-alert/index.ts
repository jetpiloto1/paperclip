#!/usr/bin/env -S node --import tsx

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
const CHAT_ID = process.env.JEFF_TELEGRAM_CHAT_ID || process.env.CHAT_ID;
const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL;
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY;
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID;

const MIN_INTERVAL_MS = 1100;
const MAX_BUTTONS_PER_GROUP = 20;
const MAX_MESSAGE_LENGTH = 3800;
const MAX_RETRY_AFTER_MS = 30000;
const DRY_RUN = process.env.TELEGRAM_ALERTS_DRY_RUN === "true";
const STATE_DIR = process.env.TELEGRAM_ALERT_STATE_DIR || "/tmp/telegram-alert";
const STATE_FILE = join(STATE_DIR, "state.json");
const AUDIT_LOG = join(STATE_DIR, "audit.log");

interface AlertState {
  alertedItems: Record<string, number>;
}

interface FetchResult {
  items: AlertItem[];
  ok: boolean;
}

interface AlertItem {
  id: string;
  category: "blocked" | "approval_needed" | "question_for_jeff" | "critical_production";
  identifier: string;
  title: string;
  agent?: string;
  reason: string;
  link: string;
  explanation?: string;
  actionText?: string;
}

interface Interaction {
  id: string;
  issueId: string;
  kind: string;
  status: string;
  targetUserId?: string;
  payload?: {
    title?: string;
    summary?: string;
    recommendedAction?: string;
  };
}

function missingEnv(name: string): void {
  console.error(`Missing required env: ${name}`);
}
function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function readState(): AlertState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {
    // corrupted state file, start fresh
  }
  return { alertedItems: {} };
}

function writeState(state: AlertState): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function auditLog(message: string): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const ts = new Date().toISOString();
  const safe = message.replace(/\n/g, "\\n");
  appendFileSync(AUDIT_LOG, `${ts} ${safe}\n`);
}

function tokenSafe(str: string): string {
  if (!BOT_TOKEN) return str;
  return str.replaceAll(BOT_TOKEN, "[REDACTED]");
}

function shouldAlert(state: AlertState, itemId: string): boolean {
  return !state.alertedItems[itemId];
}

function markAlerted(state: AlertState, itemId: string): void {
  state.alertedItems[itemId] = Date.now();
}

async function apiGet<T>(path: string): Promise<T> {
  const url = `${PAPERCLIP_API_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} for ${path}`);
  }
  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkifyIssueIds(text: string): string {
  return text.replace(/\b([A-Z]{2,}-\d+)\b/g, (_match, id) => {
    return `<a href="${makeLink(id)}">${id}</a>`;
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  blocked: "\u{1F534} BLOCKED TASK",
  approval_needed: "\u2705 APPROVAL NEEDED",
  question_for_jeff: "\u2753 QUESTION FOR YOU",
  critical_production: "\u26A0\uFE0F CRITICAL ISSUE",
};

const CATEGORY_HEADERS: Record<string, string> = {
  blocked: "\u{1F534} BLOCKED TASKS",
  approval_needed: "\u2705 APPROVALS NEEDED",
  question_for_jeff: "\u2753 QUESTIONS FOR YOU",
  critical_production: "\u26A0\uFE0F CRITICAL ISSUES",
};

function getButtonLabel(item: AlertItem): string {
  switch (item.category) {
    case "blocked":
      return `\u{1F513} Open ${item.identifier}`;
    case "approval_needed":
      return `\u2705 Review Approval`;
    case "question_for_jeff":
      return `\u{1F4AC} Answer on ${item.identifier}`;
    case "critical_production":
      return `\u{1F525} View ${item.identifier}`;
    default:
      return `Open ${item.identifier}`;
  }
}

const STATUS_LABELS: Record<string, string> = {
  blocked: "Blocked",
  approval_needed: "Awaiting Approval",
  question_for_jeff: "Awaiting Response",
  critical_production: "Critical",
};

async function sendTelegram(items: AlertItem[]): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) {
    auditLog(`SKIP no BOT_TOKEN/CHAT_ID configured`);
    return false;
  }

  if (DRY_RUN) {
    const labels = items.map((i) => i.identifier).join(", ");
    auditLog(`DRY_RUN ${items[0].category} group [${labels}] would send ${items.length} item(s)`);
    return true;
  }

  const category = items[0].category;
  const headline = items.length === 1
    ? CATEGORY_LABELS[category]
    : `${CATEGORY_HEADERS[category]} (${items.length})`;

  const lines: string[] = [
    `<b>${escapeHtml(headline)}</b>`,
    ``,
  ];

  for (const [idx, item] of items.entries()) {
    const num = items.length > 1 ? `${idx + 1}. ` : "";
    const idLink = `<a href="${item.link}">${escapeHtml(item.identifier)}</a>`;
    lines.push(`${num}${idLink} \u2014 ${escapeHtml(item.title)}`);
    lines.push(`   Status: ${STATUS_LABELS[item.category]}`);
    if (item.explanation) {
      lines.push(`   Blocker: ${linkifyIssueIds(escapeHtml(item.explanation))}`);
    }
    if (item.actionText) {
      lines.push(`   Action needed: ${linkifyIssueIds(escapeHtml(item.actionText))}`);
    }
    lines.push(``);
  }

  const text = lines.filter(Boolean).join("\n");

  if (text.length > MAX_MESSAGE_LENGTH && items.length > 1) {
    const mid = Math.ceil(items.length / 2);
    const ok1 = await sendTelegram(items.slice(0, mid));
    await sleep(MIN_INTERVAL_MS);
    const ok2 = await sendTelegram(items.slice(mid));
    return ok1 && ok2;
  }

  const keyboard = items.slice(0, MAX_BUTTONS_PER_GROUP).map((item) => [
    { text: getButtonLabel(item), url: item.link },
  ]);

  const body: Record<string, unknown> = {
    chat_id: CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard },
  };

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ok = res.ok;
    const labels = items.map((i) => i.identifier).join(", ");
    const responseText = ok ? "sent" : `HTTP ${res.status}`;
    auditLog(`${category} group [${labels}] ${responseText}`);
    if (!ok) {
      const errBody = await res.text().catch(() => "unknown");
      if (res.status === 400) {
        auditLog(`${category} group [${labels}] HTML_PARSE_ERR, retrying as plain text`);
        delete body.parse_mode;
        const retryRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (retryRes.ok) {
          auditLog(`${category} group [${labels}] sent (text fallback)`);
          return true;
        }
        const retryBody = await retryRes.text().catch(() => "unknown");
        console.error(
          `Telegram API error for ${category}: ${retryRes.status} ${tokenSafe(retryBody)}`
        );
        return false;
      }
      if (res.status === 429 && items.length > 0) {
        try {
          const errJson = JSON.parse(errBody);
          const retryAfter = errJson.parameters?.retry_after ?? 5;
          const waitMs = Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS);
          auditLog(`${category} group [${labels}] RATE LIMITED, retrying after ${retryAfter}s`);
          await sleep(waitMs);
          return sendTelegram(items);
        } catch {
          // non-JSON 429 body, fall through to error log
        }
      }
      console.error(
        `Telegram API error for ${category}: ${res.status} ${tokenSafe(errBody)}`
      );
    }
    return ok;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const labels = items.map((i) => i.identifier).join(", ");
    auditLog(`${category} group [${labels}] FAIL ${tokenSafe(msg)}`);
    console.error(`Telegram send failed for ${category}: ${tokenSafe(msg)}`);
    return false;
  }
}

function makeLink(identifier: string): string {
  const prefix = identifier.split("-")[0];
  return `https://paperclip.avva.aero/${prefix}/issues/${identifier}`;
}

function makeApprovalLink(approvalId: string): string {
  return `https://paperclip.avva.aero/CRE/approvals/${approvalId}`;
}

interface ApiIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  blockedBy?: Array<{ id: string }>;
  blockedByIssueIds?: string[];
}

async function getBlockedIssues(): Promise<FetchResult> {
  const items: AlertItem[] = [];
  try {
    const issues = await apiGet<ApiIssue[]>(
      `/api/companies/${COMPANY_ID}/issues?status=blocked&includeBlockedBy=true`
    );
    for (const issue of issues) {
      if (issue.status !== "blocked") continue;
      const blockerCount = (issue.blockedBy || issue.blockedByIssueIds || []).length;
      items.push({
        id: issue.id,
        category: "blocked",
        identifier: issue.identifier,
        title: issue.title,
        reason: `Task is blocked (${blockerCount} blocker(s))`,
        link: makeLink(issue.identifier),
        explanation: `${issue.identifier} is blocked by ${blockerCount} unresolved issue(s).`,
        actionText: `Open ${issue.identifier} to review blockers and unblock by changing status from 'Blocked' to 'To Do'.`,
      });
    }
  } catch (err) {
    console.error("Failed fetching blocked issues:", err);
    return { items: [], ok: false };
  }
  return { items, ok: true };
}

async function getQuestionsForJeff(): Promise<FetchResult> {
  const items: AlertItem[] = [];
  try {
    const issues = await apiGet<ApiIssue[]>(
      `/api/companies/${COMPANY_ID}/issues?status=blocked,in_progress,in_review,todo&limit=50`
    );
    for (const issue of issues) {
      const interactions = await apiGet<Interaction[]>(
        `/api/issues/${issue.id}/interactions`
      );
      for (const interaction of interactions) {
        if (interaction.status === "pending" && interaction.targetUserId === "jdogVxlZPWoYam0aNGo3meqX7ZRkMXMS") {
          items.push({
            id: `${issue.id}-q-${interaction.id}`,
            category: "question_for_jeff",
            identifier: issue.identifier,
            title: issue.title,
            reason: "Agent has a question for you",
            link: makeLink(issue.identifier),
            explanation: interaction.payload?.summary || `An agent is waiting for your response on ${issue.identifier}.`,
            actionText: `Open ${issue.identifier} to review and respond to the question.`,
          });
          break;
        }
      }
    }
  } catch (err) {
    console.error("Failed fetching questions for Jeff:", err);
    return { items: [], ok: false };
  }
  return { items, ok: true };
}

async function getCriticalProductionIssues(): Promise<FetchResult> {
  const items: AlertItem[] = [];
  try {
    const issues = await apiGet<ApiIssue[]>(
      `/api/companies/${COMPANY_ID}/issues?priority=critical&status=blocked,in_progress,in_review,todo&limit=50`
    );
    for (const issue of issues) {
      if (issue.priority !== "critical") continue;
      items.push({
        id: issue.id,
        category: "critical_production",
        identifier: issue.identifier,
        title: issue.title,
        reason: "Critical production issue requires executive awareness",
        link: makeLink(issue.identifier),
        explanation: `Issue ${issue.identifier} is a critical priority production concern.`,
        actionText: `Review ${issue.identifier} to assess impact and assign resources.`,
      });
    }
  } catch (err) {
    console.error("Failed fetching critical production issues:", err);
    return { items: [], ok: false };
  }
  return { items, ok: true };
}

interface Approval {
  id: string;
  type: string;
  title: string;
  summary?: string;
  status: string;
  issueIds?: string[];
  requestedByAgentId?: string;
  payload?: { title?: string; summary?: string; recommendedAction?: string };
}
async function getPendingApprovals(): Promise<FetchResult> {
  const items: AlertItem[] = [];
  try {
    const approvals = await apiGet<Approval[]>(
      `/api/companies/${COMPANY_ID}/approvals?status=pending`
    );
    for (const approval of approvals) {
      const title = approval.payload?.title || approval.title || "Untitled";
      const summary = approval.payload?.summary || approval.summary || "";
      const rec = approval.payload?.recommendedAction
        ? ` — ${approval.payload.recommendedAction}`
        : "";
      items.push({
        id: approval.id,
        category: "approval_needed",
        identifier: approval.id.slice(0, 8),
        title,
        reason: summary + rec || "Board approval requested",
        link: makeApprovalLink(approval.id),
        explanation: summary || `Your approval is requested: ${title}.`,
        actionText: `Open the approval to review and ${approval.type === "request_board_approval" ? "approve or deny" : "respond"}.`,
      });
    }
  } catch (err) {
    console.error("Failed fetching pending approvals:", err);
    return { items: [], ok: false };
  }
  return { items, ok: true };
}

async function sendAll(items: AlertItem[]): Promise<string[]> {
  const groups = new Map<string, AlertItem[]>();
  for (const item of items) {
    const group = groups.get(item.category) || [];
    group.push(item);
    groups.set(item.category, group);
  }

  const sentIds: string[] = [];
  for (const [, groupItems] of groups) {
    const ok = await sendTelegram(groupItems);
    if (ok) {
      sentIds.push(...groupItems.map((i) => i.id));
    }
    await sleep(MIN_INTERVAL_MS);
  }
  return sentIds;
}

async function main(): Promise<void> {
  const alertsEnabled = process.env.TELEGRAM_ALERTS_ENABLED;
  if (alertsEnabled === "false" || alertsEnabled === "0") {
    console.log("TELEGRAM_ALERTS_ENABLED is false/0, exiting silently.");
    process.exit(0);
  }

  if (!BOT_TOKEN) missingEnv("TELEGRAM_BOT_TOKEN (or BOT_TOKEN)");
  if (!CHAT_ID) missingEnv("JEFF_TELEGRAM_CHAT_ID (or CHAT_ID)");
  if (!PAPERCLIP_API_URL) missingEnv("PAPERCLIP_API_URL");
  if (!PAPERCLIP_API_KEY) missingEnv("PAPERCLIP_API_KEY");
  if (!COMPANY_ID) missingEnv("COMPANY_ID");

  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY || !COMPANY_ID) {
    fail("Missing required Paperclip env vars (PAPERCLIP_API_URL, PAPERCLIP_API_KEY, COMPANY_ID)");
  }

  const state = readState();

  // Fetch all data sources. Each returns an ok flag so we can detect partial
  // failures and avoid corrupting notification state.
  const blocked = await getBlockedIssues();
  const approvals = await getPendingApprovals();
  const questions = await getQuestionsForJeff();
  const critical = await getCriticalProductionIssues();
  const anyFetchFailed = !blocked.ok || !approvals.ok || !questions.ok || !critical.ok;

  const rawItems = [...blocked.items, ...approvals.items, ...questions.items, ...critical.items];

  // Deduplicate across categories — same issue UUID appearing in both blocked
  // and critical should only alert once, keeping the first (more important) category.
  const seen = new Set<string>();
  const allItems: AlertItem[] = [];
  for (const item of rawItems) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      allItems.push(item);
    }
  }

  const toSend: AlertItem[] = [];
  for (const item of allItems) {
    if (shouldAlert(state, item.id)) {
      toSend.push(item);
    }
  }

  if (toSend.length === 0) {
    auditLog("CHECK no new items to alert");
    console.log("No new items to alert.");
    process.exit(0);
  }

  const groupCount = new Set(toSend.map((i) => i.category)).size;
  console.log(`Sending ${toSend.length} alert(s) in ${groupCount} group(s)...`);
  const sentIds = await sendAll(toSend);

  for (const item of toSend) {
    if (sentIds.includes(item.id)) {
      markAlerted(state, item.id);
    }
  }

  // Only clean up resolved items when ALL fetches succeeded. If any fetch
  // failed, the data may be incomplete — removing state entries would cause
  // re-alerting of items that still exist but weren't fetched.
  if (!anyFetchFailed) {
    const currentIds = new Set(allItems.map((i) => i.id));
    for (const id of Object.keys(state.alertedItems)) {
      if (!currentIds.has(id)) {
        delete state.alertedItems[id];
      }
    }
  } else {
    auditLog("SKIP cleanup — one or more API fetches failed");
    console.warn("One or more API fetches failed — skipping state cleanup to avoid re-alert spam.");
  }
  writeState(state);

  auditLog(`DONE sent ${sentIds.length}/${toSend.length} alert(s) in ${groupCount} group(s)`);
  console.log(`Done. ${sentIds.length}/${toSend.length} alert(s) in ${groupCount} group(s) sent.`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${tokenSafe(msg)}`);
  auditLog(`FATAL ${tokenSafe(msg)}`);
  process.exit(1);
});
