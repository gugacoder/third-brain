import type { EmbeddingProvider } from "./types.js";

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  const out = new Array<number>(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export function createOllamaProvider(
  baseUrl?: string,
  model?: string,
): EmbeddingProvider {
  const url = baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const modelName = model || "nomic-embed-text";
  const dimensions = 768;

  async function callEmbed(input: string | string[]): Promise<number[][]> {
    const res = await fetch(`${url}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, input }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { embeddings: number[][] };
    return json.embeddings.map((vec) => normalize(vec));
  }

  return {
    id: "ollama",
    model: modelName,
    dimensions,
    async embedQuery(text: string): Promise<number[]> {
      const vecs = await callEmbed(text);
      return vecs[0];
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return callEmbed(texts);
    },
  };
}
