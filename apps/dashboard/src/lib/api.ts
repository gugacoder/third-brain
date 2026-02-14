import type {
  HealthResponse,
  HeartbeatStatus,
  MemoryStatus,
  MemorySearchResult,
  SkillInfo,
  ChatSessionInfo,
} from "./types";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  health: () => fetchJSON<HealthResponse>("/api/health"),

  memory: {
    status: () => fetchJSON<MemoryStatus>("/api/memory/status"),
    search: (query: string, maxResults?: number) =>
      fetchJSON<{ results: MemorySearchResult[] }>("/api/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, maxResults }),
      }),
    sync: () =>
      fetchJSON<{ ok: boolean }>("/api/memory/sync", { method: "POST" }),
  },

  heartbeat: {
    status: () => fetchJSON<HeartbeatStatus>("/api/heartbeat/status"),
    run: () =>
      fetchJSON<Record<string, unknown>>("/api/heartbeat/run", {
        method: "POST",
      }),
    start: () =>
      fetchJSON<{ ok: boolean; running: boolean }>("/api/heartbeat/start", {
        method: "POST",
      }),
    stop: () =>
      fetchJSON<{ ok: boolean; running: boolean }>("/api/heartbeat/stop", {
        method: "POST",
      }),
  },

  skills: () => fetchJSON<{ skills: SkillInfo[] }>("/api/skills"),

  chat: {
    send: (sessionId: string, message: string) =>
      fetchJSON<{ ok: boolean; sessionId: string }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      }),
    messages: (sessionId: string) =>
      fetchJSON<{
        messages: Array<{ role: "user" | "assistant"; content: string }>;
      }>(`/api/chat/${sessionId}/messages`),
    abort: (sessionId: string) =>
      fetchJSON<{ ok: boolean; aborted: boolean }>("/api/chat/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }),
    sessions: () =>
      fetchJSON<{ sessions: ChatSessionInfo[] }>("/api/chat/sessions"),
    rename: (sessionId: string, title: string) =>
      fetchJSON<{ ok: boolean }>(`/api/chat/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    delete: (sessionId: string) =>
      fetchJSON<{ ok: boolean }>(`/api/chat/${sessionId}`, {
        method: "DELETE",
      }),
  },
};
