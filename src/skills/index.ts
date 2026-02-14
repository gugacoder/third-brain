import os from "node:os";
import path from "node:path";
import { loadSkillsFromDir } from "./loader.js";
import { shouldIncludeSkill, resolveSkillConfig } from "./filter.js";
import { formatSkillsPrompt } from "./prompt.js";
import type { Skill, SkillsSnapshot } from "./types.js";

export { loadSkillsFromDir } from "./loader.js";
export { parseSkillFile, parseSkillMetadata } from "./loader.js";
export { shouldIncludeSkill, resolveSkillConfig, hasBinary } from "./filter.js";
export { applySkillEnvOverrides } from "./env-overrides.js";
export { formatSkillsPrompt } from "./prompt.js";
export type { Skill, SkillConfig, SkillMetadata, SkillSource, SkillsSnapshot } from "./types.js";

/**
 * Load all skills from managed (~/.third-brain/skills/) and workspace (skills/) dirs.
 * Workspace skills override managed skills by name.
 */
export function loadAllSkills(workspaceDir: string): Skill[] {
  const managedDir = path.join(os.homedir(), ".third-brain", "skills");
  const workspaceSkillsDir = path.join(workspaceDir, "skills");

  const managed = loadSkillsFromDir(managedDir, "managed");
  const workspace = loadSkillsFromDir(workspaceSkillsDir, "workspace");

  // Merge: managed first, workspace overrides by name
  const map = new Map<string, Skill>();
  for (const skill of managed) map.set(skill.name, skill);
  for (const skill of workspace) map.set(skill.name, skill);

  return Array.from(map.values());
}

/**
 * Build a snapshot of all eligible skills with their formatted prompt.
 */
export function buildSkillsSnapshot(workspaceDir: string): SkillsSnapshot {
  const all = loadAllSkills(workspaceDir);
  const eligible = all.filter((s) => shouldIncludeSkill(s, resolveSkillConfig(s.name)));
  const prompt = formatSkillsPrompt(eligible);
  return { skills: eligible, prompt };
}
