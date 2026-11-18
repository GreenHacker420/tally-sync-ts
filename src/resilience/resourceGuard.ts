import { policyDefault, type ResolvedPolicy } from "../config/policy.js";

export interface ResourceSample { heapMb: number; rssMb: number; freeDiskMb: number | undefined; eventLoopDelayMs: number; sampledAt: number }
export type PressureLevel = "OK" | "SHED_BACKGROUND" | "CRITICAL";
export interface ResourceVerdict { level: PressureLevel; reasons: string[]; sample: ResourceSample }

export interface ResourceProbes { sample(): Promise<ResourceSample> }

/**
 * Decides how much background work the agent may do. Essential financial operations (posting) are never stopped by
 * the guard; extraction, uploads of history and reports are shed first. CRITICAL (disk nearly full) also tells the
 * caller to stop non-essential writes. Forced garbage collection is deliberately not offered.
 */
export class ResourceGuard {
  constructor(private readonly probes: ResourceProbes, private readonly policy?: ResolvedPolicy) {}

  private num(key: "resource.maxHeapMb" | "resource.minFreeDiskMb" | "resource.maxEventLoopDelayMs"): number {
    return (this.policy?.values[key] as number | undefined) ?? policyDefault(key);
  }

  async evaluate(): Promise<ResourceVerdict> {
    const sample = await this.probes.sample();
    const reasons: string[] = [];
    let level: PressureLevel = "OK";
    if (sample.heapMb > this.num("resource.maxHeapMb")) { level = "SHED_BACKGROUND"; reasons.push(`heap ${sample.heapMb} MB over ${this.num("resource.maxHeapMb")} MB`); }
    if (sample.eventLoopDelayMs > this.num("resource.maxEventLoopDelayMs")) { level = "SHED_BACKGROUND"; reasons.push(`event loop delay ${sample.eventLoopDelayMs} ms`); }
    if (sample.freeDiskMb !== undefined && sample.freeDiskMb < this.num("resource.minFreeDiskMb")) { level = "CRITICAL"; reasons.push(`free disk ${sample.freeDiskMb} MB`); }
    return { level, reasons, sample };
  }
}
