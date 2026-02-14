import * as pg from "pg";
import { initSchema } from "./schema.js";
import { resolveProvider } from "./embeddings/index.js";
import { syncMemoryFiles } from "./indexer.js";
import { hybridSearch } from "./search.js";
import { MemoryWatcher } from "./watcher.js";
import type {
  MemoryConfig,
  MemorySearchResult,
  MemoryProviderStatus,
  MemorySearchManager,
  SearchOptions,
  SyncProgressUpdate,
  EmbeddingProvider,
} from "./types.js";

export class MemoryManager implements MemorySearchManager {
  private pool: pg.Pool;
  private provider: EmbeddingProvider;
  private config: MemoryConfig;
  private watcher: MemoryWatcher | null = null;
  private dirty = true;
  private syncing = false;
  private initialized = false;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.pool = new pg.Pool({ connectionString: config.databaseUrl });
    this.provider = resolveProvider(config.embeddingProvider);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await initSchema(this.pool, this.provider.dimensions);
    this.initialized = true;

    if (this.config.sync.watch) {
      this.watcher = new MemoryWatcher({
        workspaceDir: this.config.workspaceDir,
        debounceMs: this.config.sync.watchDebounceMs,
        onDirty: () => {
          this.dirty = true;
        },
      });
      this.watcher.start();
    }
  }

  async search(query: string, opts?: SearchOptions): Promise<MemorySearchResult[]> {
    await this.init();

    if (this.dirty) {
      await this.sync().catch((err) => {
        console.error("[memory] sync-on-search failed:", err);
      });
    }

    const cleaned = query.trim();
    if (!cleaned) return [];

    const maxResults = opts?.maxResults ?? this.config.search.maxResults;
    const minScore = opts?.minScore ?? this.config.search.minScore;

    const queryVec = await this.provider.embedQuery(cleaned);

    return hybridSearch(
      this.pool,
      cleaned,
      queryVec,
      this.config.hybrid,
      maxResults,
      minScore,
    );
  }

  async sync(params?: {
    force?: boolean;
    progress?: (update: SyncProgressUpdate) => void;
  }): Promise<void> {
    await this.init();

    if (this.syncing) return;
    this.syncing = true;

    try {
      const result = await syncMemoryFiles(
        this.pool,
        this.config.workspaceDir,
        this.provider,
        {
          force: params?.force,
          chunking: this.config.chunking,
          cacheEnabled: this.config.cache.enabled,
          maxCacheEntries: this.config.cache.maxEntries,
          progress: params?.progress,
        },
      );

      this.dirty = false;

      if (result.indexed > 0 || result.removed > 0) {
        console.log(
          `[memory] synced: ${result.indexed} files indexed, ${result.removed} removed, ${result.chunks} chunks`,
        );
      }
    } finally {
      this.syncing = false;
    }
  }

  async status(): Promise<MemoryProviderStatus> {
    await this.init();

    const filesResult = await this.pool.query("SELECT COUNT(*) AS cnt FROM files");
    const chunksResult = await this.pool.query("SELECT COUNT(*) AS cnt FROM chunks");
    const cacheResult = await this.pool.query("SELECT COUNT(*) AS cnt FROM embedding_cache");

    return {
      provider: this.provider.id,
      model: this.provider.model,
      files: parseInt((filesResult.rows[0] as any).cnt, 10),
      chunks: parseInt((chunksResult.rows[0] as any).cnt, 10),
      dirty: this.dirty,
      workspaceDir: this.config.workspaceDir,
      cache: {
        enabled: this.config.cache.enabled,
        entries: parseInt((cacheResult.rows[0] as any).cnt, 10),
      },
      fts: { enabled: true },
      vector: { enabled: true, dims: this.provider.dimensions },
    };
  }

  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    await this.pool.end();
    this.initialized = false;
  }
}
