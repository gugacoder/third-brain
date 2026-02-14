# Heartbeat System

The heartbeat system is a periodic background automation framework that keeps AI agents proactive. At configurable intervals (default: every 30 minutes), each agent wakes up, reads its `HEARTBEAT.md` task file, consults an LLM, and either delivers a message to the user or silently acknowledges that nothing needs attention.

## Key Files

| File | Role |
|---|---|
| `src/auto-reply/heartbeat.ts` | Core constants, prompt text, token stripping, empty-file detection |
| `src/auto-reply/tokens.ts` | Defines `HEARTBEAT_OK` and `NO_REPLY` tokens |
| `src/infra/heartbeat-runner.ts` | Scheduling engine, per-agent state machine, `runHeartbeatOnce()` |
| `src/infra/heartbeat-wake.ts` | Wake/coalesce layer that debounces and serializes heartbeat triggers |
| `src/infra/heartbeat-events.ts` | Event emitter for UI status indicators |
| `src/infra/heartbeat-active-hours.ts` | Quiet-hours gating (timezone-aware) |
| `src/infra/heartbeat-visibility.ts` | Per-channel visibility rules (showOk, showAlerts, useIndicator) |

## Lifecycle of a Single Heartbeat

```
Timer fires / event arrives
        |
        v
  requestHeartbeatNow()          -- heartbeat-wake.ts
        |  (coalesce 250ms)
        v
  HeartbeatWakeHandler (run)      -- heartbeat-runner.ts
        |
        v
  runHeartbeatOnce()
    1. Guard checks (enabled? active hours? queue empty? file non-empty?)
    2. Resolve session, delivery target, visibility, prompt
    3. Call LLM via getReplyFromConfig()
    4. Normalize reply (strip HEARTBEAT_OK token, apply responsePrefix)
    5. Deduplicate against last sent heartbeat (24h window)
    6. Deliver via deliverOutboundPayloads() or suppress
    7. Emit HeartbeatEvent for UI
    8. Advance schedule timer
```

## Configuration

Heartbeats are configured per-agent with fallback to global defaults:

```yaml
agents:
  defaults:
    heartbeat:
      enabled: true
      every: "30m"              # Interval (parseDurationMs: "30m", "1h", "2d", etc.)
      prompt: "..."             # Custom LLM prompt (overrides default)
      target: "last"            # Delivery target ("last" channel or explicit channel name)
      model: "claude-3-haiku"   # LLM model override for heartbeat runs
      ackMaxChars: 300          # Max chars before a HEARTBEAT_OK ack is treated as real content
      session: ""               # Session key override ("main", "global", or custom)
      accountId: ""             # Explicit delivery account
      includeReasoning: false   # Forward reasoning payloads to user
      activeHours:
        start: "09:00"
        end: "22:00"
        timezone: "user"        # "user" | "local" | IANA timezone string

  list:
    - id: my-agent
      heartbeat:
        every: "1h"             # Per-agent override
```

## Guard Checks (Skip Conditions)

Before calling the LLM, `runHeartbeatOnce()` runs a series of guard checks. If any fail, the heartbeat is skipped with a reason:

| Reason | Condition |
|---|---|
| `disabled` | Heartbeats globally disabled or agent not in enabled list |
| `quiet-hours` | Current time is outside the agent's `activeHours` window |
| `requests-in-flight` | The main command queue has pending requests |
| `empty-heartbeat-file` | `HEARTBEAT.md` exists but contains only headers/whitespace/empty checkboxes |
| `alerts-disabled` | Channel visibility config has both `showAlerts` and `showOk` off |

Exception: exec-event and cron-event triggers bypass the `empty-heartbeat-file` check since they carry their own payload.

## The HEARTBEAT.md File

Each agent has a `HEARTBEAT.md` in its workspace directory. This is the user-authored task list the agent checks on each heartbeat cycle.

The system optimizes costs by detecting "effectively empty" files before calling the LLM. A file is considered empty if every line is one of:
- Blank / whitespace
- A markdown header (`# ...`, `## ...`)
- An empty list item (`- [ ]`, `* [ ]`, `- `)

If the file has any other content, the LLM is invoked.

## The Default Prompt

```
Read HEARTBEAT.md if it exists (workspace context). Follow it strictly.
Do not infer or repeat old tasks from prior chats.
If nothing needs attention, reply HEARTBEAT_OK.
```

The prompt is intentionally tight to prevent the model from inventing tasks based on prior conversation context. If the agent has nothing to report, it responds with the `HEARTBEAT_OK` token.

## HEARTBEAT_OK Token Processing

When the LLM replies, the system strips the `HEARTBEAT_OK` token to decide whether to deliver the message or suppress it:

1. **Markup normalization** -- HTML tags (`<b>HEARTBEAT_OK</b>`) and markdown wrappers (`**HEARTBEAT_OK**`) are stripped.
2. **Edge stripping** -- The token is removed from the beginning and end of the text.
3. **Remaining text check** -- If after stripping, the remaining text is <= `ackMaxChars` (default 300), the entire reply is treated as an ack and suppressed. If the remaining text exceeds that limit, it's treated as real content and delivered.

Results:
- `shouldSkip: true` -- The reply was just an acknowledgment. No message is sent (or a silent `HEARTBEAT_OK` marker is sent if `showOk` is enabled).
- `shouldSkip: false` -- The reply has meaningful content beyond the token. It gets delivered to the user.

## Duplicate Suppression

To prevent "nagging" when the model repeats the same reminders, the system tracks:
- `lastHeartbeatText` -- The text of the last delivered heartbeat message
- `lastHeartbeatSentAt` -- Timestamp of the last delivery

If the new message is identical to the last one and was sent within 24 hours, the heartbeat is suppressed with reason `"duplicate"`.

## Trigger Reasons

Heartbeats can fire for different reasons, each with a priority level:

| Reason | Priority | Description |
|---|---|---|
| `retry` | 0 (lowest) | Retry after a transient failure or busy queue |
| `interval` | 1 | Normal periodic timer |
| `cron:*` | 2 | Cron-scheduled reminder event |
| `exec-event` | 3 (highest) | An async command the agent ran has completed |
| `manual` | 3 | Manually triggered |
| `hook:*` | 3 | Triggered by a system hook |

When multiple triggers arrive within the coalesce window (250ms), the highest-priority reason wins.

### Special Prompts for Events

- **Exec events** -- The standard prompt is replaced with one instructing the model to relay the command output rather than checking `HEARTBEAT.md`.
- **Cron events** -- The actual reminder text is embedded directly into the prompt so the model sees it regardless of conversation context.

## Wake and Coalesce Layer (`heartbeat-wake.ts`)

The wake layer sits between callers of `requestHeartbeatNow()` and the actual runner. It provides:

1. **Debouncing** -- Multiple rapid triggers are coalesced into a single run (default 250ms window).
2. **Serialization** -- Only one heartbeat runs at a time. If a trigger arrives while one is running, it's queued.
3. **Retry with backoff** -- If the heartbeat is skipped due to `requests-in-flight`, it retries after 1 second. Retry timers are protected from being preempted by normal triggers.
4. **Priority queue** -- When multiple reasons are pending, the highest-priority one is used.

## Scheduling Engine (`heartbeat-runner.ts`)

`startHeartbeatRunner()` creates a state machine that manages multiple agents:

```typescript
type HeartbeatAgentState = {
  agentId: string;
  heartbeat?: HeartbeatConfig;
  intervalMs: number;
  lastRunMs?: number;
  nextDueMs: number;
};
```

The runner:
1. Resolves configured agents from config (explicit list or default agent fallback).
2. Calculates `nextDueMs = lastRunMs + intervalMs` for each agent.
3. Sets a `setTimeout` for the nearest `nextDueMs`.
4. When the timer fires, calls `requestHeartbeatNow({ reason: "interval" })`.
5. In the wake handler, iterates all agents and runs those whose `nextDueMs <= now`.
6. After each run, advances the agent's schedule: `nextDueMs = now + intervalMs`.

The runner supports live config updates via `updateConfig()`, preserving existing timers when intervals don't change.

## Active Hours (`heartbeat-active-hours.ts`)

Prevents heartbeats from firing during quiet hours:

```yaml
activeHours:
  start: "09:00"
  end: "22:00"
  timezone: "user"
```

- Times are in `HH:MM` format (24-hour clock, `24:00` allowed for end).
- Timezone options: `"user"` (from user config), `"local"` (server timezone), or any IANA timezone string.
- Supports overnight ranges (e.g., `start: "22:00"`, `end: "06:00"`).
- If configuration is missing or invalid, the check passes (heartbeats are allowed).

## Visibility (`heartbeat-visibility.ts`)

Controls what gets delivered per channel, with three-layer precedence:

```
per-account > per-channel > channel-defaults > global defaults
```

| Setting | Default | Description |
|---|---|---|
| `showOk` | `false` | Send `HEARTBEAT_OK` markers to the user |
| `showAlerts` | `true` | Deliver actual content messages |
| `useIndicator` | `true` | Emit UI status indicator events |

## Event System (`heartbeat-events.ts`)

Every heartbeat run emits a `HeartbeatEventPayload`:

```typescript
type HeartbeatEventPayload = {
  ts: number;
  status: "sent" | "ok-empty" | "ok-token" | "skipped" | "failed";
  to?: string;
  accountId?: string;
  preview?: string;         // First 200 chars of message
  durationMs?: number;
  hasMedia?: boolean;
  reason?: string;
  channel?: string;
  silent?: boolean;
  indicatorType?: "ok" | "alert" | "error";
};
```

UI indicator mapping:
- `ok-empty` / `ok-token` -> `"ok"` (green -- nothing needed)
- `sent` -> `"alert"` (yellow -- message delivered)
- `failed` -> `"error"` (red -- execution error)
- `skipped` -> no indicator

Listeners can subscribe via `onHeartbeatEvent(callback)` and the last event is available via `getLastHeartbeatEvent()`.

## Session and Delivery Resolution

1. **Session resolution** -- Based on `session.scope` (`"global"` or `"per-sender"`) and optional `heartbeat.session` override. This determines which conversation context the LLM sees.
2. **Delivery target** -- Resolved from `heartbeat.target` (default `"last"`, meaning the last channel the user messaged from). Can be set to a specific channel name.
3. **Channel readiness** -- Before delivery, the system checks if the channel plugin reports ready (e.g., WhatsApp connection is live). If not ready, the heartbeat is skipped.
4. **Response prefix** -- If configured per-agent or per-channel, prepended to the message text.

## Summary

The heartbeat system is a cost-aware, deduplication-enabled periodic runner that:
- Lets agents autonomously monitor user-defined tasks via `HEARTBEAT.md`
- Supports multiple trigger types (timer, cron, exec completion, manual)
- Skips unnecessary LLM calls when the task file is empty
- Suppresses duplicate messages within a 24-hour window
- Respects quiet hours and channel-specific visibility rules
- Provides real-time UI indicators for monitoring agent health
