# OpenClaw Memory System

## Overview

The OpenClaw memory system is a **semantic search and retrieval system** for persistent agent memory stored as plain Markdown files. It enables agents to remember information across conversations and sessions using hybrid search (vector similarity + BM25 keyword matching).

**Key purposes:**

- **Persistent context** - remembers information across conversations and sessions
- **Semantic recall** - finds relevant memories via vector embeddings even when exact wording differs
- **Hybrid search** - combines vector similarity with BM25 keyword matching for robust retrieval
- **Pre-compaction flush** - automatically prompts the agent to save important context before sessions are compacted
- **Multi-source indexing** - indexes both workspace memory files and session transcripts

---

## Storage Architecture

### File-Based Source of Truth

Memory lives as plain Markdown files:

| Path | Purpose |
|------|---------|
| `MEMORY.md` / `memory.md` | Curated long-term memory (workspace root) |
| `memory/YYYY-MM-DD.md` | Daily append-only logs |
| Extra paths via `memorySearch.extraPaths` | Optional additional directories |
| `~/.openclaw/agents/<agentId>/sessions/*.jsonl` | Optional session transcript indexing |

### SQLite Index Database

Location: `~/.openclaw/memory/<agentId>.sqlite`

Schema (defined in `src/memory/memory-schema.ts`):

| Table | Purpose |
|-------|---------|
| `meta` | Index metadata (model, provider, chunking params, vector dims) |
| `files` | Tracked files with hash, mtime, size, source |
| `chunks` | Markdown chunks with embeddings, line ranges, text |
| `chunks_vec` | sqlite-vec virtual table for vector search acceleration |
| `chunks_fts` | FTS5 virtual table for BM25 full-text search |
| `embedding_cache` | Caches embeddings by provider/model/hash to avoid re-embedding |

---

## Indexing Pipeline

### Chunking (`src/memory/internal.ts`)

- Splits Markdown into ~400 token chunks with 80 token overlap (configurable)
- Chunks are hashed for change detection
- Line numbers are preserved for precise retrieval

### Embedding Providers (`src/memory/embeddings.ts`)

| Provider | Default Model |
|----------|---------------|
| **OpenAI** | `text-embedding-3-small` (default) |
| **Gemini** | `gemini-embedding-001` |
| **Voyage** | `voyage-4-large` |
| **Local** | node-llama-cpp with GGUF models (e.g., `embeddinggemma-300M`) |

Supports fallback chains (e.g., local -> OpenAI).

### Batch Processing (`src/memory/manager.ts`)

- OpenAI/Gemini/Voyage support async batch APIs for large-scale indexing
- Batches max out at ~8000 tokens per request
- Embedding cache reduces redundant API calls
- Batch failures trigger automatic fallback to synchronous mode

### Sync Triggers (`src/memory/manager.ts`)

| Trigger | When |
|---------|------|
| **File watcher** (chokidar) | Monitors `MEMORY.md` and `memory/` directory |
| **Session start** | Warm sync on new sessions |
| **Search time** | Lazy sync if index is dirty |
| **Interval** | Optional periodic sync |
| **Session deltas** | Indexes session transcripts when they cross byte/message thresholds |

---

## Search

### Hybrid Search (`src/memory/hybrid.ts`, `src/memory/manager-search.ts`)

Search combines two strategies:

1. **Vector similarity** - cosine similarity between query embedding and chunk embeddings
2. **BM25 keyword matching** - full-text search via SQLite FTS5

Default weights: `vectorWeight: 0.7`, `textWeight: 0.3`.

Results are merged with a candidate multiplier (4x) and filtered by `minScore: 0.35`.

### Search Result Shape (`src/memory/types.ts`)

```typescript
type MemorySearchResult = {
  path: string
  startLine: number
  endLine: number
  score: number
  snippet: string
  source: "memory" | "sessions"
  citation?: string  // e.g., "memory/2026-02-13.md#L42-L58"
}
```

---

## Key Classes and Files

### Core Classes

| Class | File | Description |
|-------|------|-------------|
| `MemoryIndexManager` | `src/memory/manager.ts` (~2300 lines) | Main manager: indexing, search, vector acceleration, caching. Singleton pattern keyed by `agentId:workspaceDir:config`. |
| `FallbackMemoryManager` | `src/memory/search-manager.ts` | Wrapper for QMD backend with automatic fallback to builtin SQLite |
| `QmdMemoryManager` | `src/memory/qmd-manager.ts` | Alternative backend using QMD sidecar (BM25 + vectors + reranking) |

### Key Interface

```typescript
interface MemorySearchManager {
  search(query, opts): Promise<MemorySearchResult[]>
  readFile(params): Promise<{text, path}>
  status(): MemoryProviderStatus
  sync?(params): Promise<void>
  probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult>
  probeVectorAvailability(): Promise<boolean>
  close?(): Promise<void>
}
```

### File Map

| File | Purpose |
|------|---------|
| `src/memory/manager.ts` | Core indexing and search logic |
| `src/memory/search-manager.ts` | Backend selection and fallback |
| `src/memory/types.ts` | Type definitions |
| `src/memory/memory-schema.ts` | SQLite schema creation |
| `src/memory/internal.ts` | File scanning, chunking, hashing utilities |
| `src/memory/hybrid.ts` | Hybrid search result merging |
| `src/memory/manager-search.ts` | Vector and keyword search implementations |
| `src/memory/embeddings.ts` | Embedding provider abstraction |
| `src/memory/batch-openai.ts` | OpenAI batch API client |
| `src/memory/batch-gemini.ts` | Gemini batch API client |
| `src/memory/batch-voyage.ts` | Voyage batch API client |
| `src/memory/sqlite-vec.ts` | sqlite-vec extension loading |
| `src/agents/tools/memory-tool.ts` | Agent tools: `memory_search`, `memory_get` |
| `src/cli/memory-cli.ts` | CLI commands: `openclaw memory status/index/search` |
| `src/auto-reply/reply/memory-flush.ts` | Pre-compaction memory flush logic |

---

## Integration with Agent Runtime

### Tool Exposure (`src/agents/tools/memory-tool.ts`)

Two tools are exposed to agents:

- **`memory_search`** - semantic search with mandatory recall prompt
- **`memory_get`** - safe snippet reading from memory files with line ranges

Tools are only enabled when memory search is configured for the agent. Citations mode controls whether source paths are included in snippets.

### Pre-Compaction Memory Flush (`src/auto-reply/reply/agent-runner-memory.ts`)

Before context compaction (when nearing token limits), the system triggers a silent agent turn to write durable memories. This prevents important information from being lost when older messages are compressed.

- Controlled by `agents.defaults.compaction.memoryFlush` config
- Uses `NO_REPLY` token to suppress user-visible output
- Only runs when workspace is writable
- Skipped for CLI providers (they don't compact context)

### Session Lifecycle

| Event | Action |
|-------|--------|
| `warmSession(sessionKey)` | Pre-loads index on session start |
| `onSessionTranscriptUpdate` | Listens for session file changes |
| Delta threshold crossed | Triggers incremental session transcript indexing (100KB or 50 messages) |

---

## Caching and Resource Management

### Embedding Cache (`src/memory/manager.ts`)

- **Key**: `(provider, model, provider_key, hash)`
- Stored in SQLite table `embedding_cache`
- Hit detection before calling embedding API
- LRU eviction when cache exceeds `maxEntries` (default: 50,000)

### Manager Singleton Cache

```typescript
const INDEX_CACHE = new Map<string, MemoryIndexManager>();
// Key: `${agentId}:${workspaceDir}:${JSON.stringify(settings)}`
```

Reuses manager instances per agent/workspace/config combination. Invalidated on `close()`.

### Concurrency Control

- **Sync lock** - coalesces concurrent sync requests into a single operation
- **Batch failure lock** - serializes batch failure handling
- **Index concurrency** - defaults to 4 parallel embeddings (2 for batch mode)

### Atomic Reindex

Full reindexes use a temp database pattern:

1. Create temp DB: `{dbPath}.tmp-{uuid}`
2. Seed embedding cache from original DB
3. Index all files into temp DB
4. Atomic swap: backup original -> rename temp -> cleanup backup
5. Rollback on failure: restore original, delete temp

### Retry Logic

Embedding calls use exponential backoff: base 500ms, max delay capped, with jitter. Retryable errors (rate limits, transient failures) are retried up to `EMBEDDING_RETRY_MAX_ATTEMPTS`.

---

## Configuration

```typescript
agents: {
  defaults: {
    memorySearch: {
      enabled: true,
      provider: "openai" | "local" | "gemini" | "voyage" | "auto",
      model: "text-embedding-3-small",
      sources: ["memory", "sessions"],
      extraPaths: ["~/notes"],
      query: {
        maxResults: 6,
        minScore: 0.35,
        hybrid: {
          enabled: true,
          vectorWeight: 0.7,
          textWeight: 0.3,
          candidateMultiplier: 4
        }
      },
      chunking: { tokens: 400, overlap: 80 },
      cache: { enabled: true, maxEntries: 50000 },
      sync: {
        onSessionStart: true,
        onSearch: true,
        watch: true,
        watchDebounceMs: 1500
      }
    }
  }
}
```

### Backend Alternatives

| Backend | Description |
|---------|-------------|
| `"builtin"` (default) | SQLite + embeddings |
| `"qmd"` | QMD sidecar with BM25 + vectors + reranking |

---

## Summary

The memory system is a production-grade semantic memory layer that:

1. **Stores** agent memories as plain Markdown files (source of truth)
2. **Indexes** content using SQLite with vector embeddings and BM25 full-text search
3. **Searches** using hybrid retrieval (70% vector similarity + 30% keyword matching)
4. **Caches** embeddings aggressively to minimize API costs
5. **Integrates** with the agent runtime via `memory_search` and `memory_get` tools
6. **Auto-flushes** memories before context compaction to preserve important information
7. **Manages resources** with singleton patterns, concurrency locks, atomic reindexing, and retry logic

The architecture is plugin-based (swappable backends), agent-aware (per-agent isolation), and resilient (graceful fallbacks on failure).
