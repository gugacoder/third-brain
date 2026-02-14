import { describe, it, expect, beforeEach } from "vitest";
import { AdapterRegistry } from "../registry.js";
import type { OutboundAdapter } from "../../heartbeat/adapters/types.js";
import type { EmbeddingProvider } from "../../memory/embeddings/types.js";
import type { Plugin } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────

function fakeOutbound(id: string): OutboundAdapter {
  return {
    id,
    async sendText() {
      return true;
    },
  };
}

function fakeEmbedding(id: string): EmbeddingProvider {
  return {
    id,
    model: `${id}-model`,
    dimensions: 128,
    async embedQuery() {
      return new Array(128).fill(0);
    },
    async embedBatch(texts: string[]) {
      return texts.map(() => new Array(128).fill(0));
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  // ── Registration & Resolution ──────────────────────────────

  describe("outbound adapters", () => {
    it("registers and resolves an outbound adapter", () => {
      registry.registerOutbound("test", () => fakeOutbound("test"));
      const adapter = registry.resolveOutbound("test");
      expect(adapter.id).toBe("test");
    });

    it("throws on unknown outbound adapter", () => {
      expect(() => registry.resolveOutbound("nope")).toThrow(
        /Unknown outbound adapter: "nope"/,
      );
    });

    it("shows available adapters in error message", () => {
      registry.registerOutbound("a", () => fakeOutbound("a"));
      registry.registerOutbound("b", () => fakeOutbound("b"));
      expect(() => registry.resolveOutbound("nope")).toThrow(/Available: \[a, b\]/);
    });

    it("caches resolved instances", () => {
      let callCount = 0;
      registry.registerOutbound("counted", () => {
        callCount++;
        return fakeOutbound("counted");
      });

      const first = registry.resolveOutbound("counted");
      const second = registry.resolveOutbound("counted");
      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });

    it("invalidates cache on re-registration", () => {
      registry.registerOutbound("x", () => fakeOutbound("x-v1"));
      const v1 = registry.resolveOutbound("x");
      expect(v1.id).toBe("x-v1");

      registry.registerOutbound("x", () => fakeOutbound("x-v2"));
      const v2 = registry.resolveOutbound("x");
      expect(v2.id).toBe("x-v2");
      expect(v2).not.toBe(v1);
    });

    it("lists registered outbound adapters", () => {
      registry.registerOutbound("a", () => fakeOutbound("a"));
      registry.registerOutbound("b", () => fakeOutbound("b"));
      expect(registry.listOutbound()).toEqual(["a", "b"]);
    });
  });

  // ── Embedding providers ────────────────────────────────────

  describe("embedding providers", () => {
    it("registers and resolves an embedding provider", () => {
      registry.registerEmbedding("test", () => fakeEmbedding("test"));
      const provider = registry.resolveEmbedding("test");
      expect(provider.id).toBe("test");
      expect(provider.dimensions).toBe(128);
    });

    it("throws on unknown embedding provider", () => {
      expect(() => registry.resolveEmbedding("nope")).toThrow(
        /Unknown embedding provider: "nope"/,
      );
    });

    it("caches resolved instances", () => {
      let callCount = 0;
      registry.registerEmbedding("counted", () => {
        callCount++;
        return fakeEmbedding("counted");
      });

      const first = registry.resolveEmbedding("counted");
      const second = registry.resolveEmbedding("counted");
      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });

    it("lists registered embedding providers", () => {
      registry.registerEmbedding("openai", () => fakeEmbedding("openai"));
      registry.registerEmbedding("ollama", () => fakeEmbedding("ollama"));
      expect(registry.listEmbedding()).toEqual(["openai", "ollama"]);
    });
  });

  // ── Plugin support ─────────────────────────────────────────

  describe("plugins", () => {
    it("registers adapters via plugin.register(api)", () => {
      const plugin: Plugin = {
        id: "my-plugin",
        register(api) {
          api.registerOutbound("p-out", () => fakeOutbound("p-out"));
          api.registerEmbedding("p-emb", () => fakeEmbedding("p-emb"));
        },
      };

      registry.use(plugin);

      expect(registry.resolveOutbound("p-out").id).toBe("p-out");
      expect(registry.resolveEmbedding("p-emb").id).toBe("p-emb");
    });

    it("tracks registered plugins", () => {
      registry.use({ id: "alpha", register() {} });
      registry.use({ id: "beta", register() {} });
      expect(registry.listPlugins()).toEqual(["alpha", "beta"]);
    });

    it("plugin can override a built-in adapter", () => {
      registry.registerOutbound("console", () => fakeOutbound("console-v1"));
      const first = registry.resolveOutbound("console");
      expect(first.id).toBe("console-v1");

      registry.use({
        id: "override",
        register(api) {
          api.registerOutbound("console", () => fakeOutbound("console-v2"));
        },
      });

      const second = registry.resolveOutbound("console");
      expect(second.id).toBe("console-v2");
    });
  });

  // ── Edge cases ─────────────────────────────────────────────

  describe("edge cases", () => {
    it("empty registry lists return empty arrays", () => {
      expect(registry.listOutbound()).toEqual([]);
      expect(registry.listEmbedding()).toEqual([]);
      expect(registry.listPlugins()).toEqual([]);
    });

    it("factory error propagates on resolve", () => {
      registry.registerOutbound("broken", () => {
        throw new Error("factory boom");
      });
      expect(() => registry.resolveOutbound("broken")).toThrow("factory boom");
    });
  });
});
