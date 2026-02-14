# OpenClaw Skills System

The skills system is OpenClaw's plugin architecture. It lets the agent dynamically extend its capabilities through declarative, self-contained skill definitions that are discovered at load time, filtered by environment eligibility, and injected into the LLM system prompt.

## Skill Definition

Each skill is a directory containing a `SKILL.md` file. The file has YAML frontmatter (metadata) followed by markdown content (the actual instructions the LLM reads when it activates the skill).

```
my-skill/
  SKILL.md
  references/   # optional supporting files
```

### Frontmatter Schema

```yaml
---
name: nano-banana-pro
description: Generate or edit images via Gemini
homepage: https://example.com
metadata:
  {
    "openclaw": {
      "emoji": "...",
      "primaryEnv": "GEMINI_API_KEY",
      "os": ["darwin", "linux"],
      "requires": {
        "bins": ["ffmpeg"],
        "anyBins": ["python", "python3"],
        "env": ["API_KEY"],
        "config": ["browser.enabled"]
      },
      "install": [
        { "kind": "brew", "formula": "ffmpeg", "bins": ["ffmpeg"], "label": "Install ffmpeg (brew)" }
      ]
    }
  }
user-invocable: true
disable-model-invocation: false
command-dispatch: tool
command-tool: my_tool_name
command-arg-mode: raw
---
```

| Field | Purpose |
|---|---|
| `name` | Unique skill identifier |
| `description` | Short description shown in listings and prompt |
| `user-invocable` | If `true`, exposed as a `/slash-command` to the user |
| `disable-model-invocation` | If `true`, the LLM cannot invoke this skill on its own |
| `command-dispatch` | When set to `"tool"`, user invocation bypasses the LLM and calls a tool directly |
| `command-tool` / `command-arg-mode` | Which tool to call and how arguments are passed |
| `metadata.openclaw` | OpenClaw-specific metadata (see below) |

### OpenClaw Metadata

Defined in `src/agents/skills/types.ts`:

| Key | Type | Purpose |
|---|---|---|
| `always` | `boolean` | Include skill regardless of requirement checks |
| `skillKey` | `string` | Custom config key (defaults to skill name) |
| `primaryEnv` | `string` | Primary environment variable (receives `apiKey` from config) |
| `emoji` | `string` | Icon for UI display |
| `os` | `string[]` | Restrict to platforms (`darwin`, `linux`, `win32`) |
| `requires.bins` | `string[]` | All listed binaries must be on PATH |
| `requires.anyBins` | `string[]` | At least one binary must be on PATH |
| `requires.env` | `string[]` | All listed env vars must be set |
| `requires.config` | `string[]` | All listed config paths must be truthy |
| `install` | `SkillInstallSpec[]` | Automated install options for missing dependencies |

### Core Type Definitions

```
src/config/types.skills.ts      – SkillConfig, SkillsConfig
src/agents/skills/types.ts      – SkillEntry, SkillSnapshot, OpenClawSkillMetadata, SkillInvocationPolicy
src/agents/skills/frontmatter.ts – ParsedSkillFrontmatter, parsing logic
```

Key types:

- **`SkillEntry`** — a loaded skill plus its parsed frontmatter, OpenClaw metadata, and invocation policy.
- **`SkillSnapshot`** — the formatted prompt text plus resolved skill list, passed to the LLM run.
- **`SkillConfig`** — per-skill user config (`enabled`, `apiKey`, `env` overrides).

---

## Discovery & Loading

**File:** `src/agents/skills/workspace.ts` (lines 101-207)

Skills are loaded from multiple locations. Later sources override earlier ones (higher precedence wins):

| Priority | Source | Path |
|---|---|---|
| 1 (lowest) | Extra directories | Configured in `skills.load.extraDirs` |
| 2 | Bundled skills | Shipped with OpenClaw package |
| 3 | Plugin skills | Declared in `openclaw.plugin.json` |
| 4 | Managed skills | `~/.openclaw/skills/` |
| 5 | Personal agent skills | `~/.agents/skills/` |
| 6 | Project agent skills | `<workspace>/.agents/skills/` |
| 7 (highest) | Workspace skills | `<workspace>/skills/` |

Merging is done by name — a workspace skill with the same name as a bundled skill replaces it entirely.

### Bundled Skills Resolution

**File:** `src/agents/skills/bundled-dir.ts` (lines 36-90)

The bundled skills directory is resolved from:
1. `OPENCLAW_BUNDLED_SKILLS_DIR` env var (if set)
2. Sibling `skills/` directory next to the executable (bun --compile builds)
3. Relative to the OpenClaw package root

### Plugin Skills

**File:** `src/agents/skills/plugin-skills.ts` (lines 14-74)

Plugins declare skill directories in their `openclaw.plugin.json`. Skills are resolved relative to the plugin root and only loaded when the plugin is enabled.

---

## Eligibility & Filtering

**File:** `src/agents/skills/config.ts` (lines 114-191)

After discovery, each skill is checked for eligibility. A skill is **excluded** if any of these fail:

1. **Explicitly disabled** — `skills.entries.<name>.enabled: false` in config
2. **Not on allowlist** — bundled skills checked against `skills.allowBundled`
3. **OS mismatch** — `metadata.openclaw.os` doesn't include current platform
4. **Missing binaries** — `requires.bins` not all found on PATH
5. **Missing any-of binaries** — none of `requires.anyBins` found on PATH
6. **Missing env vars** — `requires.env` not set (checked in `process.env`, skill config `env`, and `apiKey` for `primaryEnv`)
7. **Missing config** — `requires.config` paths not truthy in app config

Exception: skills with `always: true` bypass all checks after OS and allowlist.

### Status Tracking

**File:** `src/agents/skills-status.ts` (lines 174-323)

Each skill's status is tracked with detail about why it is or isn't eligible — disabled, blocked by allowlist, missing deps (which bins, which env vars, etc.), and available install options.

---

## Configuration

### Global Config

```json5
{
  "skills": {
    "allowBundled": ["github", "1password"],   // allowlist for bundled skills (omit to allow all)
    "load": {
      "extraDirs": ["/path/to/more/skills"],
      "watch": true,
      "watchDebounceMs": 500
    },
    "install": {
      "preferBrew": true,
      "nodeManager": "pnpm"   // npm | pnpm | yarn | bun
    },
    "entries": {
      "nano-banana-pro": {
        "enabled": true,
        "apiKey": "sk-...",
        "env": { "GEMINI_API_KEY": "sk-..." },
        "config": {}
      }
    }
  }
}
```

### Environment Injection at Runtime

**File:** `src/agents/skills/env-overrides.ts` (lines 6-43)

Before each LLM run, environment variables from skill config are injected into `process.env`:

- `skills.entries.<name>.env` — each key-value pair is set if not already present
- `skills.entries.<name>.apiKey` — applied to the skill's `primaryEnv` variable if not already set

After the run completes, the original environment is restored.

---

## Integration with the LLM

### System Prompt

**Files:**
- `src/agents/pi-embedded-runner/run/attempt.ts` (lines 171-190)
- `src/agents/pi-embedded-runner/system-prompt.ts` (lines 11-78)

During run setup:

1. Eligible skill entries are loaded
2. Environment overrides are applied
3. Skills are formatted into a prompt block via `resolveSkillsPromptForRun()`
4. The prompt block is appended to the LLM system prompt

The system prompt tells the agent:

> Before replying, scan `<available_skills>` entries. If exactly one skill clearly applies, read its `SKILL.md`, then follow it. Never read more than one skill up front; only read after selecting.

This means the LLM **lazily reads** skill content — it sees names and descriptions in the system prompt but only reads the full `SKILL.md` when it decides a skill is relevant.

### User Invocation (Slash Commands)

**File:** `src/auto-reply/skill-commands.ts` (lines 25-142, 411-517)

Skills marked `user-invocable: true` are registered as slash commands (`/skillname`).

When the user types `/skillname args`:

1. The command name is resolved against registered skill command specs
2. Arguments are extracted
3. If the skill has `command-dispatch: tool`, the tool is called directly (bypassing the LLM)
4. Otherwise, the skill content and arguments are passed to the LLM for execution

---

## Installation

**File:** `src/agents/skills-install.ts` (lines 396-571)

Skills can declare install specs for their missing dependencies. Supported install kinds:

| Kind | Method |
|---|---|
| `brew` | Homebrew formula |
| `node` | npm/pnpm/yarn/bun package |
| `go` | `go install` |
| `uv` | uv tool manager |
| `download` | Direct download + optional extraction |

Installation flow:
1. Find the skill and its install spec
2. Build the install command based on `spec.kind`
3. Run a security scan of the skill directory
4. Execute the command with a timeout
5. Return result with any security warnings

---

## Lifecycle Summary

```
DEFINITION          A SKILL.md file with frontmatter + markdown instructions
     |
DISCOVERY           Loaded from 7 precedence-ordered locations, merged by name
     |
FILTERING           Checked against enabled/allowlist/OS/bins/env/config requirements
     |
CONFIGURATION       Per-skill env vars and API keys injected into process.env
     |
REGISTRATION        Eligible skills formatted and added to LLM system prompt;
                    user-invocable skills registered as /slash-commands
     |
EXECUTION           LLM-driven: agent reads SKILL.md when it decides the skill applies
                    User-driven: /command dispatches to tool or LLM
     |
CLEANUP             Environment restored after the run
```

---

## Key Source Files

| File | Purpose |
|---|---|
| `src/config/types.skills.ts` | Config type definitions |
| `src/agents/skills/types.ts` | Runtime type definitions |
| `src/agents/skills/workspace.ts` | Loading & building skill entries |
| `src/agents/skills/config.ts` | Filtering & eligibility logic |
| `src/agents/skills/frontmatter.ts` | YAML frontmatter parsing |
| `src/agents/skills/env-overrides.ts` | Environment variable injection |
| `src/agents/skills/plugin-skills.ts` | Plugin skill integration |
| `src/agents/skills/bundled-dir.ts` | Bundled skills directory resolution |
| `src/agents/skills-status.ts` | Status tracking & diagnostics |
| `src/agents/skills-install.ts` | Dependency installation |
| `src/auto-reply/skill-commands.ts` | Slash command registration & dispatch |
| `src/agents/pi-embedded-runner/run/attempt.ts` | LLM run setup (skill loading) |
| `src/agents/pi-embedded-runner/system-prompt.ts` | System prompt construction |
| `src/cli/skills-cli.ts` | CLI commands for skill management |
