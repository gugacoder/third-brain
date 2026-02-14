import crypto from "node:crypto";

export type MemoryChunk = {
  startLine: number;
  endLine: number;
  text: string;
  hash: string;
};

/**
 * Hash text with SHA-256
 */
export function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Split markdown content into overlapping chunks.
 *
 * Algorithm (from OpenClaw):
 * - maxChars = tokens * 4 (heuristic: ~4 chars per token)
 * - overlapChars = overlap * 4
 * - Iterate lines, accumulating into current chunk
 * - When adding a line would exceed maxChars, flush the current chunk
 * - After flushing, carry overlap: keep entries from the end of the flushed chunk
 *   that fit within overlapChars
 * - Long lines (longer than maxChars) are split into segments
 * - Each chunk gets: startLine, endLine, text (joined lines), hash (SHA-256 of text)
 *
 * @param content - The full markdown content
 * @param options - { tokens: 400, overlap: 80 } defaults
 * @returns Array of MemoryChunk
 */
export function chunkMarkdown(
  content: string,
  options: { tokens: number; overlap: number } = { tokens: 400, overlap: 80 },
): MemoryChunk[] {
  const lines = content.split("\n");
  const maxChars = Math.max(32, options.tokens * 4);
  const overlapChars = Math.max(0, options.overlap * 4);
  const chunks: MemoryChunk[] = [];

  let current: Array<{ line: string; lineNo: number }> = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    const text = current.map((e) => e.line).join("\n");
    const startLine = current[0]!.lineNo;
    const endLine = current[current.length - 1]!.lineNo;
    chunks.push({
      startLine,
      endLine,
      text,
      hash: hashText(text),
    });
  };

  const carryOverlap = () => {
    // Keep entries from the end of current that fit within overlapChars
    let carried: typeof current = [];
    let carriedChars = 0;
    for (let i = current.length - 1; i >= 0; i--) {
      const entry = current[i]!;
      const size = entry.line.length + 1;
      if (carriedChars + size > overlapChars) break;
      carried.unshift(entry);
      carriedChars += size;
    }
    current = carried;
    currentChars = carriedChars;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1; // 1-based

    // Split long lines into segments
    const segments: string[] = [];
    if (line.length === 0) {
      segments.push("");
    } else {
      for (let start = 0; start < line.length; start += maxChars) {
        segments.push(line.slice(start, start + maxChars));
      }
    }

    for (const segment of segments) {
      const lineSize = segment.length + 1; // +1 for newline
      if (currentChars + lineSize > maxChars && current.length > 0) {
        flush();
        carryOverlap();
      }
      current.push({ line: segment, lineNo });
      currentChars += lineSize;
    }
  }

  // Flush remaining
  flush();

  return chunks;
}
