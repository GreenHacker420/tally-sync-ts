import type { TallyTransport } from "./transport.js";

export interface RecordedExchange {
  at: string;
  requestType: string;
  request: string;
  response?: string;
  error?: string;
  durationMs: number;
}

export interface RecordingOptions {
  /** Ring buffer size (default 50). */
  capacity?: number;
  /** Characters kept per request/response (default 4000). */
  maxChars?: number;
  /** Extra redaction rules applied after the built-ins. */
  redact?: Array<[RegExp, string]>;
}

const BUILTIN_REDACTIONS: Array<[RegExp, string]> = [
  [/<(PASSWORD|USERPASSWORD|SVPASSWORD)>[^<]*<\/\1>/gi, "<$1>***</$1>"],
  [/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, "{GSTIN}"],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "{PAN}"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "{EMAIL}"],
  [/(<(?:LEDGERMOBILE|MOBILENO|PHONENUMBER)[^>]*>)\s*[+\d][\d\s-]{6,}(<)/gi, "$1{PHONE}$2"],
];

/** Decorator that keeps a redacted ring buffer of the last Tally exchanges (a support "flight recorder"). */
export class RecordingTransport implements TallyTransport {
  private readonly buffer: RecordedExchange[] = [];
  private readonly capacity: number;
  private readonly maxChars: number;
  private readonly rules: Array<[RegExp, string]>;

  constructor(private readonly inner: TallyTransport, options: RecordingOptions = {}) {
    this.capacity = options.capacity ?? 50;
    this.maxChars = options.maxChars ?? 4000;
    this.rules = [...BUILTIN_REDACTIONS, ...(options.redact ?? [])];
  }

  async send(xml: string, requestType = "Generic Request"): Promise<string> {
    const started = Date.now();
    try {
      const response = await this.inner.send(xml, requestType);
      this.record({ requestType, request: xml, response, durationMs: Date.now() - started });
      return response;
    } catch (err) {
      this.record({ requestType, request: xml, error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - started });
      throw err;
    }
  }

  dump(): RecordedExchange[] {
    return [...this.buffer];
  }

  private clean(text: string): string {
    let out = text;
    for (const [pattern, replacement] of this.rules) out = out.replace(pattern, replacement);
    return out.length > this.maxChars ? `${out.slice(0, this.maxChars)}…[truncated ${out.length - this.maxChars}]` : out;
  }

  private record(e: Omit<RecordedExchange, "at">): void {
    this.buffer.push({
      at: new Date().toISOString(),
      requestType: e.requestType,
      request: this.clean(e.request),
      response: e.response === undefined ? undefined : this.clean(e.response),
      error: e.error,
      durationMs: e.durationMs,
    });
    if (this.buffer.length > this.capacity) this.buffer.shift();
  }
}
