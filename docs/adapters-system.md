# OpenClaw Adapters System

## Overview

The adapters system is a **contract-based plugin architecture** that abstracts channel-specific functionality behind standardized interfaces. It is the backbone of OpenClaw's multi-channel support.

### Problems it solves

- **Channel Agnosticity**: New messaging channels (Discord, Telegram, WhatsApp, Signal, etc.) can be added without modifying core logic.
- **Separation of Concerns**: Channel-specific behavior (auth, messaging formats, delivery) is isolated from the core agent system.
- **Pluggable Architecture**: External plugins can extend OpenClaw with new channels via a registry system.
- **Runtime Flexibility**: Adapters are resolved and composed at runtime without tight coupling.

---

## Adapter Types

OpenClaw defines **20+ adapter types** organized across multiple categories.

### Core Adapters (`src/channels/plugins/types.adapters.ts`)

| Adapter | Purpose | Key Methods |
|---|---|---|
| **ChannelSetupAdapter** | CLI onboarding and account setup | `resolveAccountId`, `applyAccountConfig`, `validateInput` |
| **ChannelConfigAdapter\<T\>** | Account configuration & resolution | `listAccountIds`, `resolveAccount`, `isConfigured`, `isEnabled` |
| **ChannelGroupAdapter** | Group/channel-specific behavior | `resolveRequireMention`, `resolveGroupIntroHint`, `resolveToolPolicy` |
| **ChannelOutboundAdapter** | Message sending/delivery | `sendText`, `sendMedia`, `sendPayload`, `sendPoll` |
| **ChannelStatusAdapter\<T\>** | Health checks & monitoring | `probeAccount`, `auditAccount`, `buildAccountSnapshot`, `collectStatusIssues` |
| **ChannelGatewayAdapter\<T\>** | Long-lived connections (WebSocket, etc.) | `startAccount`, `stopAccount`, `loginWithQrStart`, `logoutAccount` |
| **ChannelAuthAdapter** | Authentication flows | `login` |
| **ChannelPairingAdapter** | User approval workflows | `idLabel`, `normalizeAllowEntry`, `notifyApproval` |
| **ChannelSecurityAdapter\<T\>** | Security policies | `resolveDmPolicy`, `collectWarnings` |
| **ChannelDirectoryAdapter** | User/group lookup | `self`, `listPeers`, `listGroups`, `listGroupMembers` |
| **ChannelResolverAdapter** | Target name resolution | `resolveTargets` |
| **ChannelHeartbeatAdapter** | Connection health | `checkReady`, `resolveRecipients` |
| **ChannelElevatedAdapter** | Permission escalation | `allowFromFallback` |
| **ChannelCommandAdapter** | Command handling | `enforceOwnerForCommands` |

### Messaging Adapters (`src/channels/plugins/types.core.ts`)

| Adapter | Purpose |
|---|---|
| **ChannelStreamingAdapter** | Token streaming defaults (coalescence settings) |
| **ChannelThreadingAdapter** | Thread/reply handling modes |
| **ChannelMessagingAdapter** | Target normalization & display |
| **ChannelMentionAdapter** | Mention formatting (strip patterns) |
| **ChannelMessageActionAdapter** | Interactive message actions (reactions, buttons) |
| **ChannelAgentPromptAdapter** | Agent-specific message hints |

### Tool Adapter (`src/agents/pi-tool-definition-adapter.ts`)

Converts `AgentTool` instances to `ToolDefinition` format, integrating `before_tool_call` and `after_tool_call` hooks. Bridges between the PI agent core tools and the tool definition format expected by the system.

---

## The `ChannelPlugin<T>` Composite Type

All adapters compose into a single `ChannelPlugin<T>` object defined in `src/channels/plugins/types.plugin.ts`. A channel plugin is not a class hierarchy -- it is a plain object whose fields are the individual adapters. Each adapter field is **optional**, so channels only implement what they need.

Example structure (Discord):

```typescript
export const discordPlugin: ChannelPlugin<ResolvedDiscordAccount> = {
  id: "discord",
  meta: { ... },
  capabilities: { chatTypes: ["direct", "channel", "thread"], ... },

  // Adapters
  onboarding:  discordOnboardingAdapter,
  pairing:     { idLabel: "discordUserId", ... },
  streaming:   { blockStreamingCoalesceDefaults: { ... } },
  config:      { listAccountIds, resolveAccount, isConfigured, ... },
  security:    { resolveDmPolicy, collectWarnings },
  groups:      { resolveRequireMention, resolveToolPolicy },
  mentions:    { stripPatterns },
  threading:   { resolveReplyToMode },
  messaging:   { normalizeTarget, targetResolver },
  directory:   { self, listPeers, listGroups },
  resolver:    { resolveTargets },
  actions:     discordMessageActions,
  setup:       { resolveAccountId, applyAccountConfig, validateInput },
  outbound:    { deliveryMode: "direct", sendText, sendMedia, sendPoll },
  status:      { probeAccount, auditAccount, buildAccountSnapshot, ... },
  gateway:     { startAccount, stopAccount, loginWithQrStart, logoutAccount },
};
```

---

## Registration, Resolution, and Usage

### Registration Flow

```
Plugin Manifest (openclaw.plugin.json)
        │
        ▼
discoverOpenClawPlugins()          ← src/plugins/discovery.ts
        │
        ▼
Plugin Loader calls plugin.register()   ← src/plugins/loader.ts
        │
        ▼
Plugin calls api.registerChannel(plugin) ← e.g. extensions/discord/index.ts
        │
        ▼
PluginRegistry.channels[]               ← src/plugins/registry.ts
```

The `OpenClawPluginApi` (`src/plugins/types.ts`) provides registration methods:

| Method | What it registers |
|---|---|
| `api.registerChannel(plugin)` | Channel plugins (adapters) |
| `api.registerProvider(plugin)` | LLM providers (Anthropic, OpenAI, etc.) |
| `api.registerTool(tool)` | Agent tools |
| `api.registerHook(hook)` | Event hooks |
| `api.registerGatewayMethod(handler)` | Real-time gateway handlers |
| `api.registerHttpHandler(handler)` | HTTP endpoints |
| `api.registerService(service)` | Background services |
| `api.registerCommand(command)` | Custom CLI commands |

### Resolution

Two loading strategies exist:

1. **Synchronous (lightweight)** -- `src/channels/plugins/index.ts`

   ```typescript
   getChannelPlugin(id: ChannelId): ChannelPlugin | undefined
   ```
   Used for quick property access and checks. Resolves directly from the plugin registry.

2. **Asynchronous (cached, lazy)** -- `src/channels/plugins/load.ts`

   ```typescript
   loadChannelPlugin(id: ChannelId): Promise<ChannelPlugin | undefined>
   ```
   Lazy-loads from the registry with caching. Used at execution boundaries.

3. **Adapter-specific loading** -- `src/channels/plugins/outbound/load.ts`

   ```typescript
   loadChannelOutboundAdapter(id: ChannelId): Promise<ChannelOutboundAdapter | undefined>
   ```
   Lightweight loader that avoids loading the entire channel plugin when only the outbound adapter is needed.

### Usage at Runtime

Once resolved, callers access individual adapters as properties on the plugin object:

```typescript
const plugin = getChannelPlugin("discord");

// Send a message
await plugin.outbound.sendText({ to, text, ... });

// Resolve an account
const account = await plugin.config.resolveAccount(cfg, accountId);

// Probe health
const snapshot = await plugin.status.probeAccount(account, timeoutMs);
```

---

## Integration Points

Adapters are consumed throughout the codebase:

| Location | Adapter Used | Purpose |
|---|---|---|
| `src/infra/outbound/deliver.ts` | `ChannelOutboundAdapter` | Message delivery |
| `src/auto-reply/reply/queue/settings.ts` | `plugin.defaults.queue` | Queue debounce settings |
| `src/agents/channel-tools.ts` | `plugin.actions` | Channel-specific message actions |
| `src/agents/pi-tool-definition-adapter.ts` | Tool Definition Adapter | Converting agent tools with hooks |
| `src/channels/plugins/message-actions.ts` | `plugin.actions` | Interactive message handling |

---

## Plugin Registry Structure

The full registry (`src/plugins/registry.ts`) holds all plugin types:

```typescript
type PluginRegistry = {
  plugins:         PluginRecord[];
  tools:           PluginToolRegistration[];
  hooks:           PluginHookRegistration[];
  typedHooks:      TypedPluginHookRegistration[];
  channels:        PluginChannelRegistration[];   // Channel adapters
  providers:       ProviderRegistration[];         // LLM providers
  gatewayHandlers: GatewayRequestHandlers;
  httpHandlers:    PluginHttpRegistration[];
  httpRoutes:      PluginHttpRouteRegistration[];
  cliRegistrars:   PluginCliRegistration[];
  services:        PluginServiceRegistration[];
  commands:        PluginCommandRegistration[];
  diagnostics:     PluginDiagnostic[];
};
```

---

## Design Principles

1. **Lazy Loading** -- Heavy adapters are loaded on-demand to keep startup fast.
2. **Caching** -- Plugin lookups are cached per registry instance.
3. **Type Safety** -- Generic `ChannelPlugin<T>` parameterized by `ResolvedAccount` type ensures type-safe config access.
4. **Separation** -- Lightweight outbound adapters can be loaded independently of full channel plugins.
5. **Composability** -- Adapters are optional object fields; channels implement only what they need.
6. **Extensibility** -- External plugins register channels without touching core code.

---

## End-to-End Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│  1. DISCOVERY                                           │
│     discoverOpenClawPlugins() scans plugin manifests    │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  2. REGISTRATION                                        │
│     Plugin.register(api) → api.registerChannel(plugin)  │
│     Stored in PluginRegistry.channels[]                 │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  3. ACTIVATION                                          │
│     Plugin.activate() sets up runtime context           │
│     getActivePluginRegistry() becomes available         │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  4. RESOLUTION                                          │
│     getChannelPlugin("discord") or                      │
│     loadChannelPlugin("discord")                        │
│     Returns the ChannelPlugin<T> with all adapters      │
└──────────────────────┬──────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────┐
│  5. ADAPTER USAGE                                       │
│     plugin.outbound.sendText(...)                       │
│     plugin.config.resolveAccount(...)                   │
│     plugin.status.probeAccount(...)                     │
│     plugin.gateway.startAccount(...)                    │
└─────────────────────────────────────────────────────────┘
```
