import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import JSON5 from "json5";
import type { Skill, SkillMetadata, SkillSource } from "./types.js";

export type ParsedSkillFile = {
  frontmatter: Record<string, unknown>;
  body: string;
};

/**
 * Parse a SKILL.md file into frontmatter + body.
 * Returns null if the file doesn't have valid YAML frontmatter.
 */
export function parseSkillFile(raw: string): ParsedSkillFile | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;

  try {
    const frontmatter = parseYaml(match[1]) as Record<string, unknown>;
    if (!frontmatter || typeof frontmatter !== "object") return null;
    return { frontmatter, body: match[2].trim() };
  } catch {
    return null;
  }
}

/**
 * Extract third-brain metadata from the frontmatter `metadata` field.
 * Supports JSON5 string or plain object. Returns undefined if missing/invalid.
 */
export function parseSkillMetadata(
  raw: Record<string, unknown> | string | undefined,
): SkillMetadata | undefined {
  if (raw === undefined || raw === null) return undefined;

  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      obj = JSON5.parse(raw) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else {
    return undefined;
  }

  const tb = obj["third-brain"] as Record<string, unknown> | undefined;
  if (!tb || typeof tb !== "object") return undefined;

  const meta: SkillMetadata = {};

  if (typeof tb.always === "boolean") meta.always = tb.always;
  if (typeof tb.primaryEnv === "string") meta.primaryEnv = tb.primaryEnv;
  if (Array.isArray(tb.os)) meta.os = tb.os.filter((v): v is string => typeof v === "string");

  if (tb.requires && typeof tb.requires === "object") {
    const req = tb.requires as Record<string, unknown>;
    meta.requires = {};
    if (Array.isArray(req.bins))
      meta.requires.bins = req.bins.filter((v): v is string => typeof v === "string");
    if (Array.isArray(req.env))
      meta.requires.env = req.env.filter((v): v is string => typeof v === "string");
  }

  return meta;
}

/**
 * Load all skills from a directory. Each subdirectory containing a SKILL.md
 * is treated as a skill. Non-existent directory returns []. Unparseable
 * skills are skipped with a warning.
 */
export function loadSkillsFromDir(dir: string, source: SkillSource): Skill[] {
  if (!fs.existsSync(dir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(dir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");

    if (!fs.existsSync(skillFile)) continue;

    let raw: string;
    try {
      raw = fs.readFileSync(skillFile, "utf-8");
    } catch {
      console.warn(`[skills] failed to read ${skillFile}, skipping`);
      continue;
    }

    const parsed = parseSkillFile(raw);
    if (!parsed) {
      console.warn(`[skills] failed to parse ${skillFile}, skipping`);
      continue;
    }

    const { frontmatter, body } = parsed;
    const name = typeof frontmatter.name === "string" ? frontmatter.name : entry.name;
    const description =
      typeof frontmatter.description === "string" ? frontmatter.description : "";
    const metadata = parseSkillMetadata(
      frontmatter.metadata as Record<string, unknown> | string | undefined,
    );

    skills.push({ name, description, body, source, dir: skillDir, metadata });
  }

  return skills;
}
