import type { OutboundAdapter } from "./types.js";
import { getRegistry } from "../../adapters/index.js";

export function resolveAdapter(id?: string): OutboundAdapter {
  return getRegistry().resolveOutbound(id ?? "console");
}
