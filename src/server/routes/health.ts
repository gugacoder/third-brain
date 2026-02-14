import { Hono } from "hono";
import type { Env } from "../context.js";
import { getLastHeartbeatEvent } from "../../heartbeat/events.js";

const health = new Hono<Env>();

health.get("/", async (c) => {
  const ctx = c.get("ctx");

  let memoryStatus;
  try {
    memoryStatus = await ctx.memory.status();
  } catch {
    memoryStatus = null;
  }

  const lastHeartbeat = getLastHeartbeatEvent();

  return c.json({
    uptime: Date.now() - ctx.startedAt,
    startedAt: ctx.startedAt,
    memory: memoryStatus
      ? {
          provider: memoryStatus.provider,
          files: memoryStatus.files,
          chunks: memoryStatus.chunks,
        }
      : null,
    heartbeat: {
      running: ctx.heartbeat.running,
      lastEvent: lastHeartbeat,
    },
  });
});

export { health };
