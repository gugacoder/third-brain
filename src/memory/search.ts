import * as pg from "pg";
import type { MemorySearchResult, HybridConfig } from "./types.js";

type VectorResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  source: string;
  vectorScore: number;
};

type KeywordResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  source: string;
  textScore: number;
};

/**
 * Vector search using pgvector cosine distance.
 * Uses the <=> operator (cosine distance). Score = 1 - distance.
 */
export async function searchVector(
  pool: pg.Pool,
  queryVec: number[],
  limit: number,
): Promise<VectorResult[]> {
  // Convert vector to pgvector format string: "[0.1,0.2,...]"
  const vecStr = `[${queryVec.join(",")}]`;

  const { rows } = await pool.query(
    `SELECT id, path, start_line, end_line, text, source,
            1 - (embedding <=> $1::vector) AS score
     FROM chunks
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vecStr, limit],
  );

  return rows.map((r: any) => ({
    id: r.id,
    path: r.path,
    startLine: r.start_line,
    endLine: r.end_line,
    snippet: r.text.slice(0, 500),
    source: r.source,
    vectorScore: parseFloat(r.score),
  }));
}

/**
 * Full-text search using Postgres tsvector/tsquery.
 * Uses ts_rank for scoring and plainto_tsquery for query parsing.
 */
export async function searchKeyword(
  pool: pg.Pool,
  query: string,
  limit: number,
): Promise<KeywordResult[]> {
  // Use plainto_tsquery which handles natural language input
  const { rows } = await pool.query(
    `SELECT id, path, start_line, end_line, text, source,
            ts_rank(tsv, plainto_tsquery('english', $1)) AS rank
     FROM chunks
     WHERE tsv @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT $2`,
    [query, limit],
  );

  return rows.map((r: any) => ({
    id: r.id,
    path: r.path,
    startLine: r.start_line,
    endLine: r.end_line,
    snippet: r.text.slice(0, 500),
    source: r.source,
    textScore: parseFloat(r.rank),
  }));
}

/**
 * Merge vector and keyword results with weighted scoring.
 * Same algorithm as OpenClaw: byId map, combine scores, sort.
 */
export function mergeHybridResults(
  vector: VectorResult[],
  keyword: KeywordResult[],
  config: HybridConfig,
): MemorySearchResult[] {
  const byId = new Map<string, {
    id: string;
    path: string;
    startLine: number;
    endLine: number;
    snippet: string;
    source: string;
    vectorScore: number;
    textScore: number;
  }>();

  for (const r of vector) {
    byId.set(r.id, { ...r, textScore: 0 });
  }

  for (const r of keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        snippet: r.snippet,
        source: r.source,
        vectorScore: 0,
        textScore: r.textScore,
      });
    }
  }

  return Array.from(byId.values())
    .map((entry) => ({
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score: config.vectorWeight * entry.vectorScore + config.textWeight * entry.textScore,
      snippet: entry.snippet,
      source: entry.source as "memory",
      citation: `${entry.path}#L${entry.startLine}-L${entry.endLine}`,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Run hybrid search: vector + keyword, merged with weights.
 */
export async function hybridSearch(
  pool: pg.Pool,
  query: string,
  queryVec: number[],
  config: HybridConfig,
  maxResults: number,
  minScore: number,
): Promise<MemorySearchResult[]> {
  const candidates = Math.max(1, Math.floor(maxResults * config.candidateMultiplier));

  const [vectorResults, keywordResults] = await Promise.all([
    queryVec.some((v) => v !== 0)
      ? searchVector(pool, queryVec, candidates)
      : Promise.resolve([]),
    searchKeyword(pool, query, candidates).catch(() => []),
  ]);

  const merged = mergeHybridResults(vectorResults, keywordResults, config);
  return merged.filter((r) => r.score >= minScore).slice(0, maxResults);
}
