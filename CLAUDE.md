# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Second-brain system built with Claude Code SDK, inspired by OpenClaw concepts. Persistent knowledge is stored as plain markdown (MEMORY.md, HEARTBEAT.md). The system provides semantic memory search (hybrid vector + keyword) and a periodic heartbeat automation daemon powered by Claude.

**OpenClaw reference source:** `D:\sources\_unowned\second-brain\openclaw`

## System Boundary

The `.user-folder` directory is a strictly private user workspace. **Access is explicitly forbidden** — do not read, index, analyze, or reference its contents.

## Stacks

**backend**
- node+hono

**frontend**
- vite
- shadcn
- canais SSE para eventos

## Commands

```bash
# Start database (required for memory system)
docker compose up -d

# Memory system
npm run memory:index          # Force reindex all memory files
npm run memory:search         # Search memory (pass query as args)
npm run memory:status         # Show index status (provider, files, chunks)

# Heartbeat daemon
npm run heartbeat             # Start periodic heartbeat loop

# Tests
npm test                      # Run all tests once (vitest)
npm run test:watch            # Run tests in watch mode
npx vitest run src/adapters   # Run tests for a specific directory
npx vitest run path/to/file   # Run a single test file
```

All commands use `tsx` for TypeScript execution. Configuration is via environment variables — see `.env.example`.

## Architecture

Three subsystems under `src/`, all sharing a plugin-based adapter registry:

### Adapter Registry (`src/adapters/`)
Central plugin system with two adapter categories: **outbound** (message delivery) and **embedding** (vector providers). Uses factory-based lazy instantiation with a singleton registry pre-loaded with defaults. Plugins register via `PluginApi.registerOutbound()` / `registerEmbedding()`. Resolved adapters are cached.

Built-in outbound: `console`. Built-in embeddings: `openai`, `ollama`, `gemini`.

### Memory System (`src/memory/`)
Semantic search over markdown files using PostgreSQL + pgvector. Pipeline: markdown files → chunking (~400 tokens, 80 overlap) → embedding → PostgreSQL storage. Search is hybrid: 70% cosine vector similarity + 30% BM25 keyword matching.

Key flow: `manager.ts` orchestrates → `indexer.ts` discovers and chunks files → `embeddings/*.ts` generates vectors → `search.ts` runs hybrid queries → `cache.ts` caches embeddings in DB → `watcher.ts` (chokidar) triggers re-sync on file changes.

Memory sources: `MEMORY.md` at repo root + any `*.md` in `memory/` directory.

### Heartbeat System (`src/heartbeat/`)
Periodic background daemon that reads `HEARTBEAT.md`, sends content to Claude, and delivers output via an outbound adapter. Includes: active hours gating with timezone support, `HEARTBEAT_OK` token for "nothing to report", 24h duplicate suppression, and an event system for status tracking.

Key flow: `cli.ts` entry → `runner.ts` orchestrates cycles → calls Anthropic API → delivers via adapter → emits events.

## Tech Stack

- **Runtime:** Node.js, TypeScript (ES2022, strict mode, Node16 modules)
- **Web framework:** Hono
- **Database:** PostgreSQL 16 + pgvector (via docker-compose)
- **LLM:** Anthropic Claude SDK
- **Embeddings:** OpenAI (`text-embedding-3-small`), Ollama, or Gemini
- **Testing:** Vitest
- **File watching:** Chokidar
- **UI testing:** Playwright (for React interfaces)
- **Frontend:** Vite + shadcn

## Conventions

- Apps live in `./apps/{slug}/`
- Services must be defined in `docker-compose.yml`
- Communication pattern: REST for input, SSE for output
- All config is environment-driven (see `.env.example` for full list)
- Embedding provider is selectable via `EMBEDDING_PROVIDER` env var
