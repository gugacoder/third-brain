import "dotenv/config";
import { HeartbeatRunner } from "./runner.js";
import { onHeartbeatEvent } from "./events.js";
import { DEFAULT_CONFIG } from "./types.js";
import type { HeartbeatConfig } from "./types.js";
import {
  buildSkillsSnapshot,
  loadAllSkills,
  shouldIncludeSkill,
  resolveSkillConfig,
  applySkillEnvOverrides,
} from "../skills/index.js";

function buildConfig(): HeartbeatConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and configure it.");
    process.exit(1);
  }

  const intervalMs = process.env.HEARTBEAT_INTERVAL_MS
    ? Number(process.env.HEARTBEAT_INTERVAL_MS)
    : DEFAULT_CONFIG.intervalMs;

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
    ...DEFAULT_CONFIG,
    intervalMs,
    workspaceDir: process.env.HEARTBEAT_WORKSPACE_DIR || process.cwd(),
    model: process.env.HEARTBEAT_MODEL || DEFAULT_CONFIG.model,
    adapter: process.env.HEARTBEAT_ADAPTER || DEFAULT_CONFIG.adapter,
    activeHours,
  };
}

async function main(): Promise<void> {
  const config = buildConfig();

  // Load skills
  const snapshot = buildSkillsSnapshot(config.workspaceDir);
  if (snapshot.prompt) {
    config.skillsPrompt = snapshot.prompt;
    console.log(
      `[heartbeat] loaded ${snapshot.skills.length} skill(s): ${snapshot.skills.map((s) => s.name).join(", ")}`,
    );
  }

  const eligible = loadAllSkills(config.workspaceDir).filter((s) =>
    shouldIncludeSkill(s, resolveSkillConfig(s.name)),
  );
  const restoreEnv = applySkillEnvOverrides(eligible);

  // Log every heartbeat event
  onHeartbeatEvent((evt) => {
    const prefix = `[heartbeat:${evt.status}]`;
    const parts: string[] = [prefix];
    if (evt.reason) parts.push(`reason=${evt.reason}`);
    if (evt.durationMs !== undefined) parts.push(`duration=${evt.durationMs}ms`);
    if (evt.preview) parts.push(`preview="${evt.preview.slice(0, 80)}"`);
    console.log(parts.join(" "));
  });

  const runner = new HeartbeatRunner(config);

  // Graceful shutdown
  const shutdown = () => {
    restoreEnv();
    runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Run once immediately, then start interval
  console.log("[heartbeat] running initial heartbeat...");
  await runner.runOnce();
  runner.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
