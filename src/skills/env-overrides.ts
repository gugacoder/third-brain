import type { Skill, SkillConfig } from "./types.js";
import { resolveSkillConfig } from "./filter.js";

/**
 * Apply environment overrides from eligible skills into process.env.
 * Returns a restore function that reverts all changes.
 *
 * Sets config.env entries and config.apiKey → primaryEnv into process.env
 * only when the key is not already set.
 */
export function applySkillEnvOverrides(skills: Skill[]): () => void {
  const originals: Array<{ key: string; value: string | undefined }> = [];

  for (const skill of skills) {
    const config = resolveSkillConfig(skill.name);
    setEntries(config, skill, originals);
  }

  return () => {
    for (const { key, value } of originals) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

function setEntries(
  config: SkillConfig,
  skill: Skill,
  originals: Array<{ key: string; value: string | undefined }>,
): void {
  // config.env entries
  if (config.env) {
    for (const [key, value] of Object.entries(config.env)) {
      if (process.env[key] === undefined) {
        originals.push({ key, value: process.env[key] });
        process.env[key] = value;
      }
    }
  }

  // config.apiKey → primaryEnv
  if (config.apiKey && skill.metadata?.primaryEnv) {
    const key = skill.metadata.primaryEnv;
    if (process.env[key] === undefined) {
      originals.push({ key, value: process.env[key] });
      process.env[key] = config.apiKey;
    }
  }
}
