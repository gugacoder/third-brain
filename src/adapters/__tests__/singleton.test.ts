import { describe, it, expect } from "vitest";
import { getRegistry, resolveOutbound } from "../index.js";

describe("singleton & convenience API", () => {
  it("getRegistry returns the same instance", () => {
    const a = getRegistry();
    const b = getRegistry();
    expect(a).toBe(b);
  });

  it("singleton comes pre-loaded with defaults", () => {
    const reg = getRegistry();
    expect(reg.listOutbound()).toContain("console");
    expect(reg.listEmbedding()).toContain("openai");
    expect(reg.listEmbedding()).toContain("ollama");
    expect(reg.listEmbedding()).toContain("gemini");
  });

  it("resolveOutbound convenience works", () => {
    const adapter = resolveOutbound("console");
    expect(adapter.id).toBe("console");
  });
});
