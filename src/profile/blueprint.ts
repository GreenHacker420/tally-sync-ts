import { asArray } from "../xml/reader.js";
import { tallyText } from "../xml/values.js";

/**
 * Learns how a company actually writes one voucher type, from its own vouchers
 * (raw parsed XML objects). Pure: no I/O, no business names. Everything is a
 * frequency, so the caller decides what is confident enough to trust or must be
 * confirmed by the owner.
 */

type Node = Record<string, unknown>;

export interface PathStat { path: string; count: number; fraction: number }
export interface NameStat { name: string; count: number; fraction: number }
export interface LedgerUsage extends NameStat { firstCount: number; negativeCount: number }

export interface VoucherBlueprint {
  sampleSize: number;
  skeleton: PathStat[];
  corePaths: string[];
  ledgers: LedgerUsage[];
  /** Ledgers used inside inventory lines (the sales/purchase ledger of each item line). */
  lineLedgers: NameStat[];
  godowns: NameStat[];
  batches: NameStat[];
  /** Fraction of inventory lines that carry a godown / batch name. */
  lineGodownFraction: number;
  lineBatchFraction: number;
  /** Fraction of vouchers whose number tag is present and non-empty. */
  numberedFraction: number;
  /** Fraction of vouchers carrying a bill reference on any ledger entry. */
  billReferenceFraction: number;
  /** Fraction of vouchers whose first ledger entry is the party ledger. */
  partyFirstFraction: number;
}

export interface BlueprintTags {
  ledgerLists: readonly string[];
  inventoryLists: readonly string[];
  allocationLists: readonly string[];
  batchLists: readonly string[];
  billLists: readonly string[];
  ledgerName: string; godownName: string; batchName: string; amount: string; partyFlag: string; number: string;
}

/** Tally export tag names (protocol vocabulary; override per dialect when a release differs). */
export const TALLY_EXPORT_TAGS: BlueprintTags = {
  ledgerLists: ["ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST"],
  inventoryLists: ["ALLINVENTORYENTRIES.LIST", "INVENTORYENTRIES.LIST"],
  allocationLists: ["ACCOUNTINGALLOCATIONS.LIST", "LEDGERENTRIES.LIST"],
  batchLists: ["BATCHALLOCATIONS.LIST"],
  billLists: ["BILLALLOCATIONS.LIST"],
  ledgerName: "LEDGERNAME", godownName: "GODOWNNAME", batchName: "BATCHNAME", amount: "AMOUNT", partyFlag: "ISPARTYLEDGER", number: "VOUCHERNUMBER",
};

const isNode = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);
const attr = (k: string): boolean => k.startsWith("@_") || k.startsWith("?") || k === "#text";
const get = (n: Node, tag: string): unknown => { for (const k of Object.keys(n)) if (k.toUpperCase() === tag) return n[k]; return undefined; };
const text = (n: Node, tag: string): string => { const v = get(n, tag); return v === undefined ? "" : (tallyText(v) ?? "").trim(); };
const lists = (n: Node, tags: readonly string[]): Node[] => tags.flatMap((t) => asArray(get(n, t)).filter(isNode));

function collectPaths(n: Node, prefix: string, out: Set<string>): void {
  for (const [k, v] of Object.entries(n)) {
    if (attr(k)) continue;
    const p = prefix ? `${prefix}/${k.toUpperCase()}` : k.toUpperCase();
    out.add(p);
    for (const child of asArray(v)) if (isNode(child)) collectPaths(child, p, out);
  }
}

const rank = <T extends { count: number; name: string }>(rows: T[]): T[] => rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

export function learnVoucherBlueprint(vouchers: readonly unknown[], tags: BlueprintTags = TALLY_EXPORT_TAGS): VoucherBlueprint {
  const sample = vouchers.filter(isNode);
  const n = sample.length;
  const frac = (c: number, d: number = n): number => (d === 0 ? 0 : c / d);

  const pathCounts = new Map<string, number>();
  const ledgerCounts = new Map<string, LedgerUsage>();
  const lineLedger = new Map<string, number>();
  const godowns = new Map<string, number>();
  const batches = new Map<string, number>();
  let lines = 0, linesWithGodown = 0, linesWithBatch = 0, numbered = 0, withBill = 0, partyFirst = 0;

  for (const v of sample) {
    const paths = new Set<string>(); collectPaths(v, "", paths);
    for (const p of paths) pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);

    if (text(v, tags.number)) numbered++;

    const entries = lists(v, tags.ledgerLists);
    const seen = new Set<string>();
    entries.forEach((e, i) => {
      const name = text(e, tags.ledgerName); if (!name) return;
      const u = ledgerCounts.get(name) ?? { name, count: 0, fraction: 0, firstCount: 0, negativeCount: 0 };
      if (!seen.has(name)) { u.count++; seen.add(name); }
      if (i === 0) u.firstCount++;
      if (text(e, tags.amount).startsWith("-")) u.negativeCount++;
      ledgerCounts.set(name, u);
    });
    if (entries[0] && text(entries[0], tags.partyFlag).toLowerCase() === "yes") partyFirst++;
    if (entries.some((e) => lists(e, tags.billLists).length > 0)) withBill++;

    const lineSeen = new Set<string>(), gSeen = new Set<string>(), bSeen = new Set<string>();
    for (const inv of lists(v, tags.inventoryLists)) {
      lines++;
      for (const a of lists(inv, tags.allocationLists)) { const nm = text(a, tags.ledgerName); if (nm) lineSeen.add(nm); }
      let g = false, b = false;
      for (const ba of lists(inv, tags.batchLists)) {
        const gn = text(ba, tags.godownName), bn = text(ba, tags.batchName);
        if (gn) { gSeen.add(gn); g = true; }
        if (bn) { bSeen.add(bn); b = true; }
      }
      if (g) linesWithGodown++;
      if (b) linesWithBatch++;
    }
    for (const x of lineSeen) lineLedger.set(x, (lineLedger.get(x) ?? 0) + 1);
    for (const x of gSeen) godowns.set(x, (godowns.get(x) ?? 0) + 1);
    for (const x of bSeen) batches.set(x, (batches.get(x) ?? 0) + 1);
  }

  const toNames = (m: Map<string, number>): NameStat[] => rank([...m].map(([name, count]) => ({ name, count, fraction: frac(count) })));
  const skeleton = [...pathCounts].map(([path, count]) => ({ path, count, fraction: frac(count) })).sort((a, b) => a.path.localeCompare(b.path));

  return {
    sampleSize: n,
    skeleton,
    corePaths: n === 0 ? [] : skeleton.filter((s) => s.count === n).map((s) => s.path),
    ledgers: rank([...ledgerCounts.values()].map((u) => ({ ...u, fraction: frac(u.count) }))),
    lineLedgers: toNames(lineLedger),
    godowns: toNames(godowns),
    batches: toNames(batches),
    lineGodownFraction: frac(linesWithGodown, lines),
    lineBatchFraction: frac(linesWithBatch, lines),
    numberedFraction: frac(numbered),
    billReferenceFraction: frac(withBill),
    partyFirstFraction: frac(partyFirst),
  };
}

export interface BlueprintChoice<T> { value: T; confidence: number; evidence: string }

/** The single ledger used on inventory lines, only if one dominates; otherwise undefined (ask the owner). */
export function dominantLineLedger(bp: VoucherBlueprint, minConfidence: number): BlueprintChoice<string> | undefined {
  const top = bp.lineLedgers[0];
  if (!top || top.fraction < minConfidence) return undefined;
  return { value: top.name, confidence: top.fraction, evidence: `${top.count}/${bp.sampleSize} vouchers` };
}

/** A godown/batch is only worth emitting when lines actually carry one consistently. */
export function dominantGodown(bp: VoucherBlueprint, minConfidence: number): BlueprintChoice<string> | undefined {
  const top = bp.godowns[0];
  if (!top || bp.lineGodownFraction < minConfidence || top.fraction < minConfidence) return undefined;
  return { value: top.name, confidence: Math.min(top.fraction, bp.lineGodownFraction), evidence: `${top.count}/${bp.sampleSize} vouchers` };
}

/** Round-off usage among a profile's round-off candidates (names come from the profile roles, not from here). */
export function roundOffUsage(bp: VoucherBlueprint, candidates: readonly string[]): { name: string; fraction: number; negativeShare: number } | undefined {
  const set = new Set(candidates.map((c) => c.trim().toLowerCase()));
  const hit = bp.ledgers.find((l) => set.has(l.name.trim().toLowerCase()));
  return hit ? { name: hit.name, fraction: hit.fraction, negativeShare: hit.count === 0 ? 0 : hit.negativeCount / hit.count } : undefined;
}
