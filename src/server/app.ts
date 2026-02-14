import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ServerContext, Env } from "./context.js";
import { health } from "./routes/health.js";
import { memory } from "./routes/memory.js";
import { heartbeat } from "./routes/heartbeat.js";
import { skills } from "./routes/skills.js";
import { chat } from "./routes/chat.js";
import { heartbeatSSE } from "./sse/heartbeat.js";
import { chatSSE } from "./sse/chat.js";

export function createApp(ctx: ServerContext): Hono<Env> {
  const app = new Hono<Env>();

  // CORS for dev
  app.use("*", cors());

  // Context injection
  app.use("*", async (c, next) => {
    c.set("ctx", ctx);
    await next();
  });

  // API routes
  app.route("/api/health", health);
  app.route("/api/memory", memory);
  app.route("/api/heartbeat", heartbeat);
  app.route("/api/skills", skills);
  app.route("/api/chat", chat);

  // SSE routes
  app.route("/sse/heartbeat", heartbeatSSE);
  app.route("/sse/chat", chatSSE);

  // Static serving (production)
  const distDir = path.resolve("apps/dashboard/dist");
  if (fs.existsSync(distDir)) {
    app.use("*", serveStatic({ root: "./apps/dashboard/dist" }));
    // SPA fallback
    app.get("*", (c) => {
      const html = fs.readFileSync(
        path.join(distDir, "index.html"),
        "utf-8",
      );
      return c.html(html);
    });
  }

  return app;
}
