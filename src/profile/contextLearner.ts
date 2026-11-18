import type { TallyClient } from "../client.js";
import { policyDefault, type ResolvedPolicy } from "../config/policy.js";
import { TALLY_PRIME_DIALECT, type TallyDialect } from "../dialects/tally.js";
import { monthWindows } from "../voucherIndex.js";
import { learnVoucherBlueprint, type VoucherBlueprint } from "./blueprint.js";
import { discoverCompanyProfile, type CompanyProfile, type ProfileQuestion } from "./companyProfile.js";
import { resolveInvoiceContext, type InvoiceContext } from "./invoiceContext.js";

export interface LearnedCompany {
  profile: CompanyProfile;
  blueprint: VoucherBlueprint;
  context?: InvoiceContext;
  questions: ProfileQuestion[];
  provenance: Record<string, string>;
  learnedAt: string;
}

export interface ContextLearnerOptions {
  companyName?: string;
  companyNumber?: string;
  dialect?: TallyDialect;
  policy?: ResolvedPolicy;
  now?: () => Date;
}

const ymd = (d: Date): string => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/**
 * Keeps one company's learned context. The (cheap) masters are re-read on every call and their fingerprint decides
 * whether the (heavy) voucher sample is read again: only when the masters changed or the context grew stale.
 */
export class CompanyContextLearner {
  private cached?: LearnedCompany;
  constructor(private readonly client: TallyClient, private readonly options: ContextLearnerOptions = {}) {}

  private num(key: "learn.sampleVouchers" | "learn.maxMonths" | "learn.minConfidencePercent" | "learn.refreshHours"): number {
    return (this.options.policy?.values[key] as number | undefined) ?? policyDefault(key);
  }

  async resolve(): Promise<LearnedCompany & { fromCache: boolean }> {
    const now = this.options.now?.() ?? new Date();
    const dialect = this.options.dialect ?? TALLY_PRIME_DIALECT;
    const profile = await discoverCompanyProfile(this.client, { companyName: this.options.companyName, companyNumber: this.options.companyNumber, dialect });
    const fresh = this.cached && this.cached.profile.fingerprint === profile.fingerprint && now.getTime() - Date.parse(this.cached.learnedAt) < this.num("learn.refreshHours") * 3_600_000;
    if (fresh) return { ...this.cached!, profile, fromCache: true };

    const sample = await this.readSample(profile.company.name, dialect.voucherTypes.sales, now);
    const blueprint = learnVoucherBlueprint(sample);
    const resolved = resolveInvoiceContext(profile, blueprint, { minConfidence: this.num("learn.minConfidencePercent") / 100 });
    this.cached = { profile, blueprint, context: resolved.context, questions: [...profile.questions.filter((q) => !resolved.questions.some((r) => r.code === q.code)), ...resolved.questions], provenance: resolved.provenance, learnedAt: now.toISOString() };
    return { ...this.cached, fromCache: false };
  }

  private async readSample(company: string, voucherType: string, now: Date): Promise<Record<string, unknown>[]> {
    const want = this.num("learn.sampleVouchers"), months = this.num("learn.maxMonths");
    const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    let sample: Record<string, unknown>[] = [];
    for (const w of monthWindows(ymd(from), ymd(now)).reverse()) {
      sample = sample.concat(await this.client.getRawVoucherWindow(w, { company, voucherType }));
      if (sample.length >= want) break;
    }
    return sample.slice(0, want);
  }
}
