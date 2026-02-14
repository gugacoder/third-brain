import { HEARTBEAT_OK } from "./tokens.js";

export const HEARTBEAT_PROMPT =
  "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.";

export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;

/**
 * A file is considered effectively empty if it contains only
 * whitespace, markdown headers (# ...), or empty list items.
 */
export function isHeartbeatContentEffectivelyEmpty(content: string | undefined | null): boolean {
  if (content === undefined || content === null) return false;
  if (typeof content !== "string") return false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#+(\s|$)/.test(trimmed)) continue;
    if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(trimmed)) continue;
    // Skip HTML comments (single-line <!-- ... -->)
    if (/^<!--.*-->$/.test(trimmed)) continue;
    return false;
  }
  return true;
}

function stripTokenAtEdges(raw: string): { text: string; didStrip: boolean } {
  let text = raw.trim();
  if (!text) return { text: "", didStrip: false };

  const token = HEARTBEAT_OK;
  if (!text.includes(token)) return { text, didStrip: false };

  let didStrip = false;
  let changed = true;
  while (changed) {
    changed = false;
    const next = text.trim();
    if (next.startsWith(token)) {
      text = next.slice(token.length).trimStart();
      didStrip = true;
      changed = true;
      continue;
    }
    if (next.endsWith(token)) {
      text = next.slice(0, Math.max(0, next.length - token.length)).trimEnd();
      didStrip = true;
      changed = true;
    }
  }

  return { text: text.replace(/\s+/g, " ").trim(), didStrip };
}

export type StripHeartbeatMode = "heartbeat" | "message";

export function stripHeartbeatToken(
  raw?: string,
  opts: { mode?: StripHeartbeatMode; maxAckChars?: number } = {},
) {
  if (!raw?.trim()) return { shouldSkip: true, text: "", didStrip: false };

  const trimmed = raw.trim();
  const mode: StripHeartbeatMode = opts.mode ?? "message";
  const maxAckChars = Math.max(
    0,
    typeof opts.maxAckChars === "number" && Number.isFinite(opts.maxAckChars)
      ? opts.maxAckChars
      : DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  );

  // Normalize lightweight markup so HEARTBEAT_OK wrapped in HTML/Markdown still strips.
  const stripMarkup = (text: string) =>
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/^[*`~_]+/, "")
      .replace(/[*`~_]+$/, "");

  const normalized = stripMarkup(trimmed);
  if (!trimmed.includes(HEARTBEAT_OK) && !normalized.includes(HEARTBEAT_OK)) {
    return { shouldSkip: false, text: trimmed, didStrip: false };
  }

  const strippedOriginal = stripTokenAtEdges(trimmed);
  const strippedNormalized = stripTokenAtEdges(normalized);
  const picked =
    strippedOriginal.didStrip && strippedOriginal.text ? strippedOriginal : strippedNormalized;

  if (!picked.didStrip) return { shouldSkip: false, text: trimmed, didStrip: false };
  if (!picked.text) return { shouldSkip: true, text: "", didStrip: true };

  const rest = picked.text.trim();
  if (mode === "heartbeat" && rest.length <= maxAckChars) {
    return { shouldSkip: true, text: "", didStrip: true };
  }
  return { shouldSkip: false, text: rest, didStrip: true };
}
