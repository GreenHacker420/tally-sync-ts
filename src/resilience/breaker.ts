/**
 * Circuit breaker with a rolling failure window and a single recovery probe. Only AVAILABILITY failures count
 * (network down, timeout, 5xx, 429); business validation errors (4xx) must be reported with `success()` or not at all,
 * otherwise a bad request would take the whole dependency offline.
 */
export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface BreakerOptions { failureThreshold: number; windowMs: number; cooldownMs: number; now?: () => number }

export class CircuitOpenError extends Error {
  constructor(readonly retryAfterMs: number) { super(`Circuit open; retry in ${retryAfterMs} ms`); this.name = "CircuitOpenError"; }
}

export class CircuitBreaker {
  private failures: number[] = [];
  private openedAt: number | undefined;
  private probing = false;
  private readonly now: () => number;
  constructor(private readonly options: BreakerOptions) { this.now = options.now ?? Date.now; }

  get state(): BreakerState {
    if (this.openedAt === undefined) return "CLOSED";
    return this.now() - this.openedAt >= this.options.cooldownMs ? "HALF_OPEN" : "OPEN";
  }

  /** Throws CircuitOpenError while open, or while another probe is already in flight. */
  acquire(): void {
    const s = this.state;
    if (s === "CLOSED") return;
    if (s === "OPEN") throw new CircuitOpenError(this.options.cooldownMs - (this.now() - this.openedAt!));
    if (this.probing) throw new CircuitOpenError(this.options.cooldownMs);
    this.probing = true;
  }

  success(): void { this.failures = []; this.openedAt = undefined; this.probing = false; }

  failure(): void {
    const t = this.now();
    this.probing = false;
    if (this.openedAt !== undefined) { this.openedAt = t; return; } // a failed probe re-opens for a full cooldown
    this.failures = this.failures.filter((f) => t - f < this.options.windowMs);
    this.failures.push(t);
    if (this.failures.length >= this.options.failureThreshold) this.openedAt = t;
  }

  /** Run `fn` under the breaker. `isAvailabilityFailure` decides whether an error counts; anything else passes through as a success of the dependency. */
  async run<T>(fn: () => Promise<T>, isAvailabilityFailure: (err: unknown) => boolean = () => true): Promise<T> {
    this.acquire();
    try { const r = await fn(); this.success(); return r; }
    catch (err) { if (isAvailabilityFailure(err)) this.failure(); else this.success(); throw err; }
  }
}

/** Exponential backoff with full jitter, capped. `attempt` is 1-based. */
export function backoffMs(attempt: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}
