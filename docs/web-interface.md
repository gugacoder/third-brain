# OpenClaw Web Interface (Control UI)

Reference analysis of the OpenClaw "Control UI" — the browser-based dashboard for managing and interacting with an OpenClaw gateway instance.

## Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | **Lit** (Web Components via `LitElement`, `@customElement`) |
| Build tool | **Vite** (dev server on port 5173, builds to `dist/control-ui/`) |
| Markdown rendering | **marked** |
| Sanitization | **DOMPurify** |
| Cryptographic identity | **@noble/ed25519** (device auth key pairs) |
| Styling | Plain CSS (no preprocessor), custom properties for theming |
| Testing | **Vitest** + **Playwright** (browser tests) |
| Backend communication | **WebSocket** (custom JSON-RPC protocol) |

### Monorepo Layout

```
ui/                          # Standalone Vite package ("openclaw-control-ui")
├── index.html               # SPA entry — mounts <openclaw-app>
├── vite.config.ts           # Configurable base path via OPENCLAW_CONTROL_UI_BASE_PATH
├── public/                  # Static assets (favicons)
└── src/
    ├── main.ts              # Imports styles + registers the app component
    ├── styles.css            # Aggregates all CSS partials
    ├── styles/              # CSS modules: base, layout, chat, components, config
    └── ui/
        ├── app.ts           # Root LitElement component (OpenClawApp)
        ├── app-*.ts         # App-level concerns (chat, events, gateway, lifecycle, render, scroll, settings, tool-stream)
        ├── gateway.ts       # WebSocket client (GatewayBrowserClient)
        ├── navigation.ts    # Tab routing (SPA client-side router)
        ├── storage.ts       # localStorage persistence for settings
        ├── theme.ts         # Light/dark/system theme resolution
        ├── controllers/     # Data-fetching logic per feature (chat, config, agents, etc.)
        └── views/           # Render functions for each tab/page
```

### Server-Side Hosting

The gateway process (`src/gateway/`) serves the built UI as static files:

- **`src/gateway/control-ui.ts`** — HTTP handler that serves the SPA from `dist/control-ui/`.
- Uses SPA fallback: unknown paths return `index.html` for client-side routing.
- Injects runtime config (`__OPENCLAW_CONTROL_UI_BASE_PATH__`, `__OPENCLAW_ASSISTANT_NAME__`, `__OPENCLAW_ASSISTANT_AVATAR__`) into the HTML `<head>` at serve time.
- Serves agent avatar images via `/avatar/{agentId}` endpoints with a `?meta=1` JSON metadata variant.
- Applies security headers: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`.

## Gateway Communication

### WebSocket Protocol

The frontend connects to the gateway over a **WebSocket** using a custom JSON-RPC-style protocol (version 3):

```
ws://<host>:<port>   (or wss:// for HTTPS)
```

**Frame types:**

| Direction | Type | Purpose |
|-----------|------|---------|
| Client → Server | `req` | JSON-RPC request (`{ type: "req", id, method, params }`) |
| Server → Client | `res` | Response (`{ type: "res", id, ok, payload, error }`) |
| Server → Client | `event` | Push event (`{ type: "event", event, payload, seq }`) |

**Connection handshake:**

1. WebSocket opens.
2. Server may send a `connect.challenge` event with a nonce.
3. Client sends a `connect` request with protocol version, client info, auth credentials, and optional device identity (Ed25519 signed payload).
4. Server responds with `hello-ok` containing the protocol version, supported features/methods/events, initial snapshot, and auth tokens.

**Reconnection:** Automatic with exponential backoff (800ms initial, 1.7x multiplier, 15s max). Pending request promises are rejected on disconnect.

### Authentication

Three auth mechanisms, layered:

1. **Gateway token** — stored in localStorage, sent in the `connect` request.
2. **Password** — entered per-session (not persisted), sent alongside or instead of a token.
3. **Device identity** — Ed25519 key pair generated in the browser via `crypto.subtle` (requires HTTPS/localhost). The device public key and a signed payload are sent during connect. The gateway can issue a `deviceToken` in response, which is cached for future connections.

Insecure HTTP contexts (no `crypto.subtle`) fall back to token-only auth. A config flag `gateway.controlUi.allowInsecureAuth` can enable this.

## Navigation & Routing

The UI is a single-page application with client-side routing. The root component (`<openclaw-app>`) renders a persistent shell (topbar + sidebar + main content area) and swaps the main content based on the active tab.

**Tab structure (4 groups, 12 tabs):**

| Group | Tabs |
|-------|------|
| **Chat** | Chat |
| **Control** | Overview, Channels, Instances, Sessions, Usage, Cron |
| **Agent** | Agents, Skills, Nodes |
| **Settings** | Config, Debug, Logs |

Routes are mapped as `/{tab-name}` (e.g., `/chat`, `/overview`, `/config`). The root path `/` defaults to Chat. Browser history is managed via `pushState`/`popState`.

## Features by Tab

### Chat

The primary interaction surface. A full-featured chat interface for conversing with the AI agent through the gateway.

- **Real-time message streaming** — Assistant responses stream token-by-token via gateway events, with a reading indicator (animated dots) while the model is processing.
- **Message grouping** — Consecutive messages from the same role are visually grouped together with avatar and role attribution.
- **Markdown rendering** — Messages are rendered as markdown (via `marked`) with DOMPurify sanitization.
- **Tool call visualization** — When the agent invokes tools (file reads, code execution, etc.), live tool-call cards appear showing the tool name, arguments, and streaming partial results. Tool output can be expanded in a resizable sidebar panel.
- **Sidebar panel** — A split-pane view for inspecting tool output. Ratio is adjustable (40%-70%) and persisted. Supports raw text toggle.
- **Image attachments** — Paste images from clipboard or drag-and-drop. Previewed as thumbnails before sending.
- **Message queue** — When the assistant is busy, new messages are queued and sent sequentially. Queue items can be removed.
- **Session management** — Switch between session keys. `/new` or `/reset` commands create fresh sessions. Session key is shown and editable.
- **Abort/Stop** — Cancel an in-progress response. Also accepts natural language: "stop", "abort", "wait", "esc", "exit".
- **Context compaction** — Visual indicator when the gateway compacts the conversation context (auto-summarization), with a brief toast on completion.
- **Focus mode** — Hides the sidebar navigation for a distraction-free chat experience.
- **Auto-scroll** — Automatically scrolls to the latest message, with a "New messages" button when the user has scrolled up.
- **Copy as markdown** — Messages can be copied in markdown format.
- **Agent avatar** — Per-agent custom avatars loaded from the gateway.
- **Bidirectional text** — Auto-detects RTL text direction.

### Overview

Gateway health dashboard and connection configuration.

- **Gateway Access panel** — WebSocket URL, gateway token, password, and default session key. Connect/Refresh buttons.
- **Snapshot panel** — Connection status (connected/disconnected with indicator dot), uptime, tick interval, last channels refresh timestamp.
- **Stat cards** — Instance count (presence beacons in last 5 min), active session count, cron status (enabled/disabled + next run time).
- **Auth hints** — Context-sensitive help when authentication fails (guides to token generation, docs links).
- **Notes section** — Quick reminders for Tailscale serve, session hygiene, and cron best practices.

### Channels

Manage messaging platform integrations. Each channel has a dedicated card:

- **WhatsApp** — QR code login flow, connection status, start/wait/logout actions.
- **Telegram** — Bot configuration and status.
- **Discord** — Server/guild connection management.
- **Signal** — Linked device setup.
- **Slack** — Workspace integration status.
- **iMessage** — macOS BlueBubbles integration.
- **Google Chat** — Workspace bot status.
- **Nostr** — Decentralized social protocol with profile editor (name, about, picture, NIP-05, lightning, advanced fields) and key import.

Channels are sorted with enabled channels first. Each card shows account count, connection state, and channel-specific configuration. An inline config editor (using the JSON schema form renderer) allows editing channel settings directly.

### Instances

Live presence monitoring for connected clients and nodes.

- Shows a list of presence beacon entries with metadata.
- Refresh button to poll latest presence data.

### Sessions

Inspect and manage conversation sessions.

- **Session list** — Filterable by active duration, with limit controls. Shows session key, channel, agent, provider, model, message count, tool calls, errors, and duration.
- **Inline editing** — Patch session labels, thinking level (off/minimal/low/medium/high/xhigh), verbose level, and reasoning level directly from the table.
- **Delete sessions** — Remove session state.
- **Global/Unknown filters** — Toggle visibility of global and unattributed sessions.

### Usage

Detailed analytics and cost tracking dashboard.

- **Date range picker** — Filter by start/end date with debounced auto-reload.
- **Summary cards** — Total tokens, total cost, aggregate breakdowns (by provider, model, channel, agent).
- **Daily cost chart** — Bar chart with "total" or "by-type" breakdown modes.
- **Session table** — Sortable by tokens, cost, recency, messages, or errors. Columns are toggleable. Supports search/filter, shift-click multi-select, and recent session tracking.
- **Session detail** — Click a session to view its time-series token usage (cumulative or per-turn), log entries with role/tool filters, and full conversation replay.
- **Hourly heatmap** — Select hours to filter data.
- **Export** — Timezone toggle (local/UTC), context expansion, pinnable header.

### Cron

Schedule recurring agent runs.

- **Job list** — Shows each cron job with schedule expression, target channel, last run time, and next run time.
- **Add/Edit jobs** — Form with cron expression, channel selector, and configuration.
- **Toggle/Run/Remove** — Enable/disable, trigger immediately, or delete jobs.
- **Run history** — View execution logs for a specific job.

### Agents

Multi-agent workspace management.

- **Agent selector** — Pick from configured agents (with default agent highlighted).
- **Sub-panels:**
  - **Overview** — Agent identity (name, avatar), model configuration (primary + fallback models).
  - **Files** — Browse and edit agent workspace files with an inline code editor, save/reset per file.
  - **Tools** — Tool profile management (profile selection, allow/deny overrides).
  - **Skills** — Per-agent skill availability toggles, enable/disable all, filter by name.
  - **Channels** — Channel status specific to the selected agent.
  - **Cron** — Cron jobs scoped to the agent.

### Skills

Global skill management across the gateway.

- **Skill list** — Filterable catalog of all available skills with status indicators.
- **Enable/Disable** — Toggle skill availability.
- **API key injection** — Inline editor for providing API keys required by skills.
- **Install** — Install new skills by ID or name.

### Nodes

Paired device and remote node management.

- **Node list** — Connected nodes with capabilities and command exposure.
- **Device pairing** — Approve/reject pending pairing requests, rotate/revoke device tokens.
- **Execution binding** — Bind default or per-agent tool execution to specific nodes.
- **Exec approvals** — Review and manage execution approval policies per agent, targeting gateway or specific nodes. Inline form editor for approval rules.
- **Config integration** — Node bindings are saved to the main config.

### Config

Edit the gateway configuration file (`~/.openclaw/openclaw.json`).

- **Dual mode editor:**
  - **Form mode** — Schema-driven form with sections, subsections, search, and input validation. Auto-generated from the gateway's JSON schema with UI hints.
  - **Raw mode** — Direct JSON editing with validation feedback.
- **Validation** — Real-time issue detection with error/warning display.
- **Save/Reload/Apply** — Save writes to disk, Apply hot-reloads the gateway config, Reload refreshes from disk.
- **Update** — Trigger a gateway self-update.

### Debug

Low-level gateway introspection.

- **Status summary** — Gateway version, runtime info.
- **Health snapshot** — Detailed health metrics.
- **Models** — List of configured model providers.
- **Heartbeat** — Current heartbeat state.
- **Event log** — Chronological log of gateway events received during the session.
- **Manual RPC** — Execute arbitrary gateway methods with custom JSON params and view raw results.

### Logs

Live log viewer.

- **Streaming tail** — Polls gateway logs with auto-follow.
- **Level filters** — Toggle visibility per level (trace, debug, info, warn, error, fatal).
- **Text search** — Filter by message content, subsystem, or raw text.
- **Export** — Download filtered or full logs.
- **Truncation indicator** — Shows when the log buffer has been trimmed.

## UI/UX Features

### Theming

- **Three modes:** System (follows OS preference), Light, Dark.
- Theme toggle in the topbar. Persisted to localStorage.
- Uses CSS custom properties with a `data-theme` attribute on the document.
- Media query listener for system theme changes.

### Responsive Layout

- Collapsible sidebar navigation (hamburger toggle in topbar).
- Nav groups are independently collapsible.
- Mobile-specific CSS (`layout.mobile.css`).
- Chat focus mode hides navigation entirely.

### Persistence

All UI settings are stored in `localStorage` under `openclaw.control.settings.v1`:

- Gateway URL and auth token
- Session key
- Theme preference
- Chat focus mode and thinking visibility toggles
- Sidebar split ratio
- Navigation collapse state

### Accessibility

- ARIA roles (`role="log"`, `role="status"`, `aria-live="polite"`, `aria-expanded`, `aria-label`).
- Keyboard support (Enter to send, Shift+Enter for newlines, IME composition handling).
- Semantic HTML structure with proper heading hierarchy.

### Security

- Frame embedding blocked (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`).
- Path traversal prevention on static file serving.
- DOMPurify sanitization on rendered markdown.
- Device identity uses Ed25519 (via Web Crypto API) for authentication.
- Content-Type nosniff headers.

## Key Differences from Third-Brain

| Aspect | OpenClaw Control UI | Third-Brain |
|--------|-------------------|-------------|
| Frontend | Lit Web Components (SPA) | No web UI yet |
| Communication | WebSocket (bidirectional, real-time) | REST input, SSE output (per CLAUDE.md) |
| Chat | Full streaming chat with tool visualization | N/A |
| Configuration | Schema-driven form + raw JSON editor | Environment variables |
| Multi-channel | WhatsApp, Telegram, Discord, Signal, Slack, iMessage, Google Chat, Nostr | Console adapter only |
| Agent management | Multi-agent workspaces with per-agent config | Single agent |
| Analytics | Full usage/cost tracking dashboard | N/A |
| Auth | Token + password + Ed25519 device identity | N/A |
