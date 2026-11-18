import { policyDefault, POLICY_DEFS, type PolicyKey, type ResolvedPolicy } from "../config/policy.js";

/** Reads a numeric policy value from a resolved policy, or the declared default when none is given. */
export type NumberSource = (key: PolicyKey) => number;
export const fromPolicy = (resolved?: ResolvedPolicy): NumberSource => (key) => (resolved ? (resolved.values[key] as number) : policyDefault(key));

export interface Decision { at: string; key: string; from: number; to: number; reason: string }

/** Every adaptive change is recorded (bounded) so "why is the timeout 14 s?" has an answer. */
export class DecisionLog {
  private readonly items: Decision[] = [];
  constructor(private readonly capacity = 100, private readonly now: () => string = () => new Date().toISOString()) {}
  record(key: string, from: number, to: number, reason: string): void {
    if (from === to) return;
    this.items.push({ at: this.now(), key, from, to, reason });
    if (this.items.length > this.capacity) this.items.shift();
  }
  list(): readonly Decision[] { return this.items; }
}

/** Rolling latency window with exact percentiles over the retained samples. */
export class LatencyTracker {
  private readonly samples: number[] = [];
  constructor(private readonly capacity = 200) {}
  add(ms: number): void { if (!Number.isFinite(ms) || ms < 0) return; this.samples.push(ms); if (this.samples.length > this.capacity) this.samples.shift(); }
  get count(): number { return this.samples.length; }
  percentile(p: number): number | undefined {
    if (this.samples.length === 0) return undefined;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  }
}

/** Timeout from measured p95, clamped between the floor and the policy ceiling; the ceiling alone until enough samples exist. */
export function adaptiveTimeoutMs(latency: LatencyTracker, ceilingMs: number, num: NumberSource = fromPolicy(), log?: DecisionLog, previous?: number): number {
  const p95 = latency.count >= num("adaptive.minSamples") ? latency.percentile(95) : undefined;
  if (p95 === undefined) return ceilingMs;
  const chosen = Math.min(ceilingMs, Math.max(num("adaptive.timeoutFloorMs"), Math.round(p95 * num("adaptive.timeoutFactor"))));
  if (previous !== undefined) log?.record("timeoutMs", previous, chosen, `p95 ${p95} ms over ${latency.count} samples`);
  return chosen;
}

/** How many vouchers fit one read window at the target duration, from the measured (or estimated) cost per voucher. */
export function windowVouchers(latencyPerVoucherMs: number | undefined, num: NumberSource = fromPolicy()): number {
  const per = latencyPerVoucherMs && latencyPerVoucherMs > 0 ? latencyPerVoucherMs : num("sync.msPerVoucherEstimate");
  return Math.max(1, Math.floor(num("sync.windowTargetMs") / per));
}

/** Additive increase, multiplicative decrease: grows while imports are fast and clean, backs off hard on slow or failed ones. */
export class AimdBatch {
  private size: number;
  constructor(private readonly num: NumberSource = fromPolicy(), private readonly log?: DecisionLog) { this.size = this.clamp(num("batch.start")); }
  private clamp(n: number): number { return Math.max(this.num("batch.min"), Math.min(this.num("batch.max"), Math.round(n))); }
  get current(): number { return this.size; }
  /** Report one finished import: how long it took for how many vouchers, and whether it succeeded. */
  report(outcome: { ok: boolean; elapsedMs: number }): number {
    const before = this.size;
    const slow = outcome.elapsedMs > this.num("sync.windowTargetMs") * 2;
    if (!outcome.ok || slow) this.size = this.clamp(this.size * (this.num("batch.shrinkPercent") / 100));
    else this.size = this.clamp(this.size + this.num("batch.growBy"));
    this.log?.record("batchSize", before, this.size, !outcome.ok ? "import failed" : slow ? `slow import (${outcome.elapsedMs} ms)` : "fast import");
    return this.size;
  }
}

export interface RetryOptions { schedule?: string; jitterPercent?: number; random?: () => number }

/** Parse "5,15,45" into seconds; invalid entries are rejected rather than guessed. */
export function parseSchedule(text: string): number[] {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean).map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n <= 0)) throw new RangeError(`invalid retry schedule "${text}"`);
  return parts;
}

/**
 * Delay before attempt `attempt` (1-based) in ms. PERMANENT failures never retry (undefined); transient ones follow the
 * schedule (the last delay repeats) with jitter.
 */
export function retryDelayMs(errorClass: "TRANSIENT" | "PERMANENT", attempt: number, resolved?: ResolvedPolicy, options: RetryOptions = {}): number | undefined {
  if (errorClass === "PERMANENT") return undefined;
  const schedule = parseSchedule(options.schedule ?? (resolved?.values["retry.transientScheduleSec"] as string | undefined) ?? defaultSchedule());
  const base = schedule[Math.min(Math.max(attempt, 1), schedule.length) - 1] * 1000;
  const jitter = (options.jitterPercent ?? (resolved ? (resolved.values["retry.jitterPercent"] as number) : policyDefault("retry.jitterPercent"))) / 100;
  const r = (options.random ?? Math.random)();
  return Math.round(base * (1 + (r * 2 - 1) * jitter));
}
function defaultSchedule(): string { return POLICY_SCHEDULE_DEFAULT; }
const POLICY_SCHEDULE_DEFAULT = String(POLICY_DEFS.find((d) => d.key === "retry.transientScheduleSec")!.default);
