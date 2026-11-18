import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";

/**
 * Rule packs are DATA, never code: a pack is JSON (patterns as strings) that is validated, compiled and, when it
 * comes from outside the package, verified against a signature. Nothing here evaluates downloaded code.
 */

export type ErrorClass = "TRANSIENT" | "PERMANENT";

/** How to read structured detail out of a matched message, by capture-group index. */
export type DetailSpec =
  | { kind: "master"; kindGroup: number; nameGroup: number }
  | { kind: "totals"; debitGroup: number; creditGroup: number; differenceGroup: number };

export interface RuleData { id: string; code: string; class: ErrorClass; pattern: string; flags?: string; detail?: DetailSpec }
export interface RulePackData { family: string; version: number; rules: RuleData[] }

export interface CompiledRule { data: RuleData; regex: RegExp }
export interface CompiledPack { family: string; version: number; rules: CompiledRule[] }

export class RulePackError extends Error {
  constructor(readonly problems: string[]) { super(`Invalid rule pack: ${problems.join("; ")}`); this.name = "RulePackError"; }
}

const MAX_PATTERN = 600;
const ALLOWED_FLAGS = /^[ims]*$/;

/** Validate and compile; every problem is reported together so a pack author fixes them in one pass. */
export function compileRulePack(data: RulePackData): CompiledPack {
  const problems: string[] = []; const ids = new Set<string>(); const rules: CompiledRule[] = [];
  if (!data || typeof data.family !== "string" || !Number.isInteger(data.version) || !Array.isArray(data.rules)) throw new RulePackError(["pack needs family, integer version and rules[]"]);
  for (const r of data.rules) {
    const at = `rule ${r?.id ?? "?"}`;
    if (!r || typeof r.id !== "string" || !r.id) { problems.push("rule without id"); continue; }
    if (ids.has(r.id)) problems.push(`${at}: duplicate id`); ids.add(r.id);
    if (typeof r.code !== "string" || !r.code) problems.push(`${at}: missing code`);
    if (r.class !== "TRANSIENT" && r.class !== "PERMANENT") problems.push(`${at}: class must be TRANSIENT or PERMANENT`);
    if (typeof r.pattern !== "string" || r.pattern.length === 0 || r.pattern.length > MAX_PATTERN) { problems.push(`${at}: pattern missing or longer than ${MAX_PATTERN}`); continue; }
    if (r.flags !== undefined && !ALLOWED_FLAGS.test(r.flags)) { problems.push(`${at}: flags may only use i, m, s`); continue; }
    let regex: RegExp;
    try { regex = new RegExp(r.pattern, r.flags ?? ""); } catch (e) { problems.push(`${at}: ${(e as Error).message}`); continue; }
    if (r.detail) {
      const groups = new RegExp(`${r.pattern}|`).exec("")!.length - 1;
      const need = r.detail.kind === "master" ? [r.detail.kindGroup, r.detail.nameGroup] : [r.detail.debitGroup, r.detail.creditGroup, r.detail.differenceGroup];
      if (need.some((g) => !Number.isInteger(g) || g < 1 || g > groups)) problems.push(`${at}: detail refers to a capture group the pattern does not have`);
    }
    rules.push({ data: r, regex });
  }
  if (problems.length) throw new RulePackError(problems);
  return { family: data.family, version: data.version, rules };
}

/** Stable JSON (sorted keys) so a signature does not depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

export interface SignedPack { data: RulePackData; signature: string }

export function signPack(data: RulePackData, privateKeyPem: string): SignedPack {
  return { data, signature: cryptoSign(null, Buffer.from(canonicalJson(data)), createPrivateKey(privateKeyPem)).toString("base64") };
}

export function verifyPack(signed: SignedPack, publicKeyPem: string): boolean {
  try { return cryptoVerify(null, Buffer.from(canonicalJson(signed.data)), createPublicKey(publicKeyPem), Buffer.from(signed.signature, "base64")); } catch { return false; }
}

/**
 * Accept a pack from outside the package: signature must verify, the version must not go backwards (rollback attack),
 * and it must compile. Returns the compiled pack or throws.
 */
export function loadSignedPack(signed: SignedPack, publicKeyPem: string, currentVersion = 0): CompiledPack {
  if (!verifyPack(signed, publicKeyPem)) throw new RulePackError(["signature does not verify"]);
  if (signed.data.version <= currentVersion) throw new RulePackError([`version ${signed.data.version} is not newer than ${currentVersion}`]);
  return compileRulePack(signed.data);
}

export interface QuarantineEntry { template: string; count: number; samples: string[]; firstSeen: string; lastSeen: string }

/** Collapse names and numbers so one label covers every instance of the same unknown message. */
export function messageTemplate(text: string): string {
  return text.replace(/'[^']*'/g, "'?'").replace(/\d[\d,]*(\.\d+)?/g, "#").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Unknown messages are kept (bounded) for support to label once and add to the pack; never silently dropped. */
export class QuarantineLog {
  private readonly entries = new Map<string, QuarantineEntry>();
  constructor(private readonly capacity = 200, private readonly samplesPerEntry = 3, private readonly now: () => string = () => new Date().toISOString()) {}
  record(text: string): QuarantineEntry {
    const template = messageTemplate(text); const t = this.now();
    let e = this.entries.get(template);
    if (!e) {
      if (this.entries.size >= this.capacity) { const oldest = [...this.entries.values()].sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))[0]; this.entries.delete(oldest.template); }
      e = { template, count: 0, samples: [], firstSeen: t, lastSeen: t }; this.entries.set(template, e);
    }
    e.count++; e.lastSeen = t; if (e.samples.length < this.samplesPerEntry && !e.samples.includes(text)) e.samples.push(text);
    return e;
  }
  list(): QuarantineEntry[] { return [...this.entries.values()].sort((a, b) => b.count - a.count); }
}
