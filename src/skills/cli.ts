import "dotenv/config";
import { loadAllSkills, shouldIncludeSkill, resolveSkillConfig } from "./index.js";

function cmdList(workspaceDir: string): void {
  const skills = loadAllSkills(workspaceDir);

  if (skills.length === 0) {
    console.log("No skills found.");
    return;
  }

  console.log("Skills");
  console.log("======\n");
  console.log(
    `${"Name".padEnd(20)} ${"Source".padEnd(12)} ${"Eligible".padEnd(10)} Description`,
  );
  console.log(`${"─".repeat(20)} ${"─".repeat(12)} ${"─".repeat(10)} ${"─".repeat(30)}`);

  for (const skill of skills) {
    const config = resolveSkillConfig(skill.name);
    const eligible = shouldIncludeSkill(skill, config);
    console.log(
      `${skill.name.padEnd(20)} ${skill.source.padEnd(12)} ${(eligible ? "yes" : "no").padEnd(10)} ${skill.description}`,
    );
  }

  console.log(`\n${skills.length} skill(s) found.`);
}

function cmdStatus(workspaceDir: string): void {
  const skills = loadAllSkills(workspaceDir);

  if (skills.length === 0) {
    console.log("No skills found.");
    return;
  }

  console.log("Skills Status");
  console.log("=============\n");

  for (const skill of skills) {
    const config = resolveSkillConfig(skill.name);
    const eligible = shouldIncludeSkill(skill, config);
    const meta = skill.metadata;

    console.log(`## ${skill.name}`);
    console.log(`  Description: ${skill.description || "(none)"}`);
    console.log(`  Source:      ${skill.source}`);
    console.log(`  Directory:   ${skill.dir}`);
    console.log(`  Eligible:    ${eligible ? "yes" : "no"}`);

    if (config.enabled === false) {
      console.log(`  Reason:      disabled via SKILL_${skill.name.toUpperCase().replace(/-/g, "_")}_ENABLED=false`);
    }

    if (meta) {
      if (meta.always) console.log(`  Always:      true`);
      if (meta.os) console.log(`  OS:          ${meta.os.join(", ")} (current: ${process.platform})`);
      if (meta.primaryEnv) console.log(`  Primary env: ${meta.primaryEnv}`);
      if (meta.requires?.bins) {
        console.log(`  Bins:        ${meta.requires.bins.join(", ")}`);
      }
      if (meta.requires?.env) {
        console.log(`  Env vars:    ${meta.requires.env.join(", ")}`);
      }
    }

    if (config.apiKey) console.log(`  API key:     set`);
    if (config.env) console.log(`  Env overrides: ${Object.keys(config.env).join(", ")}`);

    console.log();
  }
}

function main(): void {
  const [command] = process.argv.slice(2);
  const workspaceDir = process.env.HEARTBEAT_WORKSPACE_DIR || process.cwd();

  if (!command || !["list", "status"].includes(command)) {
    console.log("Usage: tsx src/skills/cli.ts <command>");
    console.log();
    console.log("Commands:");
    console.log("  list     List all skills with eligibility");
    console.log("  status   Detailed per-skill breakdown");
    return;
  }

  switch (command) {
    case "list":
      cmdList(workspaceDir);
      break;
    case "status":
      cmdStatus(workspaceDir);
      break;
  }
}

main();
