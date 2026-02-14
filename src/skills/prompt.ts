import type { Skill } from "./types.js";

/**
 * Format eligible skills into a system prompt section.
 * Returns empty string when no skills are provided.
 */
export function formatSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const sections = skills.map((s) => {
    const header = s.description ? `## ${s.name}\n${s.description}` : `## ${s.name}`;
    return s.body ? `${header}\n\n${s.body}` : header;
  });

  return [
    "<available_skills>",
    "",
    sections.join("\n\n"),
    "",
    "</available_skills>",
    "",
    "The above skills provide domain-specific instructions. Follow them when relevant to the current task.",
  ].join("\n");
}
