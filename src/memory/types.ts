// Re-export canonical types from their source modules
export type { MemoryChunk } from "./chunking.js";
export type { EmbeddingProvider } from "./embeddings/types.js";

export type MemorySource = "memory";

// --- Search results ---
export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: MemorySource;
  citation?: string; // e.g. "memory/2026-02-13.md#L42-L58"
};

// --- Search options ---
export type SearchOptions = {
  maxResults?: number;
  minScore?: number;
};

export type HybridConfig = {
  vectorWeight: number; // default 0.7
  textWeight: number; // default 0.3
  candidateMultiplier: number; // default 4
};

// --- Sync progress ---
export type SyncProgressUpdate = {
  completed: number;
  total: number;
  label?: string;
};

// --- Provider status ---
export type MemoryProviderStatus = {
  provider: string;
  model?: string;
  files?: number;
  chunks?: number;
  dirty?: boolean;
  workspaceDir?: string;
  cache?: { enabled: boolean; entries?: number };
  fts?: { enabled: boolean };
  vector?: { enabled: boolean; dims?: number };
};

// --- File record (from DB) ---
export type FileRecord = {
  path: string;
  hash: string;
  mtime: number;
  size: number;
};

// --- Chunk record (from DB) ---
export type ChunkRecord = {
  id: string;
  path: string;
  source: MemorySource;
  startLine: number;
  endLine: number;
  hash: string;
  model: string;
  text: string;
  updatedAt: number;
};

// --- Manager interface ---
export interface MemorySearchManager {
  search(query: string, opts?: SearchOptions): Promise<MemorySearchResult[]>;
  sync(params?: {
    force?: boolean;
    progress?: (update: SyncProgressUpdate) => void;
  }): Promise<void>;
  status(): Promise<MemoryProviderStatus>;
  close(): Promise<void>;
}

// --- Config ---
export type MemoryConfig = {
  databaseUrl: string;
  workspaceDir: string;
  embeddingProvider: string; // "openai" | "ollama" | "gemini"
  chunking: { tokens: number; overlap: number };
  hybrid: HybridConfig;
  search: { maxResults: number; minScore: number };
  cache: { enabled: boolean; maxEntries: number };
  sync: { watch: boolean; watchDebounceMs: number };
};

export const DEFAULT_CONFIG: Omit<
  MemoryConfig,
  "databaseUrl" | "workspaceDir" | "embeddingProvider"
> = {
  chunking: { tokens: 400, overlap: 80 },
  hybrid: { vectorWeight: 0.7, textWeight: 0.3, candidateMultiplier: 4 },
  search: { maxResults: 6, minScore: 0.35 },
  cache: { enabled: true, maxEntries: 50000 },
  sync: { watch: true, watchDebounceMs: 1500 },
};
