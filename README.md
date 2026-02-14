# Third Brain

Personal knowledge system with semantic memory search and an AI-powered heartbeat daemon. Built with TypeScript, PostgreSQL + pgvector, and Claude.

Knowledge lives as plain markdown files. The system chunks, embeds, and indexes them for hybrid search (vector similarity + keyword matching). A background heartbeat daemon periodically reads context and delivers AI-generated insights.

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> && cd third-brain
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Start the database
docker compose up -d

# 4. Index your memory files
npm run memory:index

# 5. Start the server (API + heartbeat)
npm start
```

The dashboard is available at `http://localhost:5001` after starting the server.

## Architecture

```
src/
├── adapters/     # Plugin registry (outbound + embedding providers)
├── memory/       # Semantic search over markdown (pgvector)
├── heartbeat/    # Periodic AI daemon (reads context, delivers insights)
├── skills/       # Skill loader and prompt injection system
├── server/       # Hono API server (REST + SSE)
apps/
└── dashboard/    # React frontend (Vite + shadcn)
```

### Memory System

Semantic search over markdown files using PostgreSQL + pgvector.

**Pipeline:** markdown files → chunking (~400 tokens, 80 overlap) → embedding → PostgreSQL storage

**Search:** hybrid ranking — 70% cosine vector similarity + 30% BM25 keyword matching

Memory sources: `MEMORY.md` at repo root + any `*.md` in `memory/`.

### Heartbeat Daemon

Periodic background process that reads `HEARTBEAT.md`, sends it to Claude, and delivers output via a configurable outbound adapter. Features active hours gating, duplicate suppression, and event-based status tracking.

### Adapter Registry

Plugin system with two categories:
- **Outbound** — message delivery (built-in: `console`)
- **Embedding** — vector providers (built-in: `openai`, `ollama`, `gemini`)

### Skills

Declarative skill definitions that can be loaded from managed or workspace sources. Skills inject context and capabilities into AI interactions.

### Server

Hono-based API with REST endpoints and SSE channels for real-time events.

**Routes:** `/health`, `/memory`, `/heartbeat`, `/skills`, `/chat`

## Commands

```bash
# Database
docker compose up -d              # Start PostgreSQL + pgvector

# Server
npm start                         # Start API server
npm run dev:all                   # Start API + dashboard in dev mode
npm run dev:api                   # Start API server only (dev)
npm run dev:dashboard             # Start dashboard only (dev)

# Memory
npm run memory:index              # Force reindex all memory files
npm run memory:search -- <query>  # Search memory
npm run memory:status             # Show index status

# Heartbeat
npm run heartbeat                 # Start heartbeat daemon standalone

# Skills
npm run skills:list               # List available skills
npm run skills:status             # Show skills status

# Tests
npm test                          # Run all tests (vitest)
npm run test:watch                # Run tests in watch mode
```

## Configuration

All config is environment-driven. Copy `.env.example` to `.env` and set your values:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://thirdbrain:thirdbrain@localhost:5002/thirdbrain` |
| `EMBEDDING_PROVIDER` | `openai`, `ollama`, or `gemini` | `openai` |
| `OPENAI_API_KEY` | OpenAI API key (for embeddings) | — |
| `ANTHROPIC_API_KEY` | Anthropic API key (for heartbeat + chat) | — |
| `PORT` | Server port | `5001` |
| `HEARTBEAT_AUTOSTART` | Auto-start heartbeat with server | `true` |
| `HEARTBEAT_INTERVAL_MS` | Heartbeat cycle interval | `1800000` (30min) |
| `HEARTBEAT_ACTIVE_START` | Active hours start | `08:00` |
| `HEARTBEAT_ACTIVE_END` | Active hours end | `22:00` |
| `HEARTBEAT_TIMEZONE` | Timezone for active hours | `America/Sao_Paulo` |

## Tech Stack

- **Runtime:** Node.js, TypeScript (ES2022, strict mode)
- **API:** Hono
- **Database:** PostgreSQL 16 + pgvector
- **LLM:** Anthropic Claude SDK
- **Embeddings:** OpenAI / Ollama / Gemini
- **Frontend:** React, Vite, shadcn, Tailwind CSS
- **Testing:** Vitest

## License

Private project.
