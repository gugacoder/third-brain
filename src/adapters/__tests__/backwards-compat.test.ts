import { describe, it, expect } from "vitest";
import { resolveAdapter } from "../../heartbeat/adapters/index.js";
import { resolveProvider } from "../../memory/embeddings/index.js";

describe("backwards compatibility", () => {
  describe("resolveAdapter (heartbeat)", () => {
    it("defaults to console", () => {
      const adapter = resolveAdapter();
      expect(adapter.id).toBe("console");
    });

    it("resolves console explicitly", () => {
      const adapter = resolveAdapter("console");
      expect(adapter.id).toBe("console");
    });

    it("throws on unknown adapter", () => {
      expect(() => resolveAdapter("nonexistent")).toThrow(/Unknown outbound adapter/);
    });
  });

  describe("resolveProvider (memory)", () => {
    it("throws helpful error for openai without key", () => {
      const original = process.env.OPENAI_API_KEY;
      const originalProvider = process.env.EMBEDDING_PROVIDER;
      delete process.env.OPENAI_API_KEY;
      delete process.env.EMBEDDING_PROVIDER;

      try {
        expect(() => resolveProvider("openai")).toThrow(/API key/i);
      } finally {
        if (original) process.env.OPENAI_API_KEY = original;
        if (originalProvider) process.env.EMBEDDING_PROVIDER = originalProvider;
      }
    });

    it("throws on unknown provider", () => {
      expect(() => resolveProvider("nonexistent")).toThrow(/Unknown embedding provider/);
    });
  });
});
