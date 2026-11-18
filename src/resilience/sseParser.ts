/**
 * Incremental Server-Sent-Events parser. State survives across chunks (an event split between two TCP chunks is not
 * lost), the buffer is bounded, and a malformed line never throws.
 */
export interface SseEvent { event: string; data: string }

export class SseParser {
  private buffer = "";
  private event = "";
  private data: string[] = [];
  private overflowed = false;
  constructor(private readonly maxBufferBytes: number) {}

  get hasOverflowed(): boolean { return this.overflowed; }

  /** Feed a decoded chunk; returns the complete events it finished. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    let nl: number;
    while ((nl = this.buffer.search(/\r\n|\n|\r/)) !== -1) {
      const m = /\r\n|\n|\r/.exec(this.buffer)!;
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + m[0].length);
      if (line === "") {
        if (this.data.length > 0) out.push({ event: this.event || "message", data: this.data.join("\n") });
        this.event = ""; this.data = [];
      } else if (line.startsWith(":")) {
        continue; // comment / keepalive
      } else {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") this.event = value; else if (field === "data") this.data.push(value);
      }
    }
    if (Buffer.byteLength(this.buffer) > this.maxBufferBytes) { this.buffer = ""; this.event = ""; this.data = []; this.overflowed = true; }
    return out;
  }
}
