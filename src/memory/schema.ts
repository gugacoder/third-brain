import * as pg from "pg";

/**
 * Initialize the memory schema: pgvector extension, tables, and indexes.
 * @param pool - Postgres connection pool
 * @param dimensions - Embedding vector dimensions (default 1536)
 */
export async function initSchema(
  pool: pg.Pool,
  dimensions: number = 1536,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Enable pgvector extension
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");

    // meta: key/value store for provider metadata
    await client.query(`
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // files: tracked markdown files
    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        path  TEXT PRIMARY KEY,
        hash  TEXT NOT NULL,
        mtime BIGINT NOT NULL,
        size  BIGINT NOT NULL
      )
    `);

    // chunks: content chunks with embedding and FTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id         TEXT PRIMARY KEY,
        path       TEXT NOT NULL REFERENCES files(path) ON DELETE CASCADE,
        source     TEXT NOT NULL DEFAULT 'memory',
        start_line INTEGER NOT NULL,
        end_line   INTEGER NOT NULL,
        hash       TEXT NOT NULL,
        model      TEXT NOT NULL,
        text       TEXT NOT NULL,
        embedding  vector(${dimensions}),
        tsv        tsvector,
        updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
      )
    `);

    // Trigger to auto-update tsvector on insert/update
    await client.query(`
      CREATE OR REPLACE FUNCTION chunks_tsv_trigger() RETURNS trigger AS $$
      BEGIN
        NEW.tsv := to_tsvector('english', NEW.text);
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trg_chunks_tsv'
        ) THEN
          CREATE TRIGGER trg_chunks_tsv
            BEFORE INSERT OR UPDATE OF text ON chunks
            FOR EACH ROW EXECUTE FUNCTION chunks_tsv_trigger();
        END IF;
      END $$
    `);

    // HNSW index for fast approximate nearest neighbor search
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding
        ON chunks USING hnsw (embedding vector_cosine_ops)
    `);

    // GIN index for full-text search
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_tsv
        ON chunks USING gin (tsv)
    `);

    // Index on path for fast file-based lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_path
        ON chunks (path)
    `);

    // embedding_cache: cache embeddings to avoid redundant provider calls
    await client.query(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        provider   TEXT NOT NULL,
        model      TEXT NOT NULL,
        hash       TEXT NOT NULL,
        embedding  vector(${dimensions}),
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
        PRIMARY KEY (provider, model, hash)
      )
    `);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Drop all memory tables. Used for full reindex.
 * @param pool - Postgres connection pool
 */
export async function dropSchema(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DROP TABLE IF EXISTS embedding_cache CASCADE");
    await client.query("DROP TABLE IF EXISTS chunks CASCADE");
    await client.query("DROP TABLE IF EXISTS files CASCADE");
    await client.query("DROP TABLE IF EXISTS meta CASCADE");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
