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

async function retryFetch(
  url: string,
  init: RequestInit,
  attempts = 3,
  baseMs = 500,
  maxMs = 8000,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`Gemini API error ${res.status}: ${await res.text()}`);
      if (i < attempts - 1) {
        const delay = Math.min(baseMs * Math.pow(2, i), maxMs);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    } else {
      throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    }
  }
  throw lastError;
}

export function createGeminiProvider(apiKey?: string): EmbeddingProvider {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "Gemini API key is required. Set GEMINI_API_KEY env variable or pass it to createGeminiProvider().",
    );
  }

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  const model = "gemini-embedding-001";
  const dimensions = 768;

  return {
    id: "gemini",
    model,
    dimensions,
    async embedQuery(text: string): Promise<number[]> {
      const res = await retryFetch(
        `${baseUrl}/models/${model}:embedContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text }] },
            taskType: "RETRIEVAL_QUERY",
          }),
        },
      );

      const json = (await res.json()) as {
        embedding: { values: number[] };
      };
      return normalize(json.embedding.values);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      const requests = texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
      }));

      const res = await retryFetch(
        `${baseUrl}/models/${model}:batchEmbedContents?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        },
      );

      const json = (await res.json()) as {
        embeddings: { values: number[] }[];
      };
      return json.embeddings.map((e) => normalize(e.values));
    },
  };
}
