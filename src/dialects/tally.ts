/**
 * Tally dialect: protocol facts that Tally itself defines (reserved group and voucher-type names, duty-head names,
 * safe field lists). This is DATA, kept in one place per release family, so engine code never carries Tally
 * vocabulary or company-specific values. Company facts (ledger names, state, godowns...) are discovered, learned or
 * configured - never put here.
 */
export type DutyHeadKey = "cgst" | "sgst" | "igst" | "cess" | "stateCess";

export interface TallyDialect {
  id: string;
  /** First TallyPrime major release this dialect targets. */
  minRelease: number;
  /** Tally's reserved (primary) group names; fixed by the product, identical in every company. */
  reservedGroups: {
    sales: string; purchase: string; dutiesTaxes: string; debtors: string; creditors: string; cash: string; bank: string;
  };
  /** Reserved voucher-type names that other types are derived from. */
  voucherTypes: { sales: string; receipt: string; creditNote: string; purchase: string; payment: string };
  /** Duty-head names as written in an IMPORT (differs from the names Tally exports). */
  importDutyHeads: Record<DutyHeadKey, string>;
  /** Every spelling Tally uses for a duty head (export and import), lower-cased. */
  dutyHeadAliases: Record<string, DutyHeadKey>;
  /** GST taxability values that carry no tax. */
  nonTaxablePattern: RegExp;
  /**
   * Named field lists for discovery reads. Explicit on purpose: a wildcard fetch of the Company object stopped a real
   * TallyPrime 7.1 answering XML, and named lists are also much smaller.
   */
  fetch: { company: string[]; group: string[]; ledger: string[]; voucherType: string[]; unit: string[]; godown: string[] };
}

export const TALLY_PRIME_DIALECT: TallyDialect = {
  id: "tallyprime-3plus",
  minRelease: 3,
  reservedGroups: {
    sales: "Sales Accounts", purchase: "Purchase Accounts", dutiesTaxes: "Duties & Taxes",
    debtors: "Sundry Debtors", creditors: "Sundry Creditors", cash: "Cash-in-Hand", bank: "Bank Accounts",
  },
  voucherTypes: { sales: "Sales", receipt: "Receipt", creditNote: "Credit Note", purchase: "Purchase", payment: "Payment" },
  importDutyHeads: { cgst: "Central Tax", sgst: "State Tax", igst: "Integrated Tax", cess: "Cess", stateCess: "State Cess" },
  dutyHeadAliases: {
    "cgst": "cgst", "central tax": "cgst",
    "sgst/utgst": "sgst", "sgst": "sgst", "utgst": "sgst", "state tax": "sgst",
    "igst": "igst", "integrated tax": "igst",
    "cess": "cess", "state cess": "stateCess",
  },
  nonTaxablePattern: /^(exempt|nil.?rated|non.?gst)$/i,
  fetch: {
    company: ["Name", "GUID", "MasterId", "AlterId", "CompanyNumber", "StartingFrom", "BooksFrom", "StateName", "CountryName"],
    group: ["Name", "Parent", "GUID", "MasterId", "AlterId", "IsRevenue", "IsDeemedPositive"],
    ledger: ["Name", "Parent", "GUID", "MasterId", "AlterId", "AffectsStock", "GSTDutyHead", "TaxType", "GSTTypeOfSupply", "RateOfTaxCalculation", "IsBillWiseOn", "PartyGSTIN", "LedStateName", "GSTRegistrationType"],
    voucherType: ["Name", "Parent", "GUID", "MasterId", "AlterId", "NumberingMethod", "AffectsStock"],
    unit: ["Name", "GUID", "MasterId", "AlterId", "IsSimpleUnit", "GSTRepUOM"],
    godown: ["Name", "Parent", "GUID", "MasterId", "AlterId"],
  },
};

/** Pick the dialect for a detected release (only one family today; the seam exists for 2.x / 6.x+ packs). */
export function selectDialect(release?: { major: number }): TallyDialect {
  void release;
  return TALLY_PRIME_DIALECT;
}
