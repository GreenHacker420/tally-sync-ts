import type { LedgerNames } from "../post/salesInvoice.js";
import { QuestionCode, type CompanyProfile, type ProfileQuestion } from "./companyProfile.js";
import { dominantLineLedger, type VoucherBlueprint } from "./blueprint.js";

export interface LearnedNames {
  ledgers?: LedgerNames;
  /** Where each value came from, e.g. `tax.cgst: CGST (294/296 vouchers, share 1.00)`. */
  provenance: Record<string, string>;
  questions: ProfileQuestion[];
}

const norm = (s: string): string => s.trim().toLowerCase();

/** The candidate that carries (almost) all the usage among the candidates; undefined when usage is split or absent. */
function pickByUsage(candidates: readonly string[], bp: VoucherBlueprint, minShare: number): { name: string; evidence: string } | undefined {
  const used = new Map(bp.ledgers.map((l) => [norm(l.name), l.count]));
  const counts = candidates.map((name) => ({ name, count: used.get(norm(name)) ?? 0 }));
  const total = counts.reduce((a, c) => a + c.count, 0);
  if (total === 0) return undefined;
  const top = counts.reduce((a, c) => (c.count > a.count ? c : a));
  const share = top.count / total;
  return share >= minShare ? { name: top.name, evidence: `${top.count}/${bp.sampleSize} vouchers, share ${share.toFixed(2)}` } : undefined;
}

/**
 * Resolve the ledger names an invoice needs by combining the discovered profile (what exists, by role) with the
 * blueprint (what this company actually uses). A ledger that exists but is never used (a dummy or legacy ledger)
 * loses to the one the company really posts to; anything still ambiguous becomes a question for the owner.
 */
export function learnLedgerNames(profile: CompanyProfile, bp: VoucherBlueprint, options: { minConfidence?: number } = {}): LearnedNames {
  const min = options.minConfidence ?? 0.9;
  const provenance: Record<string, string> = {};
  const questions: ProfileQuestion[] = [];

  const sales = dominantLineLedger(bp, min);
  if (sales) provenance.sales = `${sales.value} (${sales.evidence})`;
  else {
    const only = profile.stockSalesLedgers.length === 1 ? profile.stockSalesLedgers[0] : undefined;
    if (only) provenance.sales = `${only} (only stock-affecting sales ledger)`;
    else questions.push({ code: profile.roles.SALES.length ? QuestionCode.PICK_SALES_LEDGER : QuestionCode.NO_SALES_LEDGER, candidates: profile.stockSalesLedgers.length ? profile.stockSalesLedgers : profile.roles.SALES });
  }
  const salesName = sales?.value ?? (profile.stockSalesLedgers.length === 1 ? profile.stockSalesLedgers[0] : undefined);

  const heads = { cgst: profile.roles.TAX_CGST, sgst: profile.roles.TAX_SGST, igst: profile.roles.TAX_IGST, cess: profile.roles.TAX_CESS } as const;
  const chosen: Partial<Record<keyof typeof heads, string>> = {};
  for (const [head, candidates] of Object.entries(heads) as Array<[keyof typeof heads, string[]]>) {
    if (candidates.length === 1) { chosen[head] = candidates[0]; provenance[`tax.${head}`] = `${candidates[0]} (only ${head} ledger)`; continue; }
    const hit = pickByUsage(candidates, bp, min);
    if (hit) { chosen[head] = hit.name; provenance[`tax.${head}`] = `${hit.name} (${hit.evidence})`; }
    else if (candidates.length > 1 && head !== "cess") questions.push({ code: QuestionCode.TAX_LEDGER_AMBIGUOUS, candidates: [...candidates], detail: `${head}: no ledger dominates usage` });
  }
  for (const name of profile.roles.TAX_UNKNOWN) questions.push({ code: QuestionCode.TAX_LEDGER_UNKNOWN_HEAD, candidates: [name] });

  // Round-off is a non-party, non-tax ledger the company posts to on some vouchers and not others.
  const other = new Set(profile.roles.OTHER.map(norm));
  const roundCandidates = bp.ledgers.filter((l) => other.has(norm(l.name)) && l.fraction < 1);
  const roundOff = roundCandidates[0];
  if (roundOff && (roundCandidates.length === 1 || roundOff.count > roundCandidates[1].count * 2)) provenance.roundOff = `${roundOff.name} (${roundOff.count}/${bp.sampleSize} vouchers, ${roundOff.negativeCount} negative)`;
  else if (roundCandidates.length > 1) questions.push({ code: QuestionCode.PICK_ROUND_OFF, candidates: roundCandidates.map((l) => l.name) });

  const taxReady = chosen.cgst && chosen.sgst && chosen.igst;
  if (!salesName || !taxReady) {
    if (!taxReady && !questions.some((q) => q.code === QuestionCode.TAX_LEDGER_AMBIGUOUS)) questions.push({ code: QuestionCode.TAX_LEDGERS_INCOMPLETE, candidates: [], detail: "cgst, sgst and igst ledgers are all required" });
    return { provenance, questions };
  }
  return {
    ledgers: { sales: salesName, tax: { mode: "COMMON", cgst: chosen.cgst!, sgst: chosen.sgst!, igst: chosen.igst!, ...(chosen.cess ? { cess: chosen.cess } : {}) }, ...(provenance.roundOff && roundOff ? { roundOff: roundOff.name } : {}) },
    provenance,
    questions,
  };
}
