import { createHash } from "node:crypto";
import type { TallyClient } from "../client.js";
import { TallyReader } from "../xml/reader.js";
import { TALLY_PRIME_DIALECT, type DutyHeadKey, type TallyDialect } from "../dialects/tally.js";
import type { LedgerNames, TaxLedgerNaming } from "../post/salesInvoice.js";

/**
 * CompanyProfile: facts about ONE Tally company, discovered from Tally itself.
 * Ledgers are classified by Tally's group structure and attributes (reserved group ancestry, GST duty head),
 * never by their names; where the data is ambiguous the profile raises a question for the owner instead of guessing.
 */
export const LedgerRole = {
  SALES: "SALES", PURCHASE: "PURCHASE", TAX_CGST: "TAX_CGST", TAX_SGST: "TAX_SGST", TAX_IGST: "TAX_IGST", TAX_CESS: "TAX_CESS",
  TAX_UNKNOWN: "TAX_UNKNOWN", CASH: "CASH", BANK: "BANK", DEBTOR: "DEBTOR", CREDITOR: "CREDITOR", OTHER: "OTHER",
} as const;
export type LedgerRole = (typeof LedgerRole)[keyof typeof LedgerRole];

export interface RawLedger { name: string; parent: string; guid?: string; alterId?: number; affectsStock?: boolean; dutyHead?: string; rate?: number; isBillWise?: boolean; gstin?: string; state?: string }
export interface RawMasters {
  company: { name: string; guid: string; number: string; state?: string; country?: string; startingFrom?: string; booksFrom?: string };
  groups: Array<{ name: string; parent: string; guid?: string; alterId?: number }>;
  ledgers: RawLedger[];
  voucherTypes: Array<{ name: string; parent: string; numberingMethod?: string; guid?: string; alterId?: number }>;
  units: Array<{ name: string; uqc?: string; guid?: string; alterId?: number }>;
  godowns: Array<{ name: string; parent?: string; guid?: string; alterId?: number }>;
}

export const TaxNamingStatus = { COMMON: "COMMON", PER_RATE: "PER_RATE", INCOMPLETE: "INCOMPLETE", NONE: "NONE" } as const;
export type TaxNamingStatus = (typeof TaxNamingStatus)[keyof typeof TaxNamingStatus];

export const QuestionCode = {
  NO_SALES_LEDGER: "NO_SALES_LEDGER", PICK_SALES_LEDGER: "PICK_SALES_LEDGER", TAX_LEDGERS_INCOMPLETE: "TAX_LEDGERS_INCOMPLETE",
  TAX_LEDGER_AMBIGUOUS: "TAX_LEDGER_AMBIGUOUS", TAX_LEDGER_UNKNOWN_HEAD: "TAX_LEDGER_UNKNOWN_HEAD", PICK_ROUND_OFF: "PICK_ROUND_OFF",
} as const;
export type QuestionCode = (typeof QuestionCode)[keyof typeof QuestionCode];
export interface ProfileQuestion { code: QuestionCode; candidates: string[]; detail?: string }

export interface TaxNaming { status: TaxNamingStatus; naming?: TaxLedgerNaming; missingHeads: DutyHeadKey[] }

export interface CompanyProfile {
  company: RawMasters["company"];
  roles: Record<LedgerRole, string[]>;
  stockSalesLedgers: string[];
  billWiseParties: number;
  totalLedgers: number;
  taxNaming: TaxNaming;
  voucherTypes: RawMasters["voucherTypes"];
  units: RawMasters["units"];
  godowns: string[];
  questions: ProfileQuestion[];
  fingerprint: string;
  discoveredAt: string;
}

const norm = (s: string): string => s.trim().toLowerCase();
const TAX_ROLES: ReadonlySet<LedgerRole> = new Set([LedgerRole.TAX_CGST, LedgerRole.TAX_SGST, LedgerRole.TAX_IGST, LedgerRole.TAX_CESS]);

/** Nearest-first ancestor chain of a group (cycle-safe, includes the group itself). */
export function groupChain(group: string, parents: ReadonlyMap<string, string>): string[] {
  const out: string[] = []; const seen = new Set<string>(); let cur = group;
  while (cur && !seen.has(norm(cur))) { seen.add(norm(cur)); out.push(cur); cur = parents.get(norm(cur)) ?? ""; }
  return out;
}

export function classifyLedger(ledger: RawLedger, parents: ReadonlyMap<string, string>, dialect: TallyDialect = TALLY_PRIME_DIALECT): LedgerRole {
  const chain = groupChain(ledger.parent, parents).map(norm);
  const g = dialect.reservedGroups;
  const within = (reserved: string): boolean => chain.includes(norm(reserved));
  if (within(g.dutiesTaxes)) {
    const head = ledger.dutyHead ? dialect.dutyHeadAliases[norm(ledger.dutyHead)] : undefined;
    return head === "cgst" ? LedgerRole.TAX_CGST : head === "sgst" ? LedgerRole.TAX_SGST : head === "igst" ? LedgerRole.TAX_IGST
      : head === "cess" ? LedgerRole.TAX_CESS : LedgerRole.TAX_UNKNOWN;
  }
  if (within(g.sales)) return LedgerRole.SALES;
  if (within(g.purchase)) return LedgerRole.PURCHASE;
  if (within(g.cash)) return LedgerRole.CASH;
  if (within(g.bank)) return LedgerRole.BANK;
  if (within(g.debtors)) return LedgerRole.DEBTOR;
  if (within(g.creditors)) return LedgerRole.CREDITOR;
  return LedgerRole.OTHER;
}

export class UnknownTaxLedgerError extends Error {
  constructor(readonly head: DutyHeadKey, readonly basisPoints: number) {
    super(`No ${head} tax ledger discovered for rate ${basisPoints / 100}%`);
    this.name = "UnknownTaxLedgerError";
  }
}

function resolveTaxNaming(taxLedgers: Array<{ name: string; head: DutyHeadKey; rate?: number }>): { naming: TaxNaming; questions: ProfileQuestion[] } {
  const questions: ProfileQuestion[] = [];
  const byHead = (h: DutyHeadKey) => taxLedgers.filter((l) => l.head === h);
  const required: DutyHeadKey[] = ["cgst", "sgst", "igst"];
  const missing = required.filter((h) => byHead(h).length === 0);
  if (taxLedgers.length === 0) return { naming: { status: TaxNamingStatus.NONE, missingHeads: required }, questions };
  if (missing.length) {
    questions.push({ code: QuestionCode.TAX_LEDGERS_INCOMPLETE, candidates: taxLedgers.map((l) => l.name), detail: `missing: ${missing.join(", ")}` });
    return { naming: { status: TaxNamingStatus.INCOMPLETE, missingHeads: missing }, questions };
  }
  if (required.every((h) => byHead(h).length === 1) && byHead("cess").length <= 1) {
    const c = byHead("cess")[0];
    return { naming: { status: TaxNamingStatus.COMMON, missingHeads: [], naming: { mode: "COMMON", cgst: byHead("cgst")[0].name, sgst: byHead("sgst")[0].name, igst: byHead("igst")[0].name, ...(c ? { cess: c.name } : {}) } }, questions };
  }
  // several ledgers per head: usable only if each carries a distinct rate
  const heads: DutyHeadKey[] = [...required, "cess"];
  const table = new Map<string, string>(); let ambiguous = false;
  for (const h of heads) for (const l of byHead(h)) {
    if (l.rate === undefined) { ambiguous = true; continue; }
    const k = `${h}|${Math.round(l.rate * 100)}`;
    if (table.has(k)) ambiguous = true; else table.set(k, l.name);
  }
  if (ambiguous) {
    questions.push({ code: QuestionCode.TAX_LEDGER_AMBIGUOUS, candidates: taxLedgers.map((l) => l.name), detail: "several tax ledgers per duty head without a distinct rate" });
    return { naming: { status: TaxNamingStatus.INCOMPLETE, missingHeads: [] }, questions };
  }
  return { naming: { status: TaxNamingStatus.PER_RATE, missingHeads: [], naming: { mode: "PER_RATE", name: (head, bp) => { const n = table.get(`${head}|${bp}`); if (!n) throw new UnknownTaxLedgerError(head, bp); return n; } } }, questions };
}

export function computeFingerprint(raw: RawMasters): string {
  const lines: string[] = [];
  const add = (kind: string, rows: Array<{ guid?: string; alterId?: number; name: string }>) => rows.forEach((r) => lines.push(`${kind}|${r.guid ?? r.name}|${r.alterId ?? ""}`));
  add("g", raw.groups); add("l", raw.ledgers); add("v", raw.voucherTypes); add("u", raw.units); add("d", raw.godowns);
  lines.push(`c|${raw.company.guid}`);
  return createHash("sha1").update(lines.sort().join("\n")).digest("hex");
}

/** Pure: turn raw masters into a profile (no I/O, deterministic). */
export function buildCompanyProfile(raw: RawMasters, dialect: TallyDialect = TALLY_PRIME_DIALECT, now: () => string = () => new Date().toISOString()): CompanyProfile {
  const parents = new Map(raw.groups.filter((g) => g.parent).map((g) => [norm(g.name), g.parent]));
  const roles = Object.fromEntries(Object.values(LedgerRole).map((r) => [r, [] as string[]])) as Record<LedgerRole, string[]>;
  const taxLedgers: Array<{ name: string; head: DutyHeadKey; rate?: number }> = [];
  const stockSales: string[] = []; let billWise = 0;
  for (const l of raw.ledgers) {
    const role = classifyLedger(l, parents, dialect);
    roles[role].push(l.name);
    if (role === LedgerRole.SALES && l.affectsStock) stockSales.push(l.name);
    if ((role === LedgerRole.DEBTOR || role === LedgerRole.CREDITOR) && l.isBillWise) billWise += 1;
    const head = l.dutyHead ? dialect.dutyHeadAliases[norm(l.dutyHead)] : undefined;
    if (head && TAX_ROLES.has(role)) taxLedgers.push({ name: l.name, head, rate: l.rate });
  }
  const { naming, questions } = resolveTaxNaming(taxLedgers);
  const salesCandidates = stockSales.length ? stockSales : roles.SALES;
  if (salesCandidates.length === 0) questions.push({ code: QuestionCode.NO_SALES_LEDGER, candidates: [] });
  else if (salesCandidates.length > 1) questions.push({ code: QuestionCode.PICK_SALES_LEDGER, candidates: salesCandidates });
  for (const name of roles.TAX_UNKNOWN) questions.push({ code: QuestionCode.TAX_LEDGER_UNKNOWN_HEAD, candidates: [name] });
  return {
    company: raw.company, roles, stockSalesLedgers: stockSales, billWiseParties: billWise, totalLedgers: raw.ledgers.length, taxNaming: naming,
    voucherTypes: raw.voucherTypes, units: raw.units, godowns: raw.godowns.map((g) => g.name), questions, fingerprint: computeFingerprint(raw), discoveredAt: now(),
  };
}

/**
 * Names for an invoice from a profile. Anything not uniquely determined (sales ledger, round-off) must be chosen by the
 * owner and passed in `choices`; the returned questions say what is still open.
 */
export function suggestLedgerNames(profile: CompanyProfile, choices: { sales?: string; roundOff?: string } = {}): { ledgers?: LedgerNames; questions: ProfileQuestion[] } {
  const questions: ProfileQuestion[] = [];
  const salesCandidates = profile.stockSalesLedgers.length ? profile.stockSalesLedgers : profile.roles.SALES;
  const sales = choices.sales ?? (salesCandidates.length === 1 ? salesCandidates[0] : undefined);
  if (!sales) questions.push({ code: salesCandidates.length ? QuestionCode.PICK_SALES_LEDGER : QuestionCode.NO_SALES_LEDGER, candidates: salesCandidates });
  if (!profile.taxNaming.naming) questions.push({ code: QuestionCode.TAX_LEDGERS_INCOMPLETE, candidates: [], detail: `tax ledgers ${profile.taxNaming.status}` });
  if (!sales || !profile.taxNaming.naming) return { questions };
  return { ledgers: { sales, tax: profile.taxNaming.naming, ...(choices.roundOff ? { roundOff: choices.roundOff } : {}) }, questions };
}

// ---- discovery from a live Tally ---------------------------------------------------------------------------------
const rawOf = (o: unknown): TallyReader => new TallyReader(((o as { _raw?: Record<string, unknown> })._raw ?? {}) as Record<string, unknown>);
const yes = (v: string | undefined): boolean | undefined => (v === undefined ? undefined : /^yes$/i.test(v));

export interface DiscoverOptions { companyName?: string; companyNumber?: string; dialect?: TallyDialect; now?: () => string }

/** Read the masters a profile needs with explicit named fields (no wildcards) and build the profile. */
export async function discoverCompanyProfile(client: TallyClient, options: DiscoverOptions = {}): Promise<CompanyProfile> {
  const dialect = options.dialect ?? TALLY_PRIME_DIALECT;
  const loaded = await client.getLoadedCompanies();
  const pick = options.companyNumber ? loaded.find((c) => c.number === options.companyNumber) : options.companyName ? loaded.find((c) => c.name === options.companyName) : loaded.length === 1 ? loaded[0] : undefined;
  if (!pick) throw new Error(loaded.length === 0 ? "No company is loaded in Tally" : "Several companies are loaded; pass companyName or companyNumber");
  const company = pick.name;
  const [companies, groups, ledgers, voucherTypes, units, godowns] = await Promise.all([
    client.getObjects("Company", { company, fetchList: dialect.fetch.company }),
    client.getObjects("Group", { company, fetchList: dialect.fetch.group }),
    client.getObjects("Ledger", { company, fetchList: dialect.fetch.ledger }),
    client.getObjects("VoucherType", { company, fetchList: dialect.fetch.voucherType }),
    client.getObjects("Unit", { company, fetchList: dialect.fetch.unit }),
    client.getObjects("Godown", { company, fetchList: dialect.fetch.godown }),
  ]);
  const co = companies.find((c) => c.name === company) ?? companies[0];
  const cr = rawOf(co);
  const raw: RawMasters = {
    company: { name: company, guid: pick.guid, number: pick.number, state: cr.text("STATENAME") ?? (co as { state?: string })?.state, country: cr.text("COUNTRYNAME"), startingFrom: cr.text("STARTINGFROM"), booksFrom: cr.text("BOOKSFROM") },
    groups: groups.map((g) => ({ name: g.name, parent: g.parent ?? "", guid: g.guid, alterId: g.alterId })),
    ledgers: ledgers.map((l) => { const r = rawOf(l); return { name: l.name, parent: l.parent ?? "", guid: l.guid, alterId: l.alterId, affectsStock: yes(r.text("AFFECTSSTOCK")), dutyHead: r.text("GSTDUTYHEAD"), rate: r.number("RATEOFTAXCALCULATION"), isBillWise: yes(r.text("ISBILLWISEON")), gstin: r.text("PARTYGSTIN"), state: r.text("LEDSTATENAME") }; }),
    voucherTypes: voucherTypes.map((v) => ({ name: v.name, parent: v.parent ?? "", numberingMethod: rawOf(v).text("NUMBERINGMETHOD"), guid: v.guid, alterId: v.alterId })),
    units: units.map((u) => ({ name: u.name, uqc: rawOf(u).text("GSTREPUOM"), guid: u.guid, alterId: u.alterId })),
    godowns: godowns.map((g) => ({ name: g.name, parent: g.parent, guid: g.guid, alterId: g.alterId })),
  };
  return buildCompanyProfile(raw, dialect, options.now);
}
