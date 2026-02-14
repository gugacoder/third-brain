import { Hono } from "hono";
import type { Env } from "../context.js";

const chat = new Hono<Env>();

chat.get("/sessions", async (c) => {
  const ctx = c.get("ctx");
  const sessions = await ctx.chat.listSessions();
  return c.json({ sessions });
});

chat.post("/", async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{ sessionId: string; message: string }>();

  if (!body.sessionId || !body.message?.trim()) {
    return c.json({ error: "sessionId and message are required" }, 400);
  }

  // Fire and forget — tokens arrive via SSE
  ctx.chat.sendMessage(body.sessionId, body.message).catch((err) => {
    console.error("[chat] sendMessage error:", err);
  });

  return c.json({ ok: true, sessionId: body.sessionId });
});

chat.get("/:sessionId/messages", async (c) => {
  const ctx = c.get("ctx");
  const sessionId = c.req.param("sessionId");
  const messages = await ctx.chat.getMessages(sessionId);
  return c.json({ messages });
});

chat.post("/abort", async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{ sessionId: string }>();

  if (!body.sessionId) {
    return c.json({ error: "sessionId is required" }, 400);
  }

  const aborted = ctx.chat.abort(body.sessionId);
  return c.json({ ok: true, aborted });
});

chat.patch("/:sessionId", async (c) => {
  const ctx = c.get("ctx");
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json<{ title: string }>();

  if (!body.title?.trim()) {
    return c.json({ error: "title is required" }, 400);
  }

  const ok = await ctx.chat.renameSession(sessionId, body.title.trim());
  return c.json({ ok });
});

chat.delete("/:sessionId", async (c) => {
  const ctx = c.get("ctx");
  const sessionId = c.req.param("sessionId");
  const ok = await ctx.chat.deleteSession(sessionId);
  return c.json({ ok });
});

export { chat };
