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
      lastError = new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
      if (i < attempts - 1) {
        const delay = Math.min(baseMs * Math.pow(2, i), maxMs);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    } else {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
    }
  }
  throw lastError;
}

export function createOpenAIProvider(apiKey?: string): EmbeddingProvider {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OpenAI API key is required. Set OPENAI_API_KEY env variable or pass it to createOpenAIProvider().",
    );
  }

  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = "text-embedding-3-small";
  const dimensions = 1536;

  async function callEmbeddings(input: string | string[]): Promise<number[][]> {
    const res = await retryFetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, input }),
    });

    const json = (await res.json()) as {
      data: { embedding: number[]; index: number }[];
    };

    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => normalize(d.embedding));
  }

  return {
    id: "openai",
    model,
    dimensions,
    async embedQuery(text: string): Promise<number[]> {
      const [vec] = await callEmbeddings(text);
      return vec;
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return callEmbeddings(texts);
    },
  };
}
