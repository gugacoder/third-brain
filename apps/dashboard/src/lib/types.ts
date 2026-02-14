export type HealthResponse = {
  uptime: number;
  startedAt: number;
  memory: {
    provider: string;
    files: number;
    chunks: number;
  } | null;
  heartbeat: {
    running: boolean;
    lastEvent: HeartbeatEvent | null;
  };
};

export type HeartbeatEvent = {
  ts: number;
  status: "sent" | "ok-token" | "skipped" | "failed";
  preview?: string;
  durationMs?: number;
  reason?: string;
};

export type HeartbeatStatus = {
  running: boolean;
  lastEvent: HeartbeatEvent | null;
};

export type MemoryStatus = {
  provider: string;
  model?: string;
  files?: number;
  chunks?: number;
  dirty?: boolean;
  workspaceDir?: string;
  cache?: { enabled: boolean; entries?: number };
  fts?: { enabled: boolean };
  vector?: { enabled: boolean; dims?: number };
};

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: string;
  citation?: string;
};

export type SkillInfo = {
  name: string;
  description: string;
  source: string;
  eligible: boolean;
  metadata?: {
    always?: boolean;
    os?: string[];
    requires?: { bins?: string[]; env?: string[] };
  };
};

export type ChatTokenEvent = {
  sessionId: string;
  type: "token" | "done" | "error";
  text?: string;
  error?: string;
};

export type ChatSessionInfo = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};
