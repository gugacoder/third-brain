import Anthropic from "@anthropic-ai/sdk";
import * as pg from "pg";
import { EventEmitter } from "node:events";
import { initChatSchema } from "./chat-schema.js";

export type ChatSession = {
  id: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  abortController: AbortController | null;
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

export class ChatManager {
  private sessions = new Map<string, ChatSession>();
  private emitter = new EventEmitter();
  private client: Anthropic;
  private model: string;
  private pool: pg.Pool;

  constructor(opts: { model?: string; databaseUrl: string }) {
    this.client = new Anthropic();
    this.model = opts.model || "claude-sonnet-4-5-20250929";
    this.pool = new pg.Pool({ connectionString: opts.databaseUrl });
  }

  async init(): Promise<void> {
    await initChatSchema(this.pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getOrCreateSession(sessionId: string): Promise<ChatSession> {
    let session = this.sessions.get(sessionId);
    if (session) return session;

    // Try loading from DB
    const msgRows = await this.pool.query<{
      role: string;
      content: string;
    }>(
      "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId],
    );

    const messages = msgRows.rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));

    // Ensure session row exists in DB
    await this.pool.query(
      "INSERT INTO chat_sessions (id) VALUES ($1) ON CONFLICT DO NOTHING",
      [sessionId],
    );

    session = { id: sessionId, messages, abortController: null };
    this.sessions.set(sessionId, session);
    return session;
  }

  async sendMessage(sessionId: string, userMessage: string): Promise<void> {
    const session = await this.getOrCreateSession(sessionId);
    session.messages.push({ role: "user", content: userMessage });

    // Persist user message
    await this.pool.query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)",
      [sessionId, "user", userMessage],
    );

    // Auto-title with first user message
    if (
      session.messages.filter((m) => m.role === "user").length === 1
    ) {
      const title =
        userMessage.length > 80
          ? userMessage.slice(0, 77) + "..."
          : userMessage;
      await this.pool.query(
        "UPDATE chat_sessions SET title = $1, updated_at = now() WHERE id = $2",
        [title, sessionId],
      );
    } else {
      await this.pool.query(
        "UPDATE chat_sessions SET updated_at = now() WHERE id = $1",
        [sessionId],
      );
    }

    const abortController = new AbortController();
    session.abortController = abortController;

    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: 4096,
          messages: session.messages,
        },
        { signal: abortController.signal },
      );

      let fullText = "";

      stream.on("text", (text) => {
        fullText += text;
        this.emitter.emit(`chat:${sessionId}`, {
          sessionId,
          type: "token",
          text,
        } satisfies ChatTokenEvent);
      });

      await stream.finalMessage();

      session.messages.push({ role: "assistant", content: fullText });
      session.abortController = null;

      // Persist assistant message
      await this.pool.query(
        "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)",
        [sessionId, "assistant", fullText],
      );
      await this.pool.query(
        "UPDATE chat_sessions SET updated_at = now() WHERE id = $1",
        [sessionId],
      );

      this.emitter.emit(`chat:${sessionId}`, {
        sessionId,
        type: "done",
      } satisfies ChatTokenEvent);
    } catch (err) {
      session.abortController = null;
      if (abortController.signal.aborted) return;

      const errorMsg = err instanceof Error ? err.message : String(err);
      this.emitter.emit(`chat:${sessionId}`, {
        sessionId,
        type: "error",
        error: errorMsg,
      } satisfies ChatTokenEvent);
    }
  }

  async getMessages(
    sessionId: string,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    // Check in-memory cache first
    const session = this.sessions.get(sessionId);
    if (session) return [...session.messages];

    // Load from DB
    const result = await this.pool.query<{
      role: string;
      content: string;
    }>(
      "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId],
    );

    return result.rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
  }

  abort(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session?.abortController) {
      session.abortController.abort();
      session.abortController = null;
      return true;
    }
    return false;
  }

  onTokenEvent(
    sessionId: string,
    listener: (evt: ChatTokenEvent) => void,
  ): () => void {
    const key = `chat:${sessionId}`;
    this.emitter.on(key, listener);
    return () => {
      this.emitter.off(key, listener);
    };
  }

  async listSessions(): Promise<ChatSessionInfo[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      updated_at: Date;
      message_count: string;
    }>(`
      SELECT s.id, s.title, s.updated_at,
             COUNT(m.id)::text AS message_count
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `);

    return result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updated_at.toISOString(),
      messageCount: parseInt(r.message_count, 10),
    }));
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.sessions.delete(sessionId);
    const result = await this.pool.query(
      "DELETE FROM chat_sessions WHERE id = $1",
      [sessionId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async renameSession(sessionId: string, title: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE chat_sessions SET title = $1, updated_at = now() WHERE id = $2",
      [title, sessionId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
