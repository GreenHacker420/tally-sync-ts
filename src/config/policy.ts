/**
 * Policy registry: every tunable the engine uses is declared here once (type, unit, bounds, default, description).
 * Values are resolved from layers (defaults < dialect < discovered < learned < tenant < shop < company < document),
 * validated against the declaration, and returned together with PROVENANCE so any value can be explained.
 * Invalid values never break the engine: they are reported as problems and the next lower layer wins.
 */
export type PolicyKind = "int" | "bool" | "string";

export interface PolicyDef {
  key: string;
  kind: PolicyKind;
  default: number | boolean | string;
  unit?: string;
  min?: number;
  max?: number;
  description: string;
}

const defs = [
  { key: "gate.timeoutMs", kind: "int", default: 30_000, unit: "ms", min: 1_000, max: 600_000, description: "Hard ceiling for one Tally request; Tally keeps working after a client timeout, so this only bounds our wait." },
  { key: "gate.cooldownMs", kind: "int", default: 15_000, unit: "ms", min: 1_000, max: 3_600_000, description: "How long the circuit stays open before a light probe is tried." },
  { key: "gate.failureThreshold", kind: "int", default: 2, unit: "failures", min: 1, max: 20, description: "Consecutive connection failures before the circuit opens." },
  { key: "gate.probeTimeoutMs", kind: "int", default: 10_000, unit: "ms", min: 500, max: 120_000, description: "Timeout of the light probe sent in half-open state." },
  { key: "recording.capacity", kind: "int", default: 50, unit: "exchanges", min: 1, max: 1_000, description: "Size of the redacted flight-recorder ring buffer." },
  { key: "recording.maxChars", kind: "int", default: 4_000, unit: "chars", min: 200, max: 200_000, description: "Characters kept per recorded request/response." },
  { key: "discovery.maxDepth", kind: "int", default: 4, unit: "levels", min: 1, max: 10, description: "Directory depth of the data-folder drive scan." },
  { key: "discovery.maxDirs", kind: "int", default: 20_000, unit: "directories", min: 100, max: 1_000_000, description: "Directory budget of the drive scan." },
  { key: "discovery.timeBudgetMs", kind: "int", default: 20_000, unit: "ms", min: 1_000, max: 600_000, description: "Time budget of the drive scan." },
  { key: "sync.windowTargetMs", kind: "int", default: 2_000, unit: "ms", min: 200, max: 30_000, description: "Target duration of one Tally read window; sizes the date window." },
  { key: "sync.msPerVoucherEstimate", kind: "int", default: 7, unit: "ms", min: 1, max: 1_000, description: "Cost model used until real latency is measured (conservative; measured 3-7 ms per voucher)." },
  { key: "adaptive.timeoutFactor", kind: "int", default: 3, unit: "x p95", min: 1, max: 20, description: "Request timeout as a multiple of the measured p95 latency, once enough samples exist." },
  { key: "adaptive.minSamples", kind: "int", default: 20, unit: "samples", min: 5, max: 10_000, description: "Latency samples needed before measured values replace the defaults." },
  { key: "adaptive.timeoutFloorMs", kind: "int", default: 2_000, unit: "ms", min: 200, max: 60_000, description: "Lowest timeout the adaptive control may choose, whatever the latency." },
  { key: "batch.start", kind: "int", default: 10, unit: "vouchers", min: 1, max: 1_000, description: "Initial vouchers per import batch." },
  { key: "batch.min", kind: "int", default: 1, unit: "vouchers", min: 1, max: 1_000, description: "Smallest import batch the adaptive control may fall back to." },
  { key: "batch.max", kind: "int", default: 200, unit: "vouchers", min: 1, max: 5_000, description: "Largest import batch the adaptive control may grow to." },
  { key: "batch.growBy", kind: "int", default: 5, unit: "vouchers", min: 1, max: 500, description: "Vouchers added to the batch after each fast, successful import (additive increase)." },
  { key: "batch.shrinkPercent", kind: "int", default: 50, unit: "%", min: 10, max: 90, description: "Percentage of the batch kept after a slow or failed import (multiplicative decrease)." },
  { key: "retry.transientScheduleSec", kind: "string", default: "5,15,45,120,300,900", unit: "seconds", description: "Comma-separated delays between attempts for transient failures; the last one repeats." },
  { key: "retry.jitterPercent", kind: "int", default: 20, unit: "%", min: 0, max: 100, description: "Random spread applied to retry delays so many agents do not retry in step." },
  { key: "learn.sampleVouchers", kind: "int", default: 200, unit: "vouchers", min: 20, max: 2_000, description: "Recent vouchers of a type read to learn how the company writes them." },
  { key: "learn.maxMonths", kind: "int", default: 12, unit: "months", min: 1, max: 60, description: "How far back the learner looks for its sample." },
  { key: "learn.minConfidencePercent", kind: "int", default: 90, unit: "%", min: 50, max: 100, description: "Share of sampled vouchers that must agree before a learned value is used without asking the owner." },
  { key: "learn.refreshHours", kind: "int", default: 24, unit: "hours", min: 1, max: 720, description: "Age after which a learned company context is re-learned even if the masters did not change." },
  { key: "retry.maxAttempts", kind: "int", default: 8, unit: "attempts", min: 1, max: 50, description: "Attempts a job gets before it is moved to the dead-letter state for a person to look at." },
  { key: "queue.maxPending", kind: "int", default: 5_000, unit: "jobs", min: 100, max: 1_000_000, description: "Pending jobs the local queue accepts before it sheds background work and refuses new events (financial jobs are never dropped)." },
  { key: "queue.retentionDays", kind: "int", default: 30, unit: "days", min: 1, max: 365, description: "How long finished jobs are kept before pruning, so the local database stays bounded." },
  { key: "queue.leaseSeconds", kind: "int", default: 300, unit: "seconds", min: 30, max: 3_600, description: "How long a worker may hold a job; after that another worker may take it and the stale worker's result is ignored." },
  { key: "cloud.requestTimeoutMs", kind: "int", default: 30_000, unit: "ms", min: 1_000, max: 300_000, description: "Total deadline of one cloud request." },
  { key: "cloud.maxResponseBytes", kind: "int", default: 5_000_000, unit: "bytes", min: 100_000, max: 100_000_000, description: "Largest cloud response the agent will buffer." },
  { key: "cloud.breakerFailureThreshold", kind: "int", default: 5, unit: "failures", min: 1, max: 100, description: "Availability failures within the window that open the cloud circuit." },
  { key: "cloud.breakerWindowMs", kind: "int", default: 60_000, unit: "ms", min: 5_000, max: 3_600_000, description: "Rolling window in which cloud failures are counted." },
  { key: "cloud.breakerCooldownMs", kind: "int", default: 30_000, unit: "ms", min: 1_000, max: 3_600_000, description: "How long the cloud circuit stays open before one probe is allowed." },
  { key: "sse.idleTimeoutMs", kind: "int", default: 60_000, unit: "ms", min: 10_000, max: 600_000, description: "Silence on the event stream (it sends keepalives) after which the connection is treated as dead and re-opened." },
  { key: "sse.maxBufferBytes", kind: "int", default: 1_000_000, unit: "bytes", min: 10_000, max: 50_000_000, description: "Largest incomplete event line buffered from the event stream." },
  { key: "reconnect.baseMs", kind: "int", default: 2_000, unit: "ms", min: 100, max: 60_000, description: "First reconnect delay; doubles per failure with jitter." },
  { key: "reconnect.maxMs", kind: "int", default: 300_000, unit: "ms", min: 1_000, max: 3_600_000, description: "Longest reconnect delay." },
  { key: "sync.pullIntervalSec", kind: "int", default: 120, unit: "seconds", min: 15, max: 3_600, description: "Backstop interval for pulling cloud events even when no wake-up arrives." },
  { key: "sync.alterIdPageSize", kind: "int", default: 500, unit: "AlterIDs", min: 50, max: 5_000, description: "Width of one AlterID range read from Tally, so one request never loads a whole company." },
  { key: "sync.uploadChunkVouchers", kind: "int", default: 500, unit: "vouchers", min: 50, max: 5_000, description: "Vouchers per upload to the cloud." },
  { key: "resource.maxHeapMb", kind: "int", default: 768, unit: "MB", min: 128, max: 8_192, description: "Heap size above which background extraction is paused (posting continues)." },
  { key: "resource.minFreeDiskMb", kind: "int", default: 500, unit: "MB", min: 50, max: 100_000, description: "Free disk space below which background extraction and non-essential writes stop." },
  { key: "resource.maxEventLoopDelayMs", kind: "int", default: 500, unit: "ms", min: 50, max: 10_000, description: "Event-loop delay (p99) above which background work is shed." },
] as const satisfies readonly PolicyDef[];

export type PolicyKey = (typeof defs)[number]["key"];
export const POLICY_DEFS: readonly PolicyDef[] = defs;

const byKey = new Map<string, PolicyDef>(defs.map((d) => [d.key, d]));

/** The declared default of a key. Engine code reads defaults through this, never as a literal. */
export function policyDefault(key: PolicyKey): number {
  const d = byKey.get(key)!;
  return d.default as number;
}

/** Lowest to highest precedence. */
export const POLICY_LAYER_ORDER = ["default", "dialect", "discovered", "learned", "tenant", "shop", "company", "document"] as const;
export type PolicyLayerName = (typeof POLICY_LAYER_ORDER)[number];

export interface PolicyLayer {
  name: PolicyLayerName;
  values: Readonly<Record<string, unknown>>;
  /** Who set it (user id / system) and when - shown in the UI as the reason for a value. */
  by?: string;
  at?: string;
}

export interface PolicyProblem {
  layer: PolicyLayerName;
  key: string;
  code: "UNKNOWN_KEY" | "WRONG_TYPE" | "OUT_OF_RANGE";
  message: string;
}

export interface ResolvedPolicy {
  values: Record<string, number | boolean | string>;
  provenance: Record<string, { layer: PolicyLayerName; by?: string; at?: string }>;
  problems: PolicyProblem[];
}

function validate(def: PolicyDef, value: unknown): "WRONG_TYPE" | "OUT_OF_RANGE" | undefined {
  if (def.kind === "bool") return typeof value === "boolean" ? undefined : "WRONG_TYPE";
  if (def.kind === "string") return typeof value === "string" ? undefined : "WRONG_TYPE";
  if (typeof value !== "number" || !Number.isFinite(value) || (def.kind === "int" && !Number.isInteger(value))) return "WRONG_TYPE";
  if ((def.min !== undefined && value < def.min) || (def.max !== undefined && value > def.max)) return "OUT_OF_RANGE";
  return undefined;
}

export function resolvePolicy(layers: readonly PolicyLayer[] = []): ResolvedPolicy {
  const out: ResolvedPolicy = { values: {}, provenance: {}, problems: [] };
  for (const d of defs) { out.values[d.key] = d.default; out.provenance[d.key] = { layer: "default" }; }
  const ordered = [...layers].sort((a, b) => POLICY_LAYER_ORDER.indexOf(a.name) - POLICY_LAYER_ORDER.indexOf(b.name));
  for (const layer of ordered) {
    for (const [key, value] of Object.entries(layer.values)) {
      const def = byKey.get(key);
      if (!def) { out.problems.push({ layer: layer.name, key, code: "UNKNOWN_KEY", message: `"${key}" is not a policy key` }); continue; }
      const problem = validate(def, value);
      if (problem) { out.problems.push({ layer: layer.name, key, code: problem, message: problem === "OUT_OF_RANGE" ? `${key}=${String(value)} outside ${def.min}..${def.max} ${def.unit ?? ""}`.trim() : `${key} expects ${def.kind}` }); continue; }
      out.values[key] = value as number | boolean | string;
      out.provenance[key] = { layer: layer.name, by: layer.by, at: layer.at };
    }
  }
  return out;
}

/** Human-readable reason for a value, e.g. `gate.timeoutMs = 45000 (company, by owner-1 at 2026-11-18)`. */
export function explainPolicy(resolved: ResolvedPolicy, key: PolicyKey): string {
  const p = resolved.provenance[key];
  const who = [p.by ? `by ${p.by}` : "", p.at ? `at ${p.at}` : ""].filter(Boolean).join(" ");
  return `${key} = ${String(resolved.values[key])} (${p.layer}${who ? `, ${who}` : ""})`;
}

/** Typed numeric accessor for engine code. */
export function policyNumber(resolved: ResolvedPolicy, key: PolicyKey): number {
  return resolved.values[key] as number;
}

/** Plain-data copy of the registry for consumers that cannot import this package (e.g. the cloud policy service). */
export function policyRegistryJson(): { version: number; defs: PolicyDef[] } {
  return { version: 1, defs: POLICY_DEFS.map((d) => ({ ...d })) };
}
