import { TallyReader } from "../xml/reader.js";
import { TALLY_PRIME_DIALECT, type TallyDialect } from "../dialects/tally.js";

/** GST rates in percent, per duty head. A head that Tally marks "Not Applicable" is simply absent. */
export interface GstRates {
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number;
  stateCess?: number;
}

export interface GstDetailEntry {
  /** YYYYMMDD from which this entry applies. */
  applicableFrom: string;
  /** Tally's state scope; "Any" unless the item has state-specific rates. */
  state: string;
  taxability?: string;
  /** "Specify Details Here" | "As per Company/Stock Group" | "Use GST Classification" */
  sourceOfDetails?: string;
  rates: GstRates;
}

export interface HsnDetailEntry {
  applicableFrom: string;
  hsnCode?: string;
  description?: string;
  sourceOfDetails?: string;
}

/** Both export and import spellings are listed in the dialect; unknown heads return undefined. */
export function normaliseDutyHead(head: string, dialect: TallyDialect = TALLY_PRIME_DIALECT): keyof GstRates | undefined {
  return dialect.dutyHeadAliases[head.trim().toLowerCase()];
}

const ANY_STATE = "Any";

function parseRates(stateNode: Record<string, unknown>): GstRates {
  const rates: GstRates = {};
  for (const rd of new TallyReader(stateNode).list("RATEDETAILS.LIST")) {
    const r = new TallyReader(rd);
    const key = normaliseDutyHead(r.text("GSTRATEDUTYHEAD") ?? "");
    const rate = r.number("GSTRATE");
    if (key && rate !== undefined) rates[key] = rate;
  }
  return rates;
}

/** One entry per (GSTDETAILS.LIST × STATEWISEDETAILS.LIST). */
export function parseGstDetails(nodes: Array<Record<string, unknown>>): GstDetailEntry[] {
  const out: GstDetailEntry[] = [];
  for (const node of nodes) {
    const r = new TallyReader(node);
    const applicableFrom = r.text("APPLICABLEFROM") ?? "";
    const base = { applicableFrom, taxability: r.text("TAXABILITY"), sourceOfDetails: r.text("SRCOFGSTDETAILS") };
    const states = r.list("STATEWISEDETAILS.LIST");
    if (states.length === 0) out.push({ ...base, state: ANY_STATE, rates: {} });
    for (const st of states) {
      out.push({ ...base, state: new TallyReader(st).text("STATENAME") ?? ANY_STATE, rates: parseRates(st) });
    }
  }
  return out;
}

export function parseHsnDetails(nodes: Array<Record<string, unknown>>): HsnDetailEntry[] {
  return nodes.map((node) => {
    const r = new TallyReader(node);
    return {
      applicableFrom: r.text("APPLICABLEFROM") ?? "",
      hsnCode: r.text("HSNCODE"),
      description: r.text("HSN"),
      sourceOfDetails: r.text("SRCOFHSNDETAILS"),
    };
  });
}
