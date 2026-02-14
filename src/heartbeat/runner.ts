import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { HeartbeatConfig, HeartbeatRunResult } from "./types.js";
import type { OutboundAdapter } from "./adapters/types.js";
import { resolveAdapter } from "./adapters/index.js";
import { isHeartbeatContentEffectivelyEmpty, stripHeartbeatToken } from "./heartbeat.js";
import { isWithinActiveHours } from "./active-hours.js";
import { emitHeartbeatEvent } from "./events.js";

export class HeartbeatRunner {
  private config: HeartbeatConfig;
  private adapter: OutboundAdapter;
  private client: Anthropic;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  get running(): boolean {
    return !this.stopped;
  }

  // In-memory dedup state
  private lastHeartbeatText = "";
  private lastHeartbeatSentAt = 0;

  constructor(config: HeartbeatConfig) {
    this.config = config;
    this.adapter = resolveAdapter(config.adapter);
    this.client = new Anthropic();
  }

  start(): void {
    this.stopped = false;
    console.log(
      `[heartbeat] started — interval=${this.config.intervalMs}ms, model=${this.config.model}, adapter=${this.adapter.id}`,
    );
    this.scheduleNext();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[heartbeat] stopped");
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(async () => {
      this.timer = null;
      try {
        await this.runOnce();
      } catch (err) {
        console.error("[heartbeat] runOnce error:", err);
      }
      this.scheduleNext();
    }, this.config.intervalMs);
    this.timer.unref?.();
  }

  async runOnce(): Promise<HeartbeatRunResult> {
    const startedAt = Date.now();

    // 1. Guard: stopped?
    if (this.stopped) {
      return { status: "skipped", reason: "disabled" };
    }

    // 2. Guard: quiet hours?
    if (!isWithinActiveHours(this.config, startedAt)) {
      emitHeartbeatEvent({ status: "skipped", reason: "quiet-hours" });
      return { status: "skipped", reason: "quiet-hours" };
    }

    // 3. Read HEARTBEAT.md
    const filePath = path.join(this.config.workspaceDir, "HEARTBEAT.md");
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      // File doesn't exist — proceed with empty content so LLM can decide
      content = "";
    }

    // 4. Guard: effectively empty?
    if (isHeartbeatContentEffectivelyEmpty(content)) {
      emitHeartbeatEvent({
        status: "skipped",
        reason: "empty-heartbeat-file",
        durationMs: Date.now() - startedAt,
      });
      return { status: "skipped", reason: "empty-heartbeat-file" };
    }

    // 5-6. Call Anthropic SDK
    let responseText: string;
    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 1024,
        system: this.config.skillsPrompt
          ? `${this.config.prompt}\n\n${this.config.skillsPrompt}`
          : this.config.prompt,
        messages: [{ role: "user", content }],
      });

      responseText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      emitHeartbeatEvent({
        status: "failed",
        reason,
        durationMs: Date.now() - startedAt,
      });
      return { status: "failed", reason };
    }

    // 7-8. Strip HEARTBEAT_OK token
    const stripped = stripHeartbeatToken(responseText, {
      mode: "heartbeat",
      maxAckChars: this.config.ackMaxChars,
    });

    if (stripped.shouldSkip) {
      emitHeartbeatEvent({
        status: "ok-token",
        durationMs: Date.now() - startedAt,
      });
      return { status: "skipped", reason: "ok-token" };
    }

    const finalText = stripped.text;

    // 9. Dedup: same text within 24h?
    if (
      this.lastHeartbeatText.trim() &&
      finalText.trim() === this.lastHeartbeatText.trim() &&
      startedAt - this.lastHeartbeatSentAt < 24 * 60 * 60 * 1000
    ) {
      emitHeartbeatEvent({
        status: "skipped",
        reason: "duplicate",
        preview: finalText.slice(0, 200),
        durationMs: Date.now() - startedAt,
      });
      return { status: "skipped", reason: "duplicate" };
    }

    // 10. Deliver via adapter
    try {
      await this.adapter.sendText(finalText);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      emitHeartbeatEvent({
        status: "failed",
        reason,
        durationMs: Date.now() - startedAt,
      });
      return { status: "failed", reason };
    }

    // 11. Record dedup state
    this.lastHeartbeatText = finalText;
    this.lastHeartbeatSentAt = startedAt;

    // 12. Emit sent
    const durationMs = Date.now() - startedAt;
    emitHeartbeatEvent({
      status: "sent",
      preview: finalText.slice(0, 200),
      durationMs,
    });
    return { status: "sent", text: finalText, durationMs };
  }
}
