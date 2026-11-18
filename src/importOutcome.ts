import type { PostResponse } from "./xmlParser.js";

/** Machine-readable reasons an import can fail. Extend with real `Tally.imp` samples as they are collected. */
export const ImportErrorCode = {
  TOTALS_MISMATCH: "TOTALS_MISMATCH",
  MASTER_MISSING: "MASTER_MISSING",
  VOUCHER_TYPE_MISSING: "VOUCHER_TYPE_MISSING",
  DATE_OUT_OF_RANGE: "DATE_OUT_OF_RANGE",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  COMPANY_NOT_LOADED: "COMPANY_NOT_LOADED",
  UNKNOWN: "UNKNOWN",
} as const;
export type ImportErrorCode = (typeof ImportErrorCode)[keyof typeof ImportErrorCode];

/** TRANSIENT = retrying later can succeed without anyone changing data; PERMANENT = needs a data/config fix. */
export const ImportErrorClass = {
  TRANSIENT: "TRANSIENT",
  PERMANENT: "PERMANENT",
} as const;
export type ImportErrorClass = (typeof ImportErrorClass)[keyof typeof ImportErrorClass];

export const ImportErrorSource = {
  LINEERROR: "LINEERROR",
  IMPORT_LOG: "IMPORT_LOG",
  NONE: "NONE",
} as const;
export type ImportErrorSource = (typeof ImportErrorSource)[keyof typeof ImportErrorSource];

export type ImportErrorDetail =
  | { masterKind: string; masterName: string }
  | { debit: number; credit: number; difference: number };

export interface ImportErrorInfo {
  code: ImportErrorCode;
  class: ImportErrorClass;
  text: string;
  source: ImportErrorSource;
  detail?: ImportErrorDetail;
}

interface Rule {
  code: ImportErrorCode;
  class: ImportErrorClass;
  pattern: RegExp;
  detail?: (match: RegExpMatchArray) => ImportErrorDetail | undefined;
}

const toNumber = (s: string): number => Number(s.replace(/,/g, ""));

// Chain of responsibility: first matching rule wins, so order encodes specificity.
const RULES: readonly Rule[] = [
  {
    code: ImportErrorCode.TOTALS_MISMATCH,
    class: ImportErrorClass.PERMANENT,
    pattern: /voucher totals do not match[\s\S]*?Dr:\s*([\d,]+(?:\.\d+)?)[^C]*?Cr:\s*([\d,]+(?:\.\d+)?)[\s\S]*?Diff:\s*([\d,]+(?:\.\d+)?)/i,
    detail: (m) => ({ debit: toNumber(m[1]), credit: toNumber(m[2]), difference: toNumber(m[3]) }),
  },
  { code: ImportErrorCode.VOUCHER_TYPE_MISSING, class: ImportErrorClass.PERMANENT, pattern: /voucher type\s+'[^']*'\s+does not exist/i },
  {
    code: ImportErrorCode.MASTER_MISSING,
    class: ImportErrorClass.PERMANENT,
    pattern: /(Ledger|Stock Item|Stock Group|Unit|Godown|Group|Cost Centre|Currency|Batch)\s+'([^']+)'\s+does not exist/i,
    detail: (m) => ({ masterKind: m[1], masterName: m[2] }),
  },
  { code: ImportErrorCode.DATE_OUT_OF_RANGE, class: ImportErrorClass.PERMANENT, pattern: /date is out of range/i },
  { code: ImportErrorCode.ALREADY_EXISTS, class: ImportErrorClass.PERMANENT, pattern: /already exists/i },
  { code: ImportErrorCode.COMPANY_NOT_LOADED, class: ImportErrorClass.TRANSIENT, pattern: /could not set 'SVCurrentCompany'/i },
];

export function classifyImportError(text: string, source: ImportErrorSource = ImportErrorSource.LINEERROR): ImportErrorInfo {
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      const detail = rule.detail?.(match);
      return { code: rule.code, class: rule.class, text, source, ...(detail ? { detail } : {}) };
    }
  }
  return { code: ImportErrorCode.UNKNOWN, class: ImportErrorClass.PERMANENT, text, source };
}

/**
 * Classify a failed import. Prefers Tally's LINEERROR text; falls back to the text appended to
 * Tally.imp during the import (TallyPrime 3.0+ may leave LINEERROR empty). Returns undefined on success.
 */
export function classifyImportOutcome(response: PostResponse, importLogText?: string): ImportErrorInfo | undefined {
  if (response.status === "success") return undefined;
  if (response.lineErrors?.length) {
    return classifyImportError(response.lineErrors.join("; "), ImportErrorSource.LINEERROR);
  }
  const log = importLogText?.trim();
  if (log) return classifyImportError(log, ImportErrorSource.IMPORT_LOG);
  return classifyImportError(response.message, ImportErrorSource.NONE);
}
