import { Hono } from "hono";
import type { Env } from "../context.js";

const memory = new Hono<Env>();

memory.get("/status", async (c) => {
  const ctx = c.get("ctx");
  const status = await ctx.memory.status();
  return c.json(status);
});

memory.post("/search", async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{
    query: string;
    maxResults?: number;
    minScore?: number;
  }>();

  if (!body.query?.trim()) {
    return c.json({ error: "query is required" }, 400);
  }

  const results = await ctx.memory.search(body.query, {
    maxResults: body.maxResults,
    minScore: body.minScore,
  });

  return c.json({ results });
});

memory.post("/sync", async (c) => {
  const ctx = c.get("ctx");
  await ctx.memory.sync({ force: true });
  return c.json({ ok: true });
});

export { memory };
