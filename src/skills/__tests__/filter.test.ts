import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { shouldIncludeSkill, resolveSkillConfig, hasBinary } from "../filter.js";
import type { Skill, SkillConfig } from "../types.js";

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: "test",
    description: "Test skill.",
    body: "body",
    source: "workspace",
    dir: "/tmp/test",
    ...overrides,
  };
}

// ── shouldIncludeSkill ────────────────────────────────────────

describe("shouldIncludeSkill", () => {
  it("includes a skill with no metadata and no config", () => {
    expect(shouldIncludeSkill(makeSkill())).toBe(true);
  });

  it("excludes when config.enabled is false", () => {
    expect(shouldIncludeSkill(makeSkill(), { enabled: false })).toBe(false);
  });

  it("excludes when OS doesn't match", () => {
    const skill = makeSkill({
      metadata: { os: ["nonexistent-os"] },
    });
    expect(shouldIncludeSkill(skill)).toBe(false);
  });

  it("includes when OS matches current platform", () => {
    const skill = makeSkill({
      metadata: { os: [process.platform] },
    });
    expect(shouldIncludeSkill(skill)).toBe(true);
  });

  it("includes always=true even when bins are missing", () => {
    const skill = makeSkill({
      metadata: {
        always: true,
        requires: { bins: ["nonexistent_binary_xyz_123"] },
      },
    });
    expect(shouldIncludeSkill(skill)).toBe(true);
  });

  it("excludes when a required binary is missing", () => {
    const skill = makeSkill({
      metadata: {
        requires: { bins: ["nonexistent_binary_xyz_123"] },
      },
    });
    expect(shouldIncludeSkill(skill)).toBe(false);
  });

  it("includes when required binary exists", () => {
    // 'node' should be available in the test environment
    const skill = makeSkill({
      metadata: { requires: { bins: ["node"] } },
    });
    expect(shouldIncludeSkill(skill)).toBe(true);
  });

  it("excludes when required env var is missing", () => {
    const skill = makeSkill({
      metadata: { requires: { env: ["NONEXISTENT_TEST_VAR_XYZ"] } },
    });
    expect(shouldIncludeSkill(skill)).toBe(false);
  });

  it("includes when required env var is set in process.env", () => {
    const envKey = "TEST_SKILL_FILTER_VAR_" + Date.now();
    process.env[envKey] = "value";
    try {
      const skill = makeSkill({
        metadata: { requires: { env: [envKey] } },
      });
      expect(shouldIncludeSkill(skill)).toBe(true);
    } finally {
      delete process.env[envKey];
    }
  });

  it("includes when required env var is provided via config.env", () => {
    const skill = makeSkill({
      metadata: { requires: { env: ["SOME_VAR"] } },
    });
    const config: SkillConfig = { env: { SOME_VAR: "value" } };
    expect(shouldIncludeSkill(skill, config)).toBe(true);
  });

  it("includes when required env var matches primaryEnv with apiKey", () => {
    const skill = makeSkill({
      metadata: { primaryEnv: "MY_API_KEY", requires: { env: ["MY_API_KEY"] } },
    });
    const config: SkillConfig = { apiKey: "sk-test" };
    expect(shouldIncludeSkill(skill, config)).toBe(true);
  });

  it("OS check takes precedence over always", () => {
    const skill = makeSkill({
      metadata: { always: true, os: ["nonexistent-os"] },
    });
    expect(shouldIncludeSkill(skill)).toBe(false);
  });
});

// ── resolveSkillConfig ────────────────────────────────────────

describe("resolveSkillConfig", () => {
  const prefix = "SKILL_TEST_RESOLVE";

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith(prefix)) delete process.env[key];
    }
  });

  it("returns empty config when no env vars set", () => {
    const config = resolveSkillConfig("test-resolve");
    expect(config.enabled).toBeUndefined();
    expect(config.apiKey).toBeUndefined();
    expect(config.env).toBeUndefined();
  });

  it("reads ENABLED=false", () => {
    process.env[`${prefix}_ENABLED`] = "false";
    expect(resolveSkillConfig("test-resolve").enabled).toBe(false);
  });

  it("reads ENABLED=true", () => {
    process.env[`${prefix}_ENABLED`] = "true";
    expect(resolveSkillConfig("test-resolve").enabled).toBe(true);
  });

  it("reads ENABLED=0 as false", () => {
    process.env[`${prefix}_ENABLED`] = "0";
    expect(resolveSkillConfig("test-resolve").enabled).toBe(false);
  });

  it("reads API_KEY", () => {
    process.env[`${prefix}_API_KEY`] = "sk-abc";
    expect(resolveSkillConfig("test-resolve").apiKey).toBe("sk-abc");
  });

  it("reads ENV_ entries", () => {
    process.env[`${prefix}_ENV_FOO`] = "bar";
    process.env[`${prefix}_ENV_BAZ`] = "qux";
    const config = resolveSkillConfig("test-resolve");
    expect(config.env).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("normalizes skill name with hyphens", () => {
    process.env["SKILL_MY_SKILL_ENABLED"] = "false";
    expect(resolveSkillConfig("my-skill").enabled).toBe(false);
    delete process.env["SKILL_MY_SKILL_ENABLED"];
  });
});

// ── hasBinary ─────────────────────────────────────────────────

describe("hasBinary", () => {
  it("returns true for node", () => {
    expect(hasBinary("node")).toBe(true);
  });

  it("returns false for nonexistent binary", () => {
    expect(hasBinary("nonexistent_binary_xyz_123")).toBe(false);
  });
});
