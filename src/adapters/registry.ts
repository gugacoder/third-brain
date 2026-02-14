import type { AdapterFactory, Plugin, PluginApi } from "./types.js";
import type { OutboundAdapter } from "../heartbeat/adapters/types.js";
import type { EmbeddingProvider } from "../memory/embeddings/types.js";

export class AdapterRegistry {
  private factories = {
    outbound: new Map<string, AdapterFactory<OutboundAdapter>>(),
    embedding: new Map<string, AdapterFactory<EmbeddingProvider>>(),
  };

  private instances = {
    outbound: new Map<string, OutboundAdapter>(),
    embedding: new Map<string, EmbeddingProvider>(),
  };

  private plugins: Plugin[] = [];

  // ── Registration ────────────────────────────────────────────

  registerOutbound(id: string, factory: AdapterFactory<OutboundAdapter>): void {
    this.factories.outbound.set(id, factory);
    this.instances.outbound.delete(id);
  }

  registerEmbedding(id: string, factory: AdapterFactory<EmbeddingProvider>): void {
    this.factories.embedding.set(id, factory);
    this.instances.embedding.delete(id);
  }

  // ── Resolution (lazy, cached) ──────────────────────────────

  resolveOutbound(id: string): OutboundAdapter {
    let instance = this.instances.outbound.get(id);
    if (instance) return instance;

    const factory = this.factories.outbound.get(id);
    if (!factory) {
      throw new Error(
        `Unknown outbound adapter: "${id}". Available: [${this.listOutbound().join(", ")}]`,
      );
    }

    instance = factory();
    this.instances.outbound.set(id, instance);
    return instance;
  }

  resolveEmbedding(id: string): EmbeddingProvider {
    let instance = this.instances.embedding.get(id);
    if (instance) return instance;

    const factory = this.factories.embedding.get(id);
    if (!factory) {
      throw new Error(
        `Unknown embedding provider: "${id}". Available: [${this.listEmbedding().join(", ")}]`,
      );
    }

    instance = factory();
    this.instances.embedding.set(id, instance);
    return instance;
  }

  // ── Listing ─────────────────────────────────────────────────

  listOutbound(): string[] {
    return [...this.factories.outbound.keys()];
  }

  listEmbedding(): string[] {
    return [...this.factories.embedding.keys()];
  }

  // ── Plugin support ──────────────────────────────────────────

  use(plugin: Plugin): void {
    const api: PluginApi = {
      registerOutbound: (id, factory) => this.registerOutbound(id, factory),
      registerEmbedding: (id, factory) => this.registerEmbedding(id, factory),
    };
    plugin.register(api);
    this.plugins.push(plugin);
  }

  listPlugins(): string[] {
    return this.plugins.map((p) => p.id);
  }
}
