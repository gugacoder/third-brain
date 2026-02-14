import type { AdapterRegistry } from "./registry.js";
import { ConsoleAdapter } from "../heartbeat/adapters/console.js";
import { createOpenAIProvider } from "../memory/embeddings/openai.js";
import { createOllamaProvider } from "../memory/embeddings/ollama.js";
import { createGeminiProvider } from "../memory/embeddings/gemini.js";

/** Registers all built-in adapters into the given registry. */
export function registerDefaults(registry: AdapterRegistry): void {
  // Outbound adapters
  registry.registerOutbound("console", () => new ConsoleAdapter());

  // Embedding providers
  registry.registerEmbedding("openai", () => createOpenAIProvider());
  registry.registerEmbedding("ollama", () => createOllamaProvider());
  registry.registerEmbedding("gemini", () => createGeminiProvider());
}
