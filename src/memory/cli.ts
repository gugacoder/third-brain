import "dotenv/config";
import * as path from "node:path";
import { MemoryManager } from "./manager.js";
import type { MemoryConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

function buildConfig(): MemoryConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL is not set. Copy .env.example to .env and configure it.");
    process.exit(1);
  }

  return {
    ...DEFAULT_CONFIG,
    databaseUrl,
    workspaceDir: process.cwd(),
    embeddingProvider: process.env.EMBEDDING_PROVIDER || "openai",
  };
}

async function cmdIndex(manager: MemoryManager): Promise<void> {
  console.log("Indexing memory files...\n");
  await manager.sync({
    force: true,
    progress: (update) => {
      console.log(`  [${update.completed}/${update.total}] ${update.label || ""}`);
    },
  });
  console.log("\nDone.");
}

async function cmdSearch(manager: MemoryManager, query: string): Promise<void> {
  if (!query) {
    console.error("Usage: search <query>");
    process.exit(1);
  }

  console.log(`Searching: "${query}"\n`);
  const results = await manager.search(query);

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  for (const r of results) {
    console.log(`--- ${r.citation || r.path} (score: ${r.score.toFixed(4)}) ---`);
    console.log(r.snippet);
    console.log();
  }

  console.log(`${results.length} result(s) found.`);
}

async function cmdStatus(manager: MemoryManager): Promise<void> {
  const s = await manager.status();
  console.log("Memory System Status");
  console.log("====================");
  console.log(`Provider:   ${s.provider} (${s.model})`);
  console.log(`Files:      ${s.files}`);
  console.log(`Chunks:     ${s.chunks}`);
  console.log(`Dirty:      ${s.dirty}`);
  console.log(`Workspace:  ${s.workspaceDir}`);
  console.log(`Vector:     dims=${s.vector?.dims}`);
  console.log(`FTS:        enabled=${s.fts?.enabled}`);
  console.log(`Cache:      enabled=${s.cache?.enabled}, entries=${s.cache?.entries}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || !["index", "search", "status"].includes(command)) {
    console.log("Usage: tsx src/memory/cli.ts <command> [args]");
    console.log();
    console.log("Commands:");
    console.log("  index              Force reindex all memory files");
    console.log("  search <query>     Search memory");
    console.log("  status             Show index status");
    process.exit(0);
  }

  const config = buildConfig();
  const manager = new MemoryManager(config);

  try {
    switch (command) {
      case "index":
        await cmdIndex(manager);
        break;
      case "search":
        await cmdSearch(manager, args.join(" "));
        break;
      case "status":
        await cmdStatus(manager);
        break;
    }
  } finally {
    await manager.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
