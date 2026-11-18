import { buildSalesInvoice, type BuiltSalesInvoice, type InvoiceLineInput, type LedgerNames, type SalesInvoiceInput } from "../post/salesInvoice.js";
import { dominantBatch, dominantGodown, type VoucherBlueprint } from "./blueprint.js";
import type { CompanyProfile, ProfileQuestion } from "./companyProfile.js";
import { learnLedgerNames } from "./learnedNames.js";

/** Everything company-specific an invoice needs, resolved from Tally's own data. Nothing here is typed by a developer. */
export interface InvoiceContext {
  companyState: string;
  ledgers: LedgerNames;
  /** Applied to a line that does not name its own godown / batch. */
  godown?: string;
  batch?: string;
  provenance: Record<string, string>;
}

export interface InvoiceContextResult { context?: InvoiceContext; questions: ProfileQuestion[]; provenance: Record<string, string> }

export function resolveInvoiceContext(profile: CompanyProfile, bp: VoucherBlueprint, options: { minConfidence?: number } = {}): InvoiceContextResult {
  const min = options.minConfidence ?? 0.9;
  const names = learnLedgerNames(profile, bp, { minConfidence: min });
  const provenance = { ...names.provenance };
  const questions = [...names.questions];
  const state = profile.company.state;
  if (!state) return { questions, provenance };
  if (!names.ledgers) return { questions, provenance };
  provenance.companyState = `${state} (company master)`;
  const godown = dominantGodown(bp, min), batch = dominantBatch(bp, min);
  if (godown) provenance.godown = `${godown.value} (${godown.evidence})`;
  if (batch) provenance.batch = `${batch.value} (${batch.evidence})`;
  return {
    context: { companyState: state, ledgers: names.ledgers, ...(godown ? { godown: godown.value } : {}), ...(batch ? { batch: batch.value } : {}), provenance },
    questions, provenance,
  };
}

export type BusinessInvoiceInput = Omit<SalesInvoiceInput, "companyState" | "ledgers">;

/** Render a sales invoice from the business facts plus a resolved company context (no ledger, state, godown or batch literals). */
export function buildSalesInvoiceFor(context: InvoiceContext, input: BusinessInvoiceInput): BuiltSalesInvoice {
  const lines: InvoiceLineInput[] = input.lines.map((l) => ({ ...l, godown: l.godown ?? context.godown, batch: l.batch ?? context.batch }));
  return buildSalesInvoice({ ...input, lines, companyState: context.companyState, ledgers: context.ledgers });
}
