import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Env } from "../context.js";
import {
  onHeartbeatEvent,
  getLastHeartbeatEvent,
} from "../../heartbeat/events.js";

const heartbeatSSE = new Hono<Env>();

heartbeatSSE.get("/", (c) => {
  return streamSSE(c, async (stream) => {
    // Send last event as catch-up
    const last = getLastHeartbeatEvent();
    if (last) {
      await stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify(last),
      });
    }

    const unsubscribe = onHeartbeatEvent(async (evt) => {
      try {
        await stream.writeSSE({
          event: "heartbeat",
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

export { heartbeatSSE };
