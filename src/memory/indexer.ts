import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as pg from "pg";
import { chunkMarkdown, hashText } from "./chunking.js";
import type { EmbeddingProvider } from "./embeddings/types.js";
import { loadCachedEmbeddings, storeEmbeddings, evictCache } from "./cache.js";
import type { SyncProgressUpdate } from "./types.js";

type FileEntry = {
  absPath: string;
  relPath: string;
  hash: string;
  mtime: number;
  size: number;
};

/**
 * List all memory markdown files in the workspace.
 * Looks for MEMORY.md (or memory.md) and memory/*.md
 */
export async function listMemoryFiles(workspaceDir: string): Promise<string[]> {
  const files: string[] = [];

  // Check MEMORY.md and memory.md
  for (const name of ["MEMORY.md", "memory.md"]) {
    const p = path.join(workspaceDir, name);
    try {
      await fs.access(p);
      files.push(p);
    } catch {
      // File doesn't exist, skip
    }
  }

  // Check memory/ directory
  const memDir = path.join(workspaceDir, "memory");
  try {
    const entries = await fs.readdir(memDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path.join(memDir, entry.name));
      }
    }
  } catch {
    // Directory doesn't exist, skip
  }

  return files;
}

/**
 * Build a file entry with hash and stats.
 */
async function buildFileEntry(absPath: string, workspaceDir: string): Promise<FileEntry> {
  const content = await fs.readFile(absPath, "utf-8");
  const stat = await fs.stat(absPath);
  const relPath = path.relative(workspaceDir, absPath).replace(/\\/g, "/");
  return {
    absPath,
    relPath,
    hash: hashText(content),
    mtime: Math.floor(stat.mtimeMs),
    size: stat.size,
  };
}

/**
 * Index a single file: chunk, embed (with cache), upsert into Postgres.
 */
async function indexFile(
  pool: pg.Pool,
  entry: FileEntry,
  provider: EmbeddingProvider,
  chunking: { tokens: number; overlap: number },
  cacheEnabled: boolean,
): Promise<number> {
  const content = await fs.readFile(entry.absPath, "utf-8");
  const chunks = chunkMarkdown(content, chunking);

  if (chunks.length === 0) return 0;

  // Load cache hits
  const hashes = chunks.map((c) => c.hash);
  const cached = cacheEnabled
    ? await loadCachedEmbeddings(pool, provider.id, provider.model, hashes)
    : new Map<string, number[]>();

  // Compute missing embeddings
  const uncached = chunks.filter((c) => !cached.has(c.hash));
  if (uncached.length > 0) {
    const texts = uncached.map((c) => c.text);
    const embeddings = await provider.embedBatch(texts);

    const newEntries: Array<{ hash: string; embedding: number[] }> = [];
    for (let i = 0; i < uncached.length; i++) {
      cached.set(uncached[i].hash, embeddings[i]);
      newEntries.push({ hash: uncached[i].hash, embedding: embeddings[i] });
    }

    // Store new embeddings in cache
    if (cacheEnabled && newEntries.length > 0) {
      await storeEmbeddings(pool, provider.id, provider.model, newEntries);
    }
  }

  // Upsert file record
  await pool.query(
    `INSERT INTO files (path, hash, mtime, size)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (path) DO UPDATE SET
       hash = EXCLUDED.hash,
       mtime = EXCLUDED.mtime,
       size = EXCLUDED.size`,
    [entry.relPath, entry.hash, entry.mtime, entry.size],
  );

  // Delete old chunks for this file
  await pool.query("DELETE FROM chunks WHERE path = $1", [entry.relPath]);

  // Insert new chunks
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = cached.get(chunk.hash);
      const id = `${entry.relPath}:${chunk.startLine}-${chunk.endLine}`;
      const vecStr = embedding ? `[${embedding.join(",")}]` : null;

      await client.query(
        `INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)
         ON CONFLICT (id) DO UPDATE SET
           hash = EXCLUDED.hash,
           model = EXCLUDED.model,
           text = EXCLUDED.text,
           embedding = EXCLUDED.embedding,
           updated_at = EXCLUDED.updated_at`,
        [
          id,
          entry.relPath,
          "memory",
          chunk.startLine,
          chunk.endLine,
          chunk.hash,
          provider.model,
          chunk.text,
          vecStr,
          Date.now(),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return chunks.length;
}

/**
 * Sync all memory files: index changed files, remove stale entries.
 */
export async function syncMemoryFiles(
  pool: pg.Pool,
  workspaceDir: string,
  provider: EmbeddingProvider,
  options: {
    force?: boolean;
    chunking: { tokens: number; overlap: number };
    cacheEnabled: boolean;
    maxCacheEntries: number;
    progress?: (update: SyncProgressUpdate) => void;
  },
): Promise<{ indexed: number; removed: number; chunks: number }> {
  const files = await listMemoryFiles(workspaceDir);
  const entries = await Promise.all(
    files.map((f) => buildFileEntry(f, workspaceDir)),
  );

  const activePaths = new Set(entries.map((e) => e.relPath));
  let indexed = 0;
  let totalChunks = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Check if file changed
    if (!options.force) {
      const { rows } = await pool.query(
        "SELECT hash FROM files WHERE path = $1",
        [entry.relPath],
      );
      if (rows.length > 0 && (rows[0] as any).hash === entry.hash) {
        options.progress?.({ completed: i + 1, total: entries.length, label: `skip ${entry.relPath}` });
        continue; // File unchanged
      }
    }

    const chunks = await indexFile(pool, entry, provider, options.chunking, options.cacheEnabled);
    totalChunks += chunks;
    indexed++;
    options.progress?.({ completed: i + 1, total: entries.length, label: `indexed ${entry.relPath} (${chunks} chunks)` });
  }

  // Remove stale files and their chunks
  const { rows: dbFiles } = await pool.query("SELECT path FROM files");
  let removed = 0;
  for (const row of dbFiles as any[]) {
    if (!activePaths.has(row.path)) {
      await pool.query("DELETE FROM files WHERE path = $1", [row.path]);
      // chunks are cascade-deleted via FK
      removed++;
    }
  }

  // Evict old cache entries
  if (options.cacheEnabled) {
    await evictCache(pool, options.maxCacheEntries);
  }

  return { indexed, removed, chunks: totalChunks };
}
