import { adaptiveTimeoutMs, type DecisionLog, type LatencyTracker, type NumberSource } from "./adaptive/control.js";
import type { TallyTransport } from "./transport.js";
import { policyDefault, policyNumber, type ResolvedPolicy } from "./config/policy.js";
import { TallyCircuitOpenError, TallyTimeoutError, TallyTransportError } from "./errors.js";

/** write > light-read > heavy-read: a counter's bill must never wait behind a month-long export. */
export const GatePriority = { WRITE: 0, LIGHT_READ: 1, HEAVY_READ: 2 } as const;
export type GatePriority = (typeof GatePriority)[keyof typeof GatePriority];

/** Cheapest request that proves Tally's XML handler is idle: a built-in function call (no TDL, no data scan). */
export const TALLY_LIGHT_PROBE_XML = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>EXPORT</TALLYREQUEST><TYPE>FUNCTION</TYPE><ID>$$CurrentSimpleCompany</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>`;

export interface TallyGateOptions {
  /**
   * Request used to test whether Tally is idle again after a timeout. TallyPrime's `Ignore Tcp Timeout=Yes`
   * (seen in a real tally.ini) keeps executing a request after the client gave up, so a timed-out request may still
   * be running; never forward the caller's next (possibly heavy) request as the probe.
   */
  probeXml?: string;
  probeTimeoutMs?: number;
  /** Hard ceiling per request; Tally is single-threaded and can block on a modal dialog. */
  timeoutMs?: number;
  /** Optional adaptive control: timeouts follow the measured p95 latency, never above `timeoutMs`. */
  adaptive?: { latency: LatencyTracker; log?: DecisionLog; num?: NumberSource };
  /** Consecutive timeouts/connection failures before the circuit opens. */
  failureThreshold?: number;
  /** How long the circuit stays open before one probe request is let through. */
  cooldownMs?: number;
  now?: () => number;
}

interface Waiter {
  priority: GatePriority;
  seq: number;
  run: () => void;
}

/**
 * Bulkhead + circuit breaker in front of a Tally transport: exactly one request in flight, priority ordering,
 * a hard timeout, and fail-fast while Tally is known to be unresponsive (so a hung Tally is not hammered).
 */
export class TallyGate implements TallyTransport {
  private readonly timeoutMs: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly probeXml: string;
  private readonly probeTimeoutMs: number;
  private readonly adaptive?: TallyGateOptions["adaptive"];
  private lastTimeout?: number;
  private queue: Waiter[] = [];
  private busy = false;
  private seq = 0;
  private failures = 0;
  private openedAt: number | undefined;
  private probing = false;

  constructor(private readonly inner: TallyTransport, options: TallyGateOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? policyDefault("gate.timeoutMs");
    this.failureThreshold = options.failureThreshold ?? policyDefault("gate.failureThreshold");
    this.cooldownMs = options.cooldownMs ?? policyDefault("gate.cooldownMs");
    this.now = options.now ?? Date.now;
    this.probeXml = options.probeXml ?? TALLY_LIGHT_PROBE_XML;
    this.probeTimeoutMs = options.probeTimeoutMs ?? policyDefault("gate.probeTimeoutMs");
    this.adaptive = options.adaptive;
  }

  /** Build a gate whose tunables come from resolved policy (so tenant/shop/company layers apply). */
  static fromPolicy(inner: TallyTransport, policy: ResolvedPolicy, now?: () => number): TallyGate {
    return new TallyGate(inner, {
      timeoutMs: policyNumber(policy, "gate.timeoutMs"), cooldownMs: policyNumber(policy, "gate.cooldownMs"),
      failureThreshold: policyNumber(policy, "gate.failureThreshold"), probeTimeoutMs: policyNumber(policy, "gate.probeTimeoutMs"), now,
    });
  }

  get state(): "CLOSED" | "OPEN" | "HALF_OPEN" {
    if (this.openedAt === undefined) return "CLOSED";
    return this.now() - this.openedAt >= this.cooldownMs ? "HALF_OPEN" : "OPEN";
  }

  send(xml: string, requestType = "Generic Request"): Promise<string> {
    return this.sendWithPriority(xml, requestType, GatePriority.LIGHT_READ);
  }

  sendWithPriority(xml: string, requestType: string, priority: GatePriority): Promise<string> {
    const retryAfter = this.retryAfterMs();
    if (retryAfter > 0) return Promise.reject(new TallyCircuitOpenError(retryAfter));
    return new Promise<string>((resolve, reject) => {
      const waiter: Waiter = {
        priority,
        seq: this.seq++,
        run: () => {
          this.execute(xml, requestType).then(resolve, reject).finally(() => {
            this.busy = false;
            this.pump();
          });
        },
      };
      this.queue.push(waiter);
      this.queue.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      this.pump();
    });
  }

  private retryAfterMs(): number {
    if (this.openedAt === undefined) return 0;
    const remaining = this.cooldownMs - (this.now() - this.openedAt);
    if (remaining > 0) return remaining;
    return this.probing ? this.cooldownMs : 0; // half-open: one probe at a time
  }

  private pump(): void {
    if (this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    next.run();
  }

  private async execute(xml: string, requestType: string): Promise<string> {
    const halfOpen = this.state === "HALF_OPEN";
    if (halfOpen) {
      this.probing = true;
      if (!(await this.probeIdle())) {
        this.trip(); // still busy (Tally may be finishing abandoned requests): stay open, do NOT forward the caller's request
        this.probing = false;
        throw new TallyCircuitOpenError(this.cooldownMs);
      }
      this.openedAt = undefined;
      this.failures = 0;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = this.adaptive ? adaptiveTimeoutMs(this.adaptive.latency, this.timeoutMs, this.adaptive.num, this.adaptive.log, this.lastTimeout ?? this.timeoutMs) : this.timeoutMs;
    this.lastTimeout = limit;
    const startedAt = this.now();
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TallyTimeoutError(limit, requestType)), limit);
      });
      const result = await Promise.race([this.inner.send(xml, requestType), timeout]);
      this.adaptive?.latency.add(this.now() - startedAt);
      this.failures = 0;
      this.openedAt = undefined;
      return result;
    } catch (err) {
      if (err instanceof TallyTimeoutError) {
        this.trip(); // a hung Tally: stop sending immediately
      } else if (this.isConnectionFailure(err)) {
        this.failures += 1;
        if (halfOpen || this.failures >= this.failureThreshold) this.trip();
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      this.probing = false;
    }
  }

  private async probeIdle(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TallyTimeoutError(this.probeTimeoutMs, "probe")), this.probeTimeoutMs); });
      await Promise.race([this.inner.send(this.probeXml, "Gate probe"), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private trip(): void {
    this.openedAt = this.now();
  }

  private isConnectionFailure(err: unknown): boolean {
    return err instanceof TallyTransportError ? err.kind === "CONNECTION" : err instanceof Error && /Failed to connect|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(err.message);
  }
}
