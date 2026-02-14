# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Second-brain system with semantic memory search (hybrid vector + keyword) and a periodic heartbeat automation daemon powered by Claude. Persistent knowledge is stored as plain markdown (`MEMORY.md`, `HEARTBEAT.md`). Includes a chat interface, a skills injection system, and a React dashboard.

**OpenClaw reference source:** `D:\sources\_unowned\second-brain\openclaw`

## System Boundary

The `.user-folder` directory is a strictly private user workspace. **Access is explicitly forbidden** — do not read, index, analyze, or reference its contents.

## Commands

```bash
# Database (required for memory, chat, and server)
docker compose up -d

# Server (API + heartbeat + chat)
npm start                         # Production
npm run dev:all                   # API + dashboard in dev mode (concurrently)
npm run dev:api                   # API server only
npm run dev:dashboard             # Dashboard only (Vite dev server)

# Memory
npm run memory:index              # Force reindex all memory files
npm run memory:search -- <query>  # Search memory
npm run memory:status             # Show index status (provider, files, chunks)

# Heartbeat
npm run heartbeat                 # Start heartbeat daemon standalone

# Skills
npm run skills:list               # List available skills
npm run skills:status             # Show skills status

# Tests
npm test                          # Run all tests once (vitest)
npm run test:watch                # Run tests in watch mode
npx vitest run src/adapters       # Run tests for a specific directory
npx vitest run path/to/file       # Run a single test file
```

All commands use `tsx` for TypeScript execution. Configuration is via environment variables — see `.env.example`.

## Architecture

Five subsystems under `src/`, all sharing a plugin-based adapter registry:

### Adapter Registry (`src/adapters/`)

Central plugin system with two adapter categories: **outbound** (message delivery) and **embedding** (vector providers). Uses factory-based lazy instantiation with a singleton registry pre-loaded with defaults. Plugins register via `PluginApi.registerOutbound()` / `registerEmbedding()`. Resolved adapters are cached; re-registration invalidates the cache.

Built-in outbound: `console`. Built-in embeddings: `openai`, `ollama`, `gemini`.

### Memory System (`src/memory/`)

Semantic search over markdown files using PostgreSQL + pgvector.

**Pipeline:** markdown files → chunking (~400 tokens, 80 overlap) → embedding → PostgreSQL storage. Search is hybrid: 70% cosine vector similarity + 30% BM25 keyword matching.

**Key flow:** `manager.ts` orchestrates → `indexer.ts` discovers and chunks files → `embeddings/*.ts` generates vectors → `search.ts` runs hybrid queries → `cache.ts` caches embeddings in DB → `watcher.ts` (chokidar) triggers re-sync on file changes.

**DB tables:** `files` (path/hash tracking), `chunks` (text + pgvector embedding + tsvector for FTS), `embedding_cache` (provider×model×hash → vector, LRU eviction), `meta` (key-value store).

Memory sources: `MEMORY.md` at repo root + any `*.md` in `memory/` directory.

### Heartbeat System (`src/heartbeat/`)

Periodic background daemon that reads `HEARTBEAT.md`, sends content to Claude, and delivers output via an outbound adapter. Guards: active hours gating (timezone-aware, cross-midnight support), `HEARTBEAT_OK` token for "nothing to report", 24h duplicate suppression, empty-content detection.

**Key flow:** `cli.ts` entry → `runner.ts` orchestrates cycles → calls Anthropic API → delivers via adapter → emits events → SSE broadcast.

### Skills System (`src/skills/`)

Loads skill definitions (YAML frontmatter + body from `SKILL.md` files) from `~/.third-brain/skills/` (managed) and `workspace/skills/` (workspace overrides managed by name). Skills are filtered by OS, binary requirements, and env var availability. Eligible skills are formatted into a prompt block (`<available_skills>`) injected into AI system prompts.

Skill config from env: `SKILL_{NAME}_ENABLED`, `SKILL_{NAME}_API_KEY`, `SKILL_{NAME}_ENV_{VAR}`.

### Server (`src/server/`)

Hono API server with REST endpoints and SSE streams. Context middleware injects `ServerContext` (memory, heartbeat, chat, workspaceDir).

**API routes:** `/api/health`, `/api/memory/*`, `/api/heartbeat/*`, `/api/skills`, `/api/chat/*`
**SSE streams:** `/sse/chat/{sessionId}` (token events), `/sse/heartbeat` (heartbeat events). Both keep-alive at 30s.

**Chat:** In-memory session cache + PostgreSQL persistence. Messages stream via EventEmitter → SSE. Supports abort, session management (list/rename/delete), auto-titling from first user message.

### Dashboard (`apps/dashboard/`)

React SPA (Vite + shadcn + Tailwind + wouter). Pages: Overview, Memory, Heartbeat, Chat, Skills. Typed API client in `lib/api.ts`. SSE hook (`useSSE`) for real-time updates. Path alias: `@/*` → `./src/*`. Dev server proxies `/api` and `/sse` to `localhost:5001`.

## Key Patterns

- **ESM throughout:** `"type": "module"` — imports require explicit `.js` extensions (even for `.ts` files)
- **Lazy initialization:** Managers init on first use, not in constructor. DB schema auto-created on init
- **Dirty-state watcher:** Chokidar monitors markdown files, marks memory dirty, auto-syncs on next search (debounced 1.5s)
- **Fire-and-forget streaming:** `POST /api/chat` returns immediately; tokens stream via SSE on a separate connection
- **Event-driven status:** Heartbeat events emitted synchronously, cached as last event, broadcast via SSE
- **Config validation at CLI entry:** Each CLI validates required env vars and exits with actionable message on failure

## Tech Stack

- **Runtime:** Node.js, TypeScript (ES2022, strict mode, Node16 module resolution)
- **Web framework:** Hono
- **Database:** PostgreSQL 16 + pgvector (via docker-compose, port 5002)
- **LLM:** Anthropic Claude SDK
- **Embeddings:** OpenAI (`text-embedding-3-small`, 1536 dims), Ollama, or Gemini
- **Testing:** Vitest (tests in `__tests__/` subdirectories within feature modules)
- **File watching:** Chokidar
- **Frontend:** React 18, Vite, shadcn, Tailwind CSS, wouter (routing)

## Conventions

- Apps live in `./apps/{slug}/` (npm workspaces)
- Services must be defined in `docker-compose.yml`
- Communication pattern: REST for input, SSE for output
- All config is environment-driven (see `.env.example` for full list)
- Embedding provider is selectable via `EMBEDDING_PROVIDER` env var
