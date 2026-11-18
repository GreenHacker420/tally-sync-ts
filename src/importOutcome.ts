import type { PostResponse } from "./xmlParser.js";
import { compileRulePack, type CompiledPack, type CompiledRule, type QuarantineLog } from "./rules/rulePack.js";
import { TALLY_PRIME_IMPORT_RULES } from "./rules/importRules.js";

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
/** Open-ended: a delivered rule pack may introduce codes this build has never seen. */
export type ImportErrorCode = (typeof ImportErrorCode)[keyof typeof ImportErrorCode] | (string & {});

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

const toNumber = (s: string): number => Number(s.replace(/,/g, ""));
const DEFAULT_PACK = compileRulePack(TALLY_PRIME_IMPORT_RULES);

function readDetail(rule: CompiledRule, m: RegExpMatchArray): ImportErrorDetail | undefined {
  const d = rule.data.detail;
  if (!d) return undefined;
  if (d.kind === "master") return { masterKind: m[d.kindGroup], masterName: m[d.nameGroup] };
  return { debit: toNumber(m[d.debitGroup]), credit: toNumber(m[d.creditGroup]), difference: toNumber(m[d.differenceGroup]) };
}

export interface ClassifyOptions { pack?: CompiledPack; quarantine?: QuarantineLog }

/** Chain of responsibility over the rule pack (data, replaceable): first matching rule wins. Unknown text is quarantined when a log is supplied. */
export function classifyImportError(text: string, source: ImportErrorSource = ImportErrorSource.LINEERROR, options: ClassifyOptions = {}): ImportErrorInfo {
  for (const rule of (options.pack ?? DEFAULT_PACK).rules) {
    const match = text.match(rule.regex);
    if (match) {
      const detail = readDetail(rule, match);
      return { code: rule.data.code as ImportErrorCode, class: rule.data.class, text, source, ...(detail ? { detail } : {}) };
    }
  }
  options.quarantine?.record(text);
  return { code: ImportErrorCode.UNKNOWN, class: ImportErrorClass.PERMANENT, text, source };
}

/**
 * Classify a failed import. Prefers Tally's LINEERROR text; falls back to the text appended to
 * Tally.imp during the import (TallyPrime 3.0+ may leave LINEERROR empty). Returns undefined on success.
 */
export function classifyImportOutcome(response: PostResponse, importLogText?: string, options: ClassifyOptions = {}): ImportErrorInfo | undefined {
  if (response.status === "success") return undefined;
  if (response.lineErrors?.length) {
    return classifyImportError(response.lineErrors.join("; "), ImportErrorSource.LINEERROR, options);
  }
  const log = importLogText?.trim();
  if (log) return classifyImportError(log, ImportErrorSource.IMPORT_LOG, options);
  return classifyImportError(response.message, ImportErrorSource.NONE, options);
}
