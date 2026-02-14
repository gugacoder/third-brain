import type { OutboundAdapter } from "./types.js";

export class ConsoleAdapter implements OutboundAdapter {
  readonly id = "console";

  async sendText(text: string): Promise<boolean> {
    console.log(`[heartbeat] ${text}`);
    return true;
  }
}
