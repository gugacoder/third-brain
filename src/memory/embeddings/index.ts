import type { EmbeddingProvider } from "./types.js";
import { getRegistry } from "../../adapters/index.js";

export type { EmbeddingProvider } from "./types.js";

export function resolveProvider(provider?: string): EmbeddingProvider {
  const name = provider || process.env.EMBEDDING_PROVIDER || "openai";
  return getRegistry().resolveEmbedding(name);
}
