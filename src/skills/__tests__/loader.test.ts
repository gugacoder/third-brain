import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSkillFile, parseSkillMetadata, loadSkillsFromDir } from "../loader.js";

// ── parseSkillFile ────────────────────────────────────────────

describe("parseSkillFile", () => {
  it("parses valid SKILL.md with frontmatter and body", () => {
    const raw = `---
name: weather
description: Get weather forecasts.
---

# Weather
Use wttr.in for lookups.`;

    const result = parseSkillFile(raw);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("weather");
    expect(result!.frontmatter.description).toBe("Get weather forecasts.");
    expect(result!.body).toBe("# Weather\nUse wttr.in for lookups.");
  });

  it("returns null for file without frontmatter delimiters", () => {
    expect(parseSkillFile("# Just a markdown file")).toBeNull();
  });

  it("returns null for invalid YAML", () => {
    const raw = `---
: [invalid yaml
---

body`;
    expect(parseSkillFile(raw)).toBeNull();
  });

  it("handles empty body", () => {
    const raw = `---
name: empty
---
`;
    const result = parseSkillFile(raw);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("empty");
    expect(result!.body).toBe("");
  });

  it("handles metadata as nested object", () => {
    const raw = `---
name: test
metadata:
  third-brain:
    always: true
---

body`;

    const result = parseSkillFile(raw);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.metadata).toEqual({ "third-brain": { always: true } });
  });
});

// ── parseSkillMetadata ────────────────────────────────────────

describe("parseSkillMetadata", () => {
  it("extracts third-brain key from object", () => {
    const meta = parseSkillMetadata({
      "third-brain": { always: true, os: ["linux", "darwin"] },
    });
    expect(meta).toEqual({ always: true, os: ["linux", "darwin"] });
  });

  it("returns undefined when no third-brain key", () => {
    expect(parseSkillMetadata({ other: true })).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(parseSkillMetadata(undefined)).toBeUndefined();
  });

  it("parses JSON5 string input", () => {
    const meta = parseSkillMetadata(`{ "third-brain": { primaryEnv: "MY_KEY" } }`);
    expect(meta).toEqual({ primaryEnv: "MY_KEY" });
  });

  it("extracts requires.bins and requires.env", () => {
    const meta = parseSkillMetadata({
      "third-brain": {
        requires: { bins: ["curl", "jq"], env: ["API_KEY"] },
      },
    });
    expect(meta).toEqual({
      requires: { bins: ["curl", "jq"], env: ["API_KEY"] },
    });
  });

  it("returns undefined for invalid JSON5 string", () => {
    expect(parseSkillMetadata("not valid json")).toBeUndefined();
  });

  it("filters non-string values from arrays", () => {
    const meta = parseSkillMetadata({
      "third-brain": { os: ["linux", 42, "darwin", null] },
    });
    expect(meta!.os).toEqual(["linux", "darwin"]);
  });
});

// ── loadSkillsFromDir ─────────────────────────────────────────

describe("loadSkillsFromDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns [] for non-existent directory", () => {
    expect(loadSkillsFromDir("/nonexistent/path", "workspace")).toEqual([]);
  });

  it("returns [] for empty directory", () => {
    expect(loadSkillsFromDir(tmpDir, "managed")).toEqual([]);
  });

  it("loads a valid skill", () => {
    const skillDir = path.join(tmpDir, "weather");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `---
name: weather
description: Weather lookups.
---

Use wttr.in.`,
    );

    const skills = loadSkillsFromDir(tmpDir, "workspace");
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("weather");
    expect(skills[0].description).toBe("Weather lookups.");
    expect(skills[0].body).toBe("Use wttr.in.");
    expect(skills[0].source).toBe("workspace");
    expect(skills[0].dir).toBe(skillDir);
  });

  it("uses directory name as fallback skill name", () => {
    const skillDir = path.join(tmpDir, "my-skill");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `---
description: No name field.
---

body`,
    );

    const skills = loadSkillsFromDir(tmpDir, "workspace");
    expect(skills[0].name).toBe("my-skill");
  });

  it("skips directories without SKILL.md", () => {
    fs.mkdirSync(path.join(tmpDir, "no-skill"));
    expect(loadSkillsFromDir(tmpDir, "workspace")).toEqual([]);
  });

  it("skips unparseable SKILL.md files", () => {
    const skillDir = path.join(tmpDir, "bad");
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "no frontmatter here");

    const skills = loadSkillsFromDir(tmpDir, "workspace");
    expect(skills).toEqual([]);
  });

  it("loads multiple skills", () => {
    for (const name of ["alpha", "beta"]) {
      const d = path.join(tmpDir, name);
      fs.mkdirSync(d);
      fs.writeFileSync(
        path.join(d, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${name} skill.\n---\n\n${name} body.`,
      );
    }

    const skills = loadSkillsFromDir(tmpDir, "managed");
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name);
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
  });
});
