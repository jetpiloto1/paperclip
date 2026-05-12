import { createHash } from "node:crypto";
import os from "node:os";
import type { AdapterModel } from "@paperclipai/adapter-utils";
import {
  asString,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";
import { isValidOpenCodeModelId } from "../index.js";

const MODELS_CACHE_TTL_MS = 300_000;
const MODELS_DISCOVERY_TIMEOUT_MS = 30_000;
const MODELS_DISCOVERY_MAX_TIMEOUT_MS = 120_000;

function resolveOpenCodeCommand(input: unknown): string {
  const envOverride =
    typeof process.env.PAPERCLIP_OPENCODE_COMMAND === "string" &&
    process.env.PAPERCLIP_OPENCODE_COMMAND.trim().length > 0
      ? process.env.PAPERCLIP_OPENCODE_COMMAND.trim()
      : "opencode";
  return asString(input, envOverride);
}

const discoveryCache = new Map<string, { expiresAt: number; models: AdapterModel[] }>();
const VOLATILE_ENV_KEY_PREFIXES = ["PAPERCLIP_", "npm_", "NPM_"] as const;
const VOLATILE_ENV_KEY_EXACT = new Set(["PWD", "OLDPWD", "SHLVL", "_", "TERM_SESSION_ID", "HOME"]);

let lastSuccessfulModels: AdapterModel[] | null = null;
let preloadPromise: Promise<void> | null = null;

export function requireOpenCodeModelId(input: unknown): string {
  const model = asString(input, "").trim();
  if (!isValidOpenCodeModelId(model)) {
    throw new Error("OpenCode requires `adapterConfig.model` in provider/model format.");
  }
  return model;
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function sortModels(models: AdapterModel[]): AdapterModel[] {
  return [...models].sort((a, b) =>
    a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }),
  );
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function parseModelTokens(text: string, target: AdapterModel[]) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const firstToken = line.split(/\s+/)[0]?.trim() ?? "";
    if (!firstToken.includes("/")) continue;
    const provider = firstToken.slice(0, firstToken.indexOf("/")).trim();
    const model = firstToken.slice(firstToken.indexOf("/") + 1).trim();
    if (!provider || !model) continue;
    target.push({ id: `${provider}/${model}`, label: `${provider}/${model}` });
  }
}

export function parseOpenCodeModelsOutput(stdout: string): AdapterModel[] {
  const parsed: AdapterModel[] = [];
  const trimmed = stdout.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      if (Array.isArray(json)) {
        for (const item of json) {
          if (typeof item === "string") {
            const slashIdx = item.indexOf("/");
            if (slashIdx > 0 && slashIdx < item.length - 1) {
              parsed.push({ id: item, label: item });
            }
          } else if (typeof item === "object" && item !== null) {
            const id = (item as Record<string, unknown>).id;
            if (typeof id === "string" && id.includes("/")) {
              parsed.push({ id, label: id });
            }
          }
        }
      } else if (typeof json === "object" && json !== null) {
        const data = (json as Record<string, unknown>).data;
        if (Array.isArray(data)) {
          for (const item of data) {
            if (typeof item === "string") {
              const slashIdx = item.indexOf("/");
              if (slashIdx > 0 && slashIdx < item.length - 1) {
                parsed.push({ id: item, label: item });
              }
            } else if (typeof item === "object" && item !== null) {
              const id = (item as Record<string, unknown>).id;
              if (typeof id === "string" && id.includes("/")) {
                parsed.push({ id, label: id });
              }
            }
          }
        }
      }
      if (parsed.length > 0) return dedupeModels(parsed);
    } catch {
      // Not valid JSON; fall through to plain-text parsing.
    }
  }

  parseModelTokens(stdout, parsed);
  return dedupeModels(parsed);
}

function normalizeEnv(input: unknown): Record<string, string> {
  const envInput = typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envInput)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

function isVolatileEnvKey(key: string): boolean {
  if (VOLATILE_ENV_KEY_EXACT.has(key)) return true;
  return VOLATILE_ENV_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function discoveryCacheKey(command: string, cwd: string, env: Record<string, string>) {
  const envKey = Object.entries(env)
    .filter(([key]) => !isVolatileEnvKey(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${hashValue(value)}`)
    .join("\n");
  return `${command}\n${cwd}\n${envKey}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneExpiredDiscoveryCache(now: number) {
  for (const [key, value] of discoveryCache.entries()) {
    if (value.expiresAt <= now) discoveryCache.delete(key);
  }
}

export async function discoverOpenCodeModels(input: {
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  timeoutSec?: number;
} = {}): Promise<AdapterModel[]> {
  const command = resolveOpenCodeCommand(input.command);
  const cwd = asString(input.cwd, process.cwd());
  const env = normalizeEnv(input.env);
  // Ensure HOME points to the actual running user's home directory.
  // When the server is started via `runuser -u <user>`, HOME may still
  // reflect the parent process (e.g. /root), causing OpenCode to miss
  // provider auth credentials stored under the target user's home.
  let resolvedHome: string | undefined;
  try {
    resolvedHome = os.userInfo().homedir || undefined;
  } catch {
    // os.userInfo() throws a SystemError when the current UID has no
    // /etc/passwd entry (e.g. `docker run --user 1234` with a minimal
    // image). Fall back to process.env.HOME.
  }
  // Prevent OpenCode from writing an opencode.json into the working directory.
  const runtimeEnv = normalizeEnv(ensurePathInEnv({ ...process.env, ...env, ...(resolvedHome ? { HOME: resolvedHome } : {}), OPENCODE_DISABLE_PROJECT_CONFIG: "true" }));

  const modelsTimeoutSec = input.timeoutSec != null && input.timeoutSec > 0
    ? Math.min(input.timeoutSec, MODELS_DISCOVERY_MAX_TIMEOUT_MS / 1000)
    : MODELS_DISCOVERY_TIMEOUT_MS / 1000;

  const result = await runChildProcess(
    `opencode-models-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    command,
    ["models"],
    {
      cwd,
      env: runtimeEnv,
      timeoutSec: modelsTimeoutSec,
      graceSec: 3,
      onLog: async () => {},
    },
  );

  if (result.timedOut) {
    throw new Error(`\`opencode models\` timed out after ${modelsTimeoutSec}s.`);
  }
  if ((result.exitCode ?? 1) !== 0) {
    const detail = firstNonEmptyLine(result.stderr) || firstNonEmptyLine(result.stdout);
    throw new Error(detail ? `\`opencode models\` failed: ${detail}` : "`opencode models` failed.");
  }

  return sortModels(parseOpenCodeModelsOutput(result.stdout));
}

export async function discoverOpenCodeModelsCached(input: {
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  timeoutSec?: number;
} = {}): Promise<AdapterModel[]> {
  const command = resolveOpenCodeCommand(input.command);
  const cwd = asString(input.cwd, process.cwd());
  const env = normalizeEnv(input.env);
  const key = discoveryCacheKey(command, cwd, env);
  const now = Date.now();
  pruneExpiredDiscoveryCache(now);
  const cached = discoveryCache.get(key);
  if (cached && cached.expiresAt > now) return cached.models;

  const models = await discoverOpenCodeModels({ command, cwd, env, timeoutSec: input.timeoutSec });
  lastSuccessfulModels = models;
  discoveryCache.set(key, { expiresAt: now + MODELS_CACHE_TTL_MS, models });
  return models;
}

async function discoverOpenCodeModelsWithRetry(input: {
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  timeoutSec?: number;
}): Promise<AdapterModel[]> {
  const MAX_ATTEMPTS = 2;
  const RETRY_DELAY_MS = 5_000;

  for (let attempt = 1; ; attempt++) {
    try {
      return await discoverOpenCodeModelsCached(input);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      await sleep(RETRY_DELAY_MS);
    }
  }
}

export async function ensureOpenCodeModelConfiguredAndAvailable(input: {
  model?: unknown;
  command?: unknown;
  cwd?: unknown;
  env?: unknown;
  timeoutSec?: number;
}): Promise<AdapterModel[]> {
  const model = requireOpenCodeModelId(input.model);

  let models: AdapterModel[];
  try {
    models = await discoverOpenCodeModelsWithRetry({
      command: input.command,
      cwd: input.cwd,
      env: input.env,
      timeoutSec: input.timeoutSec,
    });
  } catch (err) {
    const fallback = lastSuccessfulModels;
    if (fallback && fallback.some((entry) => entry.id === model)) {
      console.warn(
        "[opencode-local] OpenCode models discovery failed, but configured model was previously validated. Using cached model list.",
      );
      return fallback;
    }
    throw err;
  }

  if (models.length === 0) {
    throw new Error("OpenCode returned no models. Run `opencode models` and verify provider auth.");
  }

  if (!models.some((entry) => entry.id === model)) {
    const sample = models.slice(0, 12).map((entry) => entry.id).join(", ");
    throw new Error(
      `Configured OpenCode model is unavailable: ${model}. Available models: ${sample}${models.length > 12 ? ", ..." : ""}`,
    );
  }

  return models;
}

export async function preloadOpenCodeModels(): Promise<void> {
  try {
    const models = await discoverOpenCodeModelsCached();
    lastSuccessfulModels = models;
    console.log(`[opencode-local] Preloaded ${models.length} OpenCode models into cache.`);
  } catch (err) {
    console.warn("[opencode-local] Preload of OpenCode models failed (non-blocking):", err instanceof Error ? err.message : String(err));
  }
}

preloadPromise = preloadOpenCodeModels();

export function getPreloadPromise(): Promise<void> | null {
  return preloadPromise;
}

export function getLastSuccessfulModels(): AdapterModel[] | null {
  return lastSuccessfulModels;
}

export function setLastSuccessfulModels(models: AdapterModel[] | null): void {
  lastSuccessfulModels = models;
}

export async function listOpenCodeModels(): Promise<AdapterModel[]> {
  try {
    return await discoverOpenCodeModelsCached();
  } catch (err) {
    console.warn("[opencode-local] Failed to discover models via `opencode models`:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

export function resetOpenCodeModelsCacheForTests() {
  discoveryCache.clear();
}
