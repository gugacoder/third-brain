import { describe, it, expect } from "vitest";
import { formatSkillsPrompt } from "../prompt.js";
import type { Skill } from "../types.js";

function makeSkill(name: string, description: string, body: string): Skill {
  return { name, description, body, source: "workspace", dir: `/tmp/${name}` };
}

describe("formatSkillsPrompt", () => {
  it("returns empty string for no skills", () => {
    expect(formatSkillsPrompt([])).toBe("");
  });

  it("formats a single skill", () => {
    const prompt = formatSkillsPrompt([makeSkill("weather", "Get weather.", "Use wttr.in.")]);

    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("</available_skills>");
    expect(prompt).toContain("## weather");
    expect(prompt).toContain("Get weather.");
    expect(prompt).toContain("Use wttr.in.");
    expect(prompt).toContain(
      "The above skills provide domain-specific instructions. Follow them when relevant to the current task.",
    );
  });

  it("formats multiple skills", () => {
    const prompt = formatSkillsPrompt([
      makeSkill("weather", "Weather lookups.", "Use wttr.in."),
      makeSkill("github", "GitHub integration.", "Use gh CLI."),
    ]);

    expect(prompt).toContain("## weather");
    expect(prompt).toContain("## github");
    expect(prompt).toContain("Use wttr.in.");
    expect(prompt).toContain("Use gh CLI.");
  });

  it("handles skill with no description", () => {
    const prompt = formatSkillsPrompt([makeSkill("bare", "", "Just a body.")]);
    expect(prompt).toContain("## bare");
    expect(prompt).toContain("Just a body.");
  });

  it("handles skill with no body", () => {
    const prompt = formatSkillsPrompt([makeSkill("header-only", "Description only.", "")]);
    expect(prompt).toContain("## header-only");
    expect(prompt).toContain("Description only.");
  });
});
