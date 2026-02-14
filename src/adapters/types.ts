import type { OutboundAdapter } from "../heartbeat/adapters/types.js";
import type { EmbeddingProvider } from "../memory/embeddings/types.js";

/** Maps each adapter kind to its contract. */
export type AdapterMap = {
  outbound: OutboundAdapter;
  embedding: EmbeddingProvider;
};

export type AdapterKind = keyof AdapterMap;

/** Factory that lazily creates an adapter instance. */
export type AdapterFactory<T> = () => T;

/**
 * Plugin: a self-contained bundle that registers one or more adapters.
 *
 * Example:
 * ```ts
 * const telegramPlugin: Plugin = {
 *   id: "telegram",
 *   register(api) {
 *     api.registerOutbound("telegram", () => new TelegramAdapter(token));
 *   },
 * };
 * registry.use(telegramPlugin);
 * ```
 */
export type Plugin = {
  id: string;
  name?: string;
  register(api: PluginApi): void;
};

/** API surface exposed to plugins during registration. */
export type PluginApi = {
  registerOutbound(id: string, factory: AdapterFactory<OutboundAdapter>): void;
  registerEmbedding(id: string, factory: AdapterFactory<EmbeddingProvider>): void;
};
