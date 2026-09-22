import { parseRawXml, cleanResponseXml } from "./xml/parser.js";
import { asArray, TallyReader } from "./xml/reader.js";
import { tallyText, tallyNumber } from "./xml/values.js";
import { TallyObjectType, TallyObjectMap, TALLY_OBJECTS } from "./schema/registry.js";
import { tallyCodecs } from "./schema/codecs.js";

export { parseRawXml, cleanResponseXml } from "./xml/parser.js";
export { asArray, TallyReader } from "./xml/reader.js";
export {
  tallyText,
  tallyNumber,
  tallyBoolean,
  tallyLogical,
  parseQuantity,
  parseRate,
  parseAmount,
  getSingleValue,
  formatDateForTally
} from "./xml/values.js";

export interface MasterStatistics {
  name: string;
  count: number;
}

export interface VoucherStatistics {
  name: string;
  count: number;
  cancelledCount: number;
  totalCount: number;
  optionalCount: number;
}

export interface PeriodicVoucherStat {
  fromDate: string;
  toDate: string;
  cancelledCount: number;
  optionalCount: number;
  totalCount: number;
}

export interface AutoColVoucherTypeStat {
  name: string;
  totalCount: number;
  periodStats: PeriodicVoucherStat[];
}

export interface PostResponse {
  status: "success" | "failure";
  message: string;
  masterId?: number;
  lastMasterId?: number;
  lastVchId?: number;
  lastVoucherId?: number;
  created?: number;
  altered?: number;
  deleted?: number;
  ignored?: number;
  cancelled?: number;
  errors?: number;
  alteredId?: number;
  objectType?: string;
  name?: string;
  guid?: string;
  remoteId?: string;
  error?: string;
  lineErrors?: string[];
}

export function checkTallyError(parsedObj: any): { message: string; lineErrors: string[] } | null {
  const envelope = parsedObj?.ENVELOPE;
  if (!envelope) {
    return { message: "Invalid XML response: missing ENVELOPE", lineErrors: [] };
  }

  const rawStatus = tallyText(envelope?.HEADER?.STATUS);
  const rawLineError = envelope?.BODY?.DATA?.LINEERROR;
  const lineErrors: string[] = [];

  if (rawLineError) {
    const list = asArray(rawLineError);
    for (const le of list) {
      const txt = tallyText(le);
      if (txt) lineErrors.push(txt);
    }
  }

  const isStatusZero = rawStatus === "0";
  const isStatusFailure = rawStatus?.toLowerCase() === "failure";

  if (isStatusZero || isStatusFailure || lineErrors.length > 0) {
    return {
      message: lineErrors.join("; ") || "Tally request failed",
      lineErrors,
    };
  }

  return null;
}

export function parseExportCollection<T extends TallyObjectType>(
  xml: string,
  type: T
): TallyObjectMap[T][] {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE as any;
  if (!envelope) return [];

  const collection = envelope?.BODY?.DATA?.COLLECTION;
  if (!collection) return [];

  const codec = tallyCodecs[type];
  const targetTag = codec.xmlTag;

  // Find target nodes matching codec's XML tag
  let rawItems = collection[targetTag];
  if (!rawItems) {
    // Fallback: look for TALLYMESSAGE
    const messages = collection.TALLYMESSAGE;
    if (messages) {
      const msgList = asArray(messages);
      rawItems = msgList.map(m => m[targetTag]).filter(Boolean);
    }
  }

  if (!rawItems) return [];
  const itemsList = asArray(rawItems);
  return itemsList.map(item => codec.parse(item)) as TallyObjectMap[T][];
}

export function parseCountResponse(xml: string): number {
  const parsed = parseRawXml(xml);
  const r = new TallyReader((parsed as any)?.ENVELOPE?.BODY?.DATA?.COLLECTION || {});
  return r.number("TOTALCOUNT") ?? 0;
}

export function parseMasterStatistics(xml: string): MasterStatistics[] {
  const parsed = parseRawXml(xml);
  const data = (parsed as any)?.ENVELOPE?.BODY?.DATA;
  if (!data) return [];

  const list = asArray(
    data?.TC_MasterStatisticsReport?.TC_MASTERSTATISTICSREPORT?.TC_MasterStatisticsPart?.TC_MASTERSTATISTICSPART?.TC_MasterStatisticsLine ||
    data?.COLLECTION?.OBJECT
  );

  return list.map(item => {
    const r = new TallyReader(item);
    return {
      name: r.text("STATNAME") ?? r.text("NAME") ?? "",
      count: r.number("STATCOUNT") ?? r.number("TOTALCOUNT") ?? 0,
    };
  });
}

export function parseVoucherStatistics(xml: string): VoucherStatistics[] {
  const parsed = parseRawXml(xml);
  const data = (parsed as any)?.ENVELOPE?.BODY?.DATA;
  if (!data) return [];

  const list = asArray(
    data?.TC_VoucherStatisticsReport?.TC_VOUCHERSTATISTICSREPORT?.TC_VoucherStatisticsPart?.TC_VOUCHERSTATISTICSPART?.TC_VoucherStatisticsLine ||
    data?.COLLECTION?.OBJECT
  );

  return list.map(item => {
    const r = new TallyReader(item);
    return {
      name: r.text("VCHTYPENAME") ?? r.text("NAME") ?? "",
      totalCount: r.number("TOTALCOUNT") ?? 0,
      cancelledCount: r.number("CANCELLEDCOUNT") ?? 0,
      optionalCount: r.number("OPTIONALCOUNT") ?? 0,
      count: r.number("TOTALCOUNT") ?? 0,
    };
  });
}

export function parsePeriodicVoucherStatistics(xml: string): PeriodicVoucherStat[] {
  const parsed = parseRawXml(xml);
  const data = (parsed as any)?.ENVELOPE?.BODY?.DATA;
  if (!data) return [];

  const list = asArray(
    data?.PeriodicVoucherStatReport?.PERIODICVOUCHERSTATREPORT?.PeriodicVoucherStatPart?.PERIODICVOUCHERSTATPART?.PeriodicVoucherStatLine ||
    data?.COLLECTION?.OBJECT
  );

  return list.map(item => {
    const r = new TallyReader(item);
    return {
      fromDate: r.text("FROMDATE") ?? "",
      toDate: r.text("TODATE") ?? "",
      cancelledCount: r.number("CANCELLEDCOUNT") ?? 0,
      optionalCount: r.number("OPTIONALCOUNT") ?? 0,
      totalCount: r.number("TOTALCOUNT") ?? 0,
    };
  });
}

export function parsePostResponse(xml: string): PostResponse[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE as any;
  if (!envelope) {
    return [{ status: "failure", message: "Invalid XML response: missing ENVELOPE" }];
  }

  const data = envelope?.BODY?.DATA;
  const lineErrors = asArray(data?.LINEERROR).map(tallyText).filter((x): x is string => !!x);

  const rawStatus = tallyText(envelope?.HEADER?.STATUS);
  const isFailure = rawStatus === "0" || rawStatus?.toLowerCase() === "failure" || lineErrors.length > 0;

  const importResult = data?.IMPORTRESULT;
  const r = importResult ? new TallyReader(importResult) : undefined;

  const created = r?.number("CREATED") ?? 0;
  const altered = r?.number("ALTERED") ?? 0;
  const deleted = r?.number("DELETED") ?? 0;
  const ignored = r?.number("IGNORED") ?? 0;
  const cancelled = r?.number("CANCELLED") ?? 0;
  const errors = r?.number("ERRORS") ?? lineErrors.length;
  const lastMid = r?.number("LASTMID");
  const lastVchId = r?.number("LASTVCHID");

  const message = isFailure
    ? (lineErrors.join("; ") || "Import failed")
    : `Successfully processed: ${created} created, ${altered} altered, ${deleted} deleted`;

  return [{
    status: isFailure ? "failure" : "success",
    message,
    created,
    altered,
    deleted,
    ignored,
    cancelled,
    errors,
    lastMasterId: lastMid,
    masterId: lastMid,
    lastVoucherId: lastVchId,
    lastVchId: lastVchId,
    lineErrors: lineErrors.length ? lineErrors : undefined,
    error: isFailure ? message : undefined,
  }];
}
