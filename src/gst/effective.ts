import type { GstDetailEntry, GstRates, HsnDetailEntry } from "./details.js";

export const GstResolution = {
  RESOLVED: "RESOLVED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
  UNRESOLVED: "UNRESOLVED",
} as const;
export type GstResolution = (typeof GstResolution)[keyof typeof GstResolution];

export const UnresolvedReason = {
  NO_ENTRY_ON_DATE: "NO_ENTRY_ON_DATE",
  NO_RATE: "NO_RATE",
} as const;
export type UnresolvedReason = (typeof UnresolvedReason)[keyof typeof UnresolvedReason];

export interface GstSubject {
  gstApplicable?: string;
  gstTypeOfSupply?: string;
  gstHistory?: GstDetailEntry[];
  hsnHistory?: HsnDetailEntry[];
}

export type EffectiveGst =
  | {
      status: typeof GstResolution.RESOLVED;
      applicableFrom: string;
      taxability: string;
      typeOfSupply?: string;
      hsnCode?: string;
      rates: GstRates;
      /** Rates in basis points (18% → 1800) so downstream money maths stays integer. */
      basisPoints: { cgst: number; sgst: number; igst: number; cess: number };
      source?: string;
    }
  | { status: typeof GstResolution.NOT_APPLICABLE }
  | { status: typeof GstResolution.UNRESOLVED; reason: UnresolvedReason };

const ANY_STATE = "Any";
const bp = (pct: number | undefined): number => Math.round((pct ?? 0) * 100);

function latestOnOrBefore<T extends { applicableFrom: string }>(entries: readonly T[], onDate: string): T | undefined {
  let best: T | undefined;
  for (const e of entries) {
    if (e.applicableFrom <= onDate && (!best || e.applicableFrom >= best.applicableFrom)) best = e;
  }
  return best;
}

/**
 * The GST that applies to an item on a given invoice date (YYYYMMDD).
 * Tally's export already materialises inherited rates (company / stock group) into the item's own
 * GSTDETAILS, so no hierarchy walk is needed; we only pick the latest entry effective on the date.
 * A state-specific entry wins over "Any" when `state` is given.
 */
export function resolveEffectiveGst(subject: GstSubject, onDate: string, state?: string): EffectiveGst {
  if (subject.gstApplicable && /not applicable/i.test(subject.gstApplicable)) return { status: GstResolution.NOT_APPLICABLE };

  const history = subject.gstHistory ?? [];
  const scoped = (s: string) => history.filter((e) => e.state.trim().toLowerCase() === s.toLowerCase());
  const entry =
    (state ? latestOnOrBefore(scoped(state), onDate) : undefined) ?? latestOnOrBefore(scoped(ANY_STATE), onDate);
  if (!entry) return { status: GstResolution.UNRESOLVED, reason: UnresolvedReason.NO_ENTRY_ON_DATE };

  const taxability = entry.taxability ?? "Taxable";
  const rates: GstRates = { ...entry.rates };
  if (/^taxable$/i.test(taxability)) {
    if (rates.igst === undefined && rates.cgst !== undefined && rates.sgst !== undefined) rates.igst = rates.cgst + rates.sgst;
    if (rates.igst !== undefined && rates.cgst === undefined) rates.cgst = rates.igst / 2;
    if (rates.igst !== undefined && rates.sgst === undefined) rates.sgst = rates.igst / 2;
    if (rates.igst === undefined) return { status: GstResolution.UNRESOLVED, reason: UnresolvedReason.NO_RATE };
  }

  const hsn = latestOnOrBefore(subject.hsnHistory ?? [], onDate);
  return {
    status: GstResolution.RESOLVED,
    applicableFrom: entry.applicableFrom,
    taxability,
    typeOfSupply: subject.gstTypeOfSupply,
    hsnCode: hsn?.hsnCode,
    rates,
    basisPoints: { cgst: bp(rates.cgst), sgst: bp(rates.sgst), igst: bp(rates.igst), cess: bp(rates.cess) },
    source: entry.sourceOfDetails,
  };
}
