import { parseRawXml } from "./xml/parser.js";
import { TallyReader, asArray } from "./xml/reader.js";
import { tallyText } from "./xml/values.js";

export interface VoucherIndexRow {
  guid: string;
  masterId?: number;
  alterId: number;
  /** YYYYMMDD */
  date: string;
  voucherType: string;
  voucherNumber?: string;
  partyLedgerName?: string;
  isCancelled: boolean;
  isOptional: boolean;
  /** Only populated when the index was read with includeDeleted. */
  isDeleted: boolean;
}

export interface DateWindow {
  from: string;
  to: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Split [from, to] (YYYYMMDD, inclusive) into calendar-month windows. A whole-range export of a busy company took ~16 s and blocks Tally. */
export function monthWindows(from: string, to: string): DateWindow[] {
  const out: DateWindow[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(4, 6));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(4, 6));
  while (y < endY || (y === endY && m <= endM)) {
    const first = `${y}${pad(m)}01`;
    const last = `${y}${pad(m)}${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
    out.push({ from: first < from ? from : first, to: last > to ? to : last });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const truthy = (v: string | undefined): boolean => !!v && /^yes$/i.test(v.trim());

/** Parse a light voucher collection reply. Rows without a GUID or AlterID are skipped (they cannot be tracked). */
export function parseVoucherIndex(xml: string): VoucherIndexRow[] {
  const root = parseRawXml(xml);
  const collection = (root.ENVELOPE?.BODY?.DATA?.COLLECTION ?? {}) as Record<string, unknown>;
  const rows: VoucherIndexRow[] = [];
  for (const node of asArray(collection.VOUCHER)) {
    const r = new TallyReader(node as Record<string, unknown>);
    const guid = r.text("GUID");
    const alterId = r.number("ALTERID");
    if (!guid || alterId === undefined) continue;
    rows.push({
      guid,
      masterId: r.number("MASTERID"),
      alterId,
      date: r.text("DATE") ?? "",
      voucherType: r.text("VOUCHERTYPENAME") ?? tallyText((node as Record<string, unknown>)["@_VCHTYPE"]) ?? "",
      voucherNumber: r.text("VOUCHERNUMBER"),
      partyLedgerName: r.text("PARTYLEDGERNAME"),
      isCancelled: truthy(r.text("ISCANCELLED")),
      isOptional: truthy(r.text("ISOPTIONAL")),
      isDeleted: truthy(r.text("ISDELETED")),
    });
  }
  return rows;
}

export interface VoucherIndexDiff {
  /** GUIDs Tally has that we have never seen. */
  added: VoucherIndexRow[];
  /** Known GUIDs whose AlterID moved (edited, cancelled or re-saved). */
  changed: VoucherIndexRow[];
  /** Known GUIDs no longer present in the scanned window: deleted in Tally (or outside the window). */
  missing: string[];
  unchanged: number;
}

/**
 * Compare Tally's current index with what we mirrored. `known` maps guid -> last seen alterId.
 * `scopedTo` limits "missing" detection to guids whose date lies in the scanned windows, so a partial
 * scan never reports unscanned months as deleted.
 */
export function diffVoucherIndex(
  known: ReadonlyMap<string, { alterId: number; date?: string }>,
  current: readonly VoucherIndexRow[],
  scanned?: readonly DateWindow[],
): VoucherIndexDiff {
  const seen = new Set<string>();
  const diff: VoucherIndexDiff = { added: [], changed: [], missing: [], unchanged: 0 };
  for (const row of current) {
    seen.add(row.guid);
    const prior = known.get(row.guid);
    if (!prior) diff.added.push(row);
    else if (prior.alterId !== row.alterId) diff.changed.push(row);
    else diff.unchanged += 1;
  }
  const inScope = (date?: string): boolean => !scanned || !date || scanned.some((w) => date >= w.from && date <= w.to);
  for (const [guid, info] of known) {
    if (!seen.has(guid) && inScope(info.date)) diff.missing.push(guid);
  }
  return diff;
}

/** AlterID went backwards or the highest known one vanished: the company was restored from a backup. */
export function looksRestored(knownMaxAlterId: number, currentMaxAlterId: number): boolean {
  return currentMaxAlterId < knownMaxAlterId;
}
