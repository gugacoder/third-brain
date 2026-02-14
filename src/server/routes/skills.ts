import { Hono } from "hono";
import type { Env } from "../context.js";
import {
  loadAllSkills,
  shouldIncludeSkill,
  resolveSkillConfig,
} from "../../skills/index.js";

const skills = new Hono<Env>();

skills.get("/", (c) => {
  const ctx = c.get("ctx");
  const all = loadAllSkills(ctx.workspaceDir);

  const result = all.map((skill) => {
    const config = resolveSkillConfig(skill.name);
    const eligible = shouldIncludeSkill(skill, config);

    return {
      name: skill.name,
      description: skill.description,
      source: skill.source,
      eligible,
      metadata: skill.metadata,
    };
  });

  return c.json({ skills: result });
});

export { skills };
