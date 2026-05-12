import { afterEach, describe, expect, it } from "vitest";
import {
  ensureOpenCodeModelConfiguredAndAvailable,
  getLastSuccessfulModels,
  listOpenCodeModels,
  preloadOpenCodeModels,
  requireOpenCodeModelId,
  resetOpenCodeModelsCacheForTests,
  setLastSuccessfulModels,
} from "./models.js";

describe("openCode models", () => {
  afterEach(() => {
    delete process.env.PAPERCLIP_OPENCODE_COMMAND;
    resetOpenCodeModelsCacheForTests();
  });

  it("returns an empty list when discovery command is unavailable", async () => {
    process.env.PAPERCLIP_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";
    await expect(listOpenCodeModels()).resolves.toEqual([]);
  });

  it("rejects when model is missing", async () => {
    await expect(
      ensureOpenCodeModelConfiguredAndAvailable({ model: "" }),
    ).rejects.toThrow("OpenCode requires `adapterConfig.model`");
  });

  it("accepts a provider/model id without running discovery", () => {
    expect(requireOpenCodeModelId("openai/gpt-5.2-codex")).toBe("openai/gpt-5.2-codex");
  });

  it("rejects malformed provider/model ids before discovery", () => {
    expect(() => requireOpenCodeModelId("gpt-5.2-codex")).toThrow(
      "OpenCode requires `adapterConfig.model`",
    );
    expect(() => requireOpenCodeModelId("openai/")).toThrow(
      "OpenCode requires `adapterConfig.model`",
    );
  });

  it("rejects when discovery cannot run for configured model", async () => {
    process.env.PAPERCLIP_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";
    await expect(
      ensureOpenCodeModelConfiguredAndAvailable({
        model: "openai/gpt-5",
      }),
    ).rejects.toThrow("Failed to start command");
  }, 15_000);

  it("preloads models into cache at module load", async () => {
    const models = getLastSuccessfulModels();
    expect(models).not.toBeNull();
    expect(Array.isArray(models)).toBe(true);
    if (models) {
      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toContain("/");
    }
  });

  it("falls back to last successful models when discovery fails after a successful run", async () => {
    const previousModels = getLastSuccessfulModels();
    expect(previousModels).not.toBeNull();

    setLastSuccessfulModels([{ id: "openai/gpt-5", label: "openai/gpt-5" }]);

    process.env.PAPERCLIP_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";

    const models = await ensureOpenCodeModelConfiguredAndAvailable({
      model: "openai/gpt-5",
    });
    expect(models).toEqual([{ id: "openai/gpt-5", label: "openai/gpt-5" }]);
  }, 15_000);

  it("still throws when discovery fails and last successful models don't include configured model", async () => {
    setLastSuccessfulModels([{ id: "anthropic/claude-4", label: "anthropic/claude-4" }]);

    process.env.PAPERCLIP_OPENCODE_COMMAND = "__paperclip_missing_opencode_command__";

    await expect(
      ensureOpenCodeModelConfiguredAndAvailable({
        model: "openai/gpt-5",
      }),
    ).rejects.toThrow("Failed to start command");
  }, 15_000);
});
