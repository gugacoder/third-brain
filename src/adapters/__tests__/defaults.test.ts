import { describe, it, expect, beforeEach } from "vitest";
import { AdapterRegistry } from "../registry.js";
import { registerDefaults } from "../defaults.js";

describe("registerDefaults", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
    registerDefaults(registry);
  });

  it("registers the console outbound adapter", () => {
    expect(registry.listOutbound()).toContain("console");
  });

  it("registers all three embedding providers", () => {
    const list = registry.listEmbedding();
    expect(list).toContain("openai");
    expect(list).toContain("ollama");
    expect(list).toContain("gemini");
  });

  it("resolves the console adapter", () => {
    const adapter = registry.resolveOutbound("console");
    expect(adapter.id).toBe("console");
    expect(typeof adapter.sendText).toBe("function");
  });

  // Embedding providers need API keys / network, so we only verify
  // that the factories are registered (not that they resolve).
  // resolveEmbedding("openai") would throw "OPENAI_API_KEY required"
  // unless the env var is set — that's correct behavior.
  it("embedding factory throws helpful error when key is missing", () => {
    // Only test providers that require keys (skip ollama — it's local)
    const originalOpenAI = process.env.OPENAI_API_KEY;
    const originalGemini = process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      expect(() => registry.resolveEmbedding("openai")).toThrow(/API key/i);
      expect(() => registry.resolveEmbedding("gemini")).toThrow(/API key/i);
    } finally {
      if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
      if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
    }
  });
});
