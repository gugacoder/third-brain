import { describe, it, expect, afterEach } from "vitest";
import { applySkillEnvOverrides } from "../env-overrides.js";
import type { Skill } from "../types.js";

function makeSkill(name: string, primaryEnv?: string): Skill {
  return {
    name,
    description: `${name} skill`,
    body: "body",
    source: "workspace",
    dir: `/tmp/${name}`,
    metadata: primaryEnv ? { primaryEnv } : undefined,
  };
}

// Clean up any env vars we set
const envKeysToClean: string[] = [];
afterEach(() => {
  for (const key of envKeysToClean) {
    delete process.env[key];
  }
  envKeysToClean.length = 0;
});

function setEnv(key: string, value: string): void {
  envKeysToClean.push(key);
  process.env[key] = value;
}

describe("applySkillEnvOverrides", () => {
  it("sets env overrides from SKILL_*_ENV_* into process.env", () => {
    setEnv("SKILL_WEATHER_ENV_WTTR_CITY", "London");

    const restore = applySkillEnvOverrides([makeSkill("weather")]);

    expect(process.env.WTTR_CITY).toBe("London");
    restore();
    expect(process.env.WTTR_CITY).toBeUndefined();
  });

  it("sets apiKey into primaryEnv", () => {
    setEnv("SKILL_MYSKILL_API_KEY", "sk-test-123");

    const restore = applySkillEnvOverrides([makeSkill("myskill", "MY_SERVICE_KEY")]);

    expect(process.env.MY_SERVICE_KEY).toBe("sk-test-123");
    restore();
    expect(process.env.MY_SERVICE_KEY).toBeUndefined();
  });

  it("does not overwrite existing env vars", () => {
    setEnv("EXISTING_VAR", "original");
    setEnv("SKILL_TEST_ENV_EXISTING_VAR", "override-attempt");

    const restore = applySkillEnvOverrides([makeSkill("test")]);

    expect(process.env.EXISTING_VAR).toBe("original");
    restore();
    expect(process.env.EXISTING_VAR).toBe("original");
  });

  it("handles multiple skills", () => {
    setEnv("SKILL_ALPHA_ENV_A_VAR", "a-value");
    setEnv("SKILL_BETA_ENV_B_VAR", "b-value");

    const restore = applySkillEnvOverrides([makeSkill("alpha"), makeSkill("beta")]);

    expect(process.env.A_VAR).toBe("a-value");
    expect(process.env.B_VAR).toBe("b-value");
    restore();
    expect(process.env.A_VAR).toBeUndefined();
    expect(process.env.B_VAR).toBeUndefined();
  });

  it("restore is a no-op when no overrides applied", () => {
    const restore = applySkillEnvOverrides([]);
    expect(() => restore()).not.toThrow();
  });
});
