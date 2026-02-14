import { execSync } from "node:child_process";
import type { Skill, SkillConfig, SkillMetadata } from "./types.js";

/**
 * Check if a binary is available on PATH.
 * On Windows, also checks .exe/.cmd/.bat extensions.
 */
export function hasBinary(name: string): boolean {
  const isWin = process.platform === "win32";
  const cmd = isWin ? `where ${name}` : `which ${name}`;

  try {
    execSync(cmd, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve per-skill config from environment variables.
 *
 * Pattern: SKILL_{NAME}_ENABLED, SKILL_{NAME}_API_KEY, SKILL_{NAME}_ENV_{VAR}
 */
export function resolveSkillConfig(skillName: string): SkillConfig {
  const prefix = `SKILL_${skillName.toUpperCase().replace(/-/g, "_")}`;
  const config: SkillConfig = {};

  const enabled = process.env[`${prefix}_ENABLED`];
  if (enabled !== undefined) {
    config.enabled = enabled.toLowerCase() !== "false" && enabled !== "0";
  }

  const apiKey = process.env[`${prefix}_API_KEY`];
  if (apiKey) {
    config.apiKey = apiKey;
  }

  // Collect SKILL_{NAME}_ENV_{VAR}=value entries
  const envPrefix = `${prefix}_ENV_`;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(envPrefix) && value !== undefined) {
      const varName = key.slice(envPrefix.length);
      env[varName] = value;
    }
  }
  if (Object.keys(env).length > 0) {
    config.env = env;
  }

  return config;
}

/**
 * Determine whether a skill should be included based on metadata and config.
 */
export function shouldIncludeSkill(skill: Skill, config?: SkillConfig): boolean {
  // 1. Explicitly disabled
  if (config?.enabled === false) return false;

  const meta: SkillMetadata | undefined = skill.metadata;

  // 2. OS check
  if (meta?.os && meta.os.length > 0) {
    if (!meta.os.includes(process.platform)) return false;
  }

  // 3. always === true skips remaining checks
  if (meta?.always === true) return true;

  // 4. Binary requirements
  if (meta?.requires?.bins) {
    for (const bin of meta.requires.bins) {
      if (!hasBinary(bin)) return false;
    }
  }

  // 5. Environment variable requirements
  if (meta?.requires?.env) {
    for (const envVar of meta.requires.env) {
      const hasIt =
        !!process.env[envVar] ||
        !!(config?.env && config.env[envVar]) ||
        (meta.primaryEnv === envVar && !!config?.apiKey);
      if (!hasIt) return false;
    }
  }

  return true;
}
