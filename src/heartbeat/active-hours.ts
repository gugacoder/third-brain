import type { HeartbeatConfig } from "./types.js";

const TIME_PATTERN = /^([01]\d|2[0-3]|24):([0-5]\d)$/;

function parseTime(raw: string | undefined, allow24: boolean): number | null {
  if (!raw || !TIME_PATTERN.test(raw)) return null;
  const [hourStr, minuteStr] = raw.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour === 24) {
    if (!allow24 || minute !== 0) return null;
    return 24 * 60;
  }
  return hour * 60 + minute;
}

function resolveTimezone(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "local") {
    const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return host?.trim() || "UTC";
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
}

function currentMinutesInZone(nowMs: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(nowMs));
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") map[part.type] = part.value;
    }
    const hour = Number(map.hour);
    const minute = Number(map.minute);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

/**
 * Returns true when the current time falls within the configured active hours.
 * If no active hours are configured, always returns true.
 */
export function isWithinActiveHours(config: HeartbeatConfig, nowMs?: number): boolean {
  const active = config.activeHours;
  if (!active) return true;

  const startMin = parseTime(active.start, false);
  const endMin = parseTime(active.end, true);
  if (startMin === null || endMin === null) return true;
  if (startMin === endMin) return true;

  const timeZone = resolveTimezone(active.timezone);
  const currentMin = currentMinutesInZone(nowMs ?? Date.now(), timeZone);
  if (currentMin === null) return true;

  // Normal range (e.g., 08:00 to 22:00)
  if (endMin > startMin) {
    return currentMin >= startMin && currentMin < endMin;
  }
  // Cross-midnight range (e.g., 22:00 to 06:00)
  return currentMin >= startMin || currentMin < endMin;
}
