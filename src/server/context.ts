import type { MemoryManager } from "../memory/manager.js";
import type { HeartbeatRunner } from "../heartbeat/runner.js";
import type { ChatManager } from "./chat.js";

export type ServerContext = {
  memory: MemoryManager;
  heartbeat: HeartbeatRunner;
  chat: ChatManager;
  workspaceDir: string;
  startedAt: number;
};

export type Env = {
  Variables: {
    ctx: ServerContext;
  };
};
