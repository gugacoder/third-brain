import { AdapterRegistry } from "./registry.js";
import { registerDefaults } from "./defaults.js";
import type { OutboundAdapter } from "../heartbeat/adapters/types.js";
import type { EmbeddingProvider } from "../memory/embeddings/types.js";

export type { AdapterMap, AdapterKind, AdapterFactory, Plugin, PluginApi } from "./types.js";
export { AdapterRegistry } from "./registry.js";

// ── Singleton ─────────────────────────────────────────────────

let _registry: AdapterRegistry | null = null;

export function getRegistry(): AdapterRegistry {
  if (!_registry) {
    _registry = new AdapterRegistry();
    registerDefaults(_registry);
  }
  return _registry;
}

// ── Convenience ───────────────────────────────────────────────

export function resolveOutbound(id: string): OutboundAdapter {
  return getRegistry().resolveOutbound(id);
}

export function resolveEmbedding(id: string): EmbeddingProvider {
  return getRegistry().resolveEmbedding(id);
}
