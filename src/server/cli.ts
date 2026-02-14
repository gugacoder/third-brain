import "dotenv/config";
import { serve } from "@hono/node-server";
import { MemoryManager } from "../memory/manager.js";
import { HeartbeatRunner } from "../heartbeat/runner.js";
import { onHeartbeatEvent } from "../heartbeat/events.js";
import { DEFAULT_CONFIG as HEARTBEAT_DEFAULTS } from "../heartbeat/types.js";
import { DEFAULT_CONFIG as MEMORY_DEFAULTS } from "../memory/types.js";
import {
  buildSkillsSnapshot,
  loadAllSkills,
  shouldIncludeSkill,
  resolveSkillConfig,
  applySkillEnvOverrides,
} from "../skills/index.js";
import { ChatManager } from "./chat.js";
import { createApp } from "./app.js";
import type { ServerContext } from "./context.js";
import type { HeartbeatConfig } from "../heartbeat/types.js";
import type { MemoryConfig } from "../memory/types.js";

function buildMemoryConfig(): MemoryConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "Error: DATABASE_URL is not set. Copy .env.example to .env and configure it.",
    );
    process.exit(1);
  }

  return {
    ...MEMORY_DEFAULTS,
    databaseUrl,
    workspaceDir: process.cwd(),
    embeddingProvider: process.env.EMBEDDING_PROVIDER || "openai",
  };
}

function buildHeartbeatConfig(): HeartbeatConfig {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and configure it.",
    );
    process.exit(1);
  }

  const intervalMs = process.env.HEARTBEAT_INTERVAL_MS
    ? Number(process.env.HEARTBEAT_INTERVAL_MS)
    : HEARTBEAT_DEFAULTS.intervalMs;

  const activeStart = process.env.HEARTBEAT_ACTIVE_START;
  const activeEnd = process.env.HEARTBEAT_ACTIVE_END;
  const activeHours =
    activeStart && activeEnd
      ? {
          start: activeStart,
          end: activeEnd,
          timezone: process.env.HEARTBEAT_TIMEZONE,
        }
      : undefined;

  return {
    ...HEARTBEAT_DEFAULTS,
    intervalMs,
    workspaceDir: process.env.HEARTBEAT_WORKSPACE_DIR || process.cwd(),
    model: process.env.HEARTBEAT_MODEL || HEARTBEAT_DEFAULTS.model,
    adapter: process.env.HEARTBEAT_ADAPTER || HEARTBEAT_DEFAULTS.adapter,
    activeHours,
  };
}

async function main(): Promise<void> {
  const port = parseInt(process.env.PORT || "5001", 10);
  const workspaceDir = process.cwd();
  const autostart = process.env.HEARTBEAT_AUTOSTART !== "false";

  // --- Memory ---
  const memoryConfig = buildMemoryConfig();
  const memory = new MemoryManager(memoryConfig);
  await memory.init();
  console.log("[server] memory manager initialized");

  // --- Heartbeat ---
  const heartbeatConfig = buildHeartbeatConfig();

  // Load skills
  const snapshot = buildSkillsSnapshot(workspaceDir);
  if (snapshot.prompt) {
    heartbeatConfig.skillsPrompt = snapshot.prompt;
    console.log(
      `[server] loaded ${snapshot.skills.length} skill(s): ${snapshot.skills.map((s) => s.name).join(", ")}`,
    );
  }

  const eligible = loadAllSkills(workspaceDir).filter((s) =>
    shouldIncludeSkill(s, resolveSkillConfig(s.name)),
  );
  const restoreEnv = applySkillEnvOverrides(eligible);

  const heartbeat = new HeartbeatRunner(heartbeatConfig);

  // Log heartbeat events
  onHeartbeatEvent((evt) => {
    const prefix = `[heartbeat:${evt.status}]`;
    const parts: string[] = [prefix];
    if (evt.reason) parts.push(`reason=${evt.reason}`);
    if (evt.durationMs !== undefined) parts.push(`duration=${evt.durationMs}ms`);
    if (evt.preview) parts.push(`preview="${evt.preview.slice(0, 80)}"`);
    console.log(parts.join(" "));
  });

  if (autostart) {
    heartbeat.start();
    console.log("[server] heartbeat daemon started");
  }

  // --- Chat ---
  const chat = new ChatManager({
    model: process.env.CHAT_MODEL,
    databaseUrl: memoryConfig.databaseUrl,
  });
  await chat.init();
  console.log("[server] chat manager initialized");

  // --- Server ---
  const ctx: ServerContext = {
    memory,
    heartbeat,
    chat,
    workspaceDir,
    startedAt: Date.now(),
  };

  const app = createApp(ctx);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("[server] shutting down...");
    restoreEnv();
    heartbeat.stop();
    server.close();
    Promise.all([memory.close(), chat.close()]).then(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
