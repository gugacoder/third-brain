export type HeartbeatConfig = {
  /** Interval between heartbeat runs in milliseconds. */
  intervalMs: number;
  /** Anthropic model to use. */
  model: string;
  /** System prompt for the heartbeat. */
  prompt: string;
  /** Workspace directory containing HEARTBEAT.md. */
  workspaceDir: string;
  /** Adapter id for outbound delivery. */
  adapter: string;
  /** Active hours config (quiet hours). */
  activeHours?: {
    start: string; // "HH:MM"
    end: string;   // "HH:MM"
    timezone?: string; // IANA timezone or "local"
  };
  /** Max chars for ack text before treating as real content. */
  ackMaxChars: number;
  /** Formatted skills prompt to append to the system prompt. */
  skillsPrompt?: string;
};

export type HeartbeatRunResult =
  | { status: "sent"; text: string; durationMs: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export const DEFAULT_CONFIG: Omit<HeartbeatConfig, "workspaceDir"> = {
  intervalMs: 30 * 60 * 1000, // 30 minutes
  model: "claude-haiku-4-5-20251001",
  prompt:
    "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.",
  adapter: "console",
  ackMaxChars: 300,
};
