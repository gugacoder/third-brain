import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Env } from "../context.js";

const chatSSE = new Hono<Env>();

chatSSE.get("/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const ctx = c.get("ctx");

  return streamSSE(c, async (stream) => {
    const unsubscribe = ctx.chat.onTokenEvent(sessionId, async (evt) => {
      try {
        await stream.writeSSE({
          event: evt.type,
          data: JSON.stringify(evt),
        });
      } catch {
        // Stream closed
      }
    });

    stream.onAbort(() => {
      unsubscribe();
    });

    // Keep alive
    while (true) {
      await stream.writeSSE({ event: "ping", data: "" });
      await stream.sleep(30_000);
    }
  });
});

export { chatSSE };
