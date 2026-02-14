import { Hono } from "hono";
import type { Env } from "../context.js";
import { getLastHeartbeatEvent } from "../../heartbeat/events.js";

const heartbeat = new Hono<Env>();

heartbeat.get("/status", (c) => {
  const ctx = c.get("ctx");
  return c.json({
    running: ctx.heartbeat.running,
    lastEvent: getLastHeartbeatEvent(),
  });
});

heartbeat.post("/run", async (c) => {
  const ctx = c.get("ctx");
  const result = await ctx.heartbeat.runOnce();
  return c.json(result);
});

heartbeat.post("/start", (c) => {
  const ctx = c.get("ctx");
  ctx.heartbeat.start();
  return c.json({ ok: true, running: true });
});

heartbeat.post("/stop", (c) => {
  const ctx = c.get("ctx");
  ctx.heartbeat.stop();
  return c.json({ ok: true, running: false });
});

export { heartbeat };
