import * as pg from "pg";

/**
 * Load cached embeddings for a set of chunk hashes.
 * Returns a Map from hash to embedding vector.
 */
export async function loadCachedEmbeddings(
  pool: pg.Pool,
  provider: string,
  model: string,
  hashes: string[],
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (hashes.length === 0) return result;

  // Query in batches of 500 to avoid parameter limit
  const batchSize = 500;
  for (let i = 0; i < hashes.length; i += batchSize) {
    const batch = hashes.slice(i, i + batchSize);
    const placeholders = batch.map((_, idx) => `$${idx + 3}`).join(", ");

    const { rows } = await pool.query(
      `SELECT hash, embedding::text
       FROM embedding_cache
       WHERE provider = $1 AND model = $2 AND hash IN (${placeholders})`,
      [provider, model, ...batch],
    );

    for (const row of rows as any[]) {
      // pgvector returns embedding as string "[0.1,0.2,...]"
      const vec = parseVectorString(row.embedding);
      if (vec) result.set(row.hash, vec);
    }
  }

  return result;
}

/**
 * Store embeddings in cache. Uses upsert (ON CONFLICT DO UPDATE).
 */
export async function storeEmbeddings(
  pool: pg.Pool,
  provider: string,
  model: string,
  entries: Array<{ hash: string; embedding: number[] }>,
): Promise<void> {
  if (entries.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const entry of entries) {
      const vecStr = `[${entry.embedding.join(",")}]`;
      await client.query(
        `INSERT INTO embedding_cache (provider, model, hash, embedding, created_at)
         VALUES ($1, $2, $3, $4::vector, $5)
         ON CONFLICT (provider, model, hash) DO UPDATE SET
           embedding = EXCLUDED.embedding,
           created_at = EXCLUDED.created_at`,
        [provider, model, entry.hash, vecStr, Date.now()],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Evict oldest entries if cache exceeds maxEntries.
 */
export async function evictCache(
  pool: pg.Pool,
  maxEntries: number,
): Promise<number> {
  const countResult = await pool.query("SELECT COUNT(*) AS cnt FROM embedding_cache");
  const count = parseInt((countResult.rows[0] as any).cnt, 10);

  if (count <= maxEntries) return 0;

  const toEvict = count - maxEntries;
  await pool.query(
    `DELETE FROM embedding_cache
     WHERE (provider, model, hash) IN (
       SELECT provider, model, hash
       FROM embedding_cache
       ORDER BY created_at ASC
       LIMIT $1
     )`,
    [toEvict],
  );

  return toEvict;
}

/**
 * Parse pgvector string format "[0.1,0.2,...]" to number[].
 */
function parseVectorString(str: string): number[] | null {
  if (!str || !str.startsWith("[")) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
