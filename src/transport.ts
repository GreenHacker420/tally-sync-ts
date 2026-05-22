export interface TallyTransport {
  send(xml: string, requestType?: string): Promise<string>;
}

export interface FetchTallyTransportOptions {
  baseURL?: string;
  port?: number;
  timeoutMinutes?: number;
  fetchImpl?: typeof fetch;
}

export class FetchTallyTransport implements TallyTransport {
  private baseURL: string;
  private port: number;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: FetchTallyTransportOptions = {}) {
    this.baseURL = cleanUrl(options.baseURL || "http://localhost");
    this.port = options.port || 9000;
    this.timeoutMs = (options.timeoutMinutes || 3) * 60 * 1000;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  setup(url: string, port: number): void {
    this.baseURL = cleanUrl(url);
    this.port = port;
  }

  get fullURL(): string {
    return `${this.baseURL}:${this.port}`;
  }

  async send(xml: string, requestType = "Generic Request"): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.fullURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
        body: xml,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      return new TextDecoder("utf-8").decode(buffer);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Request to Tally timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(`Failed to connect to Tally on ${this.fullURL} for ${requestType}: ${error.message}`);
    }
  }
}

function cleanUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `http://${url}`;
  }
  return url;
}
