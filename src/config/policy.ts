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
