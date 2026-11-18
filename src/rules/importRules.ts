import type { RulePackData } from "./rulePack.js";

/** Built-in import-error rules for the TallyPrime family. Data only: the same shape can be delivered as a signed pack. First match wins, so order encodes specificity. */
export const TALLY_PRIME_IMPORT_RULES: RulePackData = {
  family: "tallyprime-import",
  version: 1,
  rules: [
    { id: "totals-mismatch", code: "TOTALS_MISMATCH", class: "PERMANENT", flags: "i", pattern: "voucher totals do not match[\\s\\S]*?Dr:\\s*([\\d,]+(?:\\.\\d+)?)[^C]*?Cr:\\s*([\\d,]+(?:\\.\\d+)?)[\\s\\S]*?Diff:\\s*([\\d,]+(?:\\.\\d+)?)", detail: { kind: "totals", debitGroup: 1, creditGroup: 2, differenceGroup: 3 } },
    { id: "voucher-type-missing", code: "VOUCHER_TYPE_MISSING", class: "PERMANENT", flags: "i", pattern: "voucher type\\s+'[^']*'\\s+does not exist" },
    { id: "master-missing", code: "MASTER_MISSING", class: "PERMANENT", flags: "i", pattern: "(Ledger|Stock Item|Stock Group|Unit|Godown|Group|Cost Centre|Currency|Batch)\\s+'([^']+)'\\s+does not exist", detail: { kind: "master", kindGroup: 1, nameGroup: 2 } },
    { id: "date-out-of-range", code: "DATE_OUT_OF_RANGE", class: "PERMANENT", flags: "i", pattern: "date is out of range" },
    { id: "already-exists", code: "ALREADY_EXISTS", class: "PERMANENT", flags: "i", pattern: "already exists" },
    { id: "company-not-loaded", code: "COMPANY_NOT_LOADED", class: "TRANSIENT", flags: "i", pattern: "could not set 'SVCurrentCompany'" },
  ],
};
