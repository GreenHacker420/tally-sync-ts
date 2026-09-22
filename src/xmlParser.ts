export interface LicenseInfo {
  serialNumber: string;
  remoteSerialNumber: string;
  accountId: string;
  adminMailId: string;
  isAdmin: boolean;
  isEducationalMode: boolean;
  isSilver: boolean;
  isGold: boolean;
  planName: string;
  isIndian: boolean;
  isRemoteAccessMode: boolean;
  isLicClientMode: boolean;
  applicationPath: string;
  dataPath: string;
  userLevel: string;
  userName: string;
  tallyVersion: string;
  tallyShortVersion: string;
  isTallyPrime: boolean;
  isTallyPrimeEditLog: boolean;
  isTallyPrimeServer: boolean;
}

import { parseRawXml, cleanResponseXml } from "./xml/parser.js";
import { TallyXmlRoot, TallyXmlEnvelope, TallyXmlData, TallyXmlResultItem } from "./xml/types.js";
import { asArray, TallyReader } from "./xml/reader.js";
import { tallyText, tallyNumber, tallyBoolean } from "./xml/values.js";
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
  formatDateForTally,
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
  objectType?: string;
  name?: string;
  guid?: string;
  remoteId?: string;
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
  lineErrors?: string[];
  error?: string;
}

import {
  tallyNumericSchema,
  tallyNumericCodec,
  tallyBooleanSchema,
  tallyBooleanCodec,
  tallyLogicalSchema,
  tallyTextSchema,
  tallyQuantitySchema,
  tallyRateSchema,
  tallyDateSchema,
} from "./schema/zod.js";

export {
  tallyNumericSchema,
  tallyNumericCodec,
  tallyBooleanSchema,
  tallyBooleanCodec,
  tallyLogicalSchema,
  tallyTextSchema,
  tallyQuantitySchema,
  tallyRateSchema,
  tallyDateSchema,
};

export function parseTallyNumeric(val: any): number {
  return tallyNumericSchema.parse(val);
}

export const parseTallyBoolean = tallyBoolean;

export function checkTallyError(xml: string): string | null {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE as any;
  if (!envelope) return null;

  const data = envelope?.BODY?.DATA ?? envelope?.DATA;
  const lineErrors = asArray(data?.LINEERROR).map(tallyText).filter((x): x is string => !!x);
  if (lineErrors.length > 0) {
    return lineErrors.join("; ");
  }

  const rawStatus = tallyText(envelope?.HEADER?.STATUS);
  if (rawStatus === "0" || rawStatus?.toLowerCase() === "failure") {
    return "Tally returned failure status";
  }

  return null;
}

export function parseExportCollection<T = unknown>(xml: string, objectType: TallyObjectType | string): T[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed.ENVELOPE;
  const data = (envelope?.BODY?.DATA ?? envelope?.DATA ?? parsed) as Record<string, unknown>;

  const collection = (data?.COLLECTION ?? data) as Record<string, unknown>;
  if (!collection) return [];

  const codec = tallyCodecs[objectType as TallyObjectType];

  // Look for target key(s)
  const tagCandidates = [
    objectType.toUpperCase(),
    objectType,
    objectType === "Voucher" ? "VOUCHER" : undefined,
    objectType === "StockItem" ? "STOCKITEM" : undefined,
    objectType === "StockGroup" ? "STOCKGROUP" : undefined,
    objectType === "StockCategory" ? "STOCKCATEGORY" : undefined,
    objectType === "CostCentre" ? "COSTCENTRE" : undefined,
    objectType === "Employee" ? "COSTCENTRE" : undefined,
    objectType === "EmployeeGroup" ? "COSTCENTRE" : undefined,
    objectType === "CostCategory" ? "COSTCATEGORY" : undefined,
    objectType === "AttendanceType" ? "ATTENDANCE" : undefined,
    objectType === "GSTRegistration" ? "TAXUNIT" : undefined,
    objectType === "GSTRegistration" ? "GSTREGISTRATION" : undefined,
    "OBJECT",
  ].filter((x): x is string => !!x);

  for (const tag of tagCandidates) {
    if (collection[tag] !== undefined) {
      const rawItems = asArray(collection[tag]);
      return rawItems.map(item => {
        if (codec) {
          return codec.parse(item as Record<string, unknown>) as unknown as T;
        }
        return item as T;
      });
    }
  }

  // Fallback: check all keys in collection
  for (const [key, value] of Object.entries(collection)) {
    if (key.startsWith("?") || key.startsWith("@_")) continue;
    const upper = key.toUpperCase();
    if (tagCandidates.includes(upper) || upper.includes(objectType.toUpperCase())) {
      const rawItems = asArray(value);
      return rawItems.map(item => {
        if (codec) {
          return codec.parse(item as Record<string, unknown>) as unknown as T;
        }
        return item as T;
      });
    }
  }

  return [];
}

export function parseCountResponse(xml: string): number {
  const parsed = parseRawXml(xml);
  const envelope = parsed.ENVELOPE;
  const data = (envelope?.BODY?.DATA ?? envelope) as Record<string, unknown>;

  const r = new TallyReader(data);
  return r.number("TC_TOTALCOUNT") ?? r.number("TOTALCOUNT") ?? 0;
}

export function parseMasterStatistics(xml: string): MasterStatistics[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed.ENVELOPE;
  const data = envelope?.BODY?.DATA ?? envelope;

  const list = asArray(data?.TC_MASTERSTATISTICSREPORT ?? data?.TC_MasterStatisticsReport ?? data?.MasterStatistics);
  return list.map(item => {
    const r = new TallyReader(item);
    return {
      name: r.text("NAME") ?? "",
      count: r.number("COUNT") ?? 0,
    };
  });
}

export function parseVoucherStatistics(xml: string): VoucherStatistics[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed.ENVELOPE;
  const data = envelope?.BODY?.DATA ?? envelope;

  const list = asArray(data?.TC_VOUCHERSTATISTICSREPORT ?? data?.TC_VoucherStatisticsReport ?? data?.VoucherStatistics);
  return list.map(item => {
    const r = new TallyReader(item);
    return {
      name: r.text("NAME") ?? "",
      totalCount: r.number("TOTALCOUNT") ?? 0,
      cancelledCount: r.number("CANCELLEDCOUNT") ?? 0,
      optionalCount: r.number("OPTIONALCOUNT") ?? 0,
      count: r.number("COUNT") ?? r.number("TOTALCOUNT") ?? 0,
    };
  });
}

export function parsePeriodicVoucherStatistics(xml: string): AutoColVoucherTypeStat[] {
  const parsed = parseRawXml(xml);
  const data = parsed.ENVELOPE?.BODY?.DATA;
  if (!data) return [];

  const vchTypes = asArray(data?.VCHTYPESTAT ?? data?.VchTypeStat);
  if (vchTypes.length > 0) {
    return vchTypes.map(vt => {
      const r = new TallyReader(vt);
      const name = r.text("NAME") ?? "";
      const totalCount = r.number("TOTALCOUNT") ?? 0;
      const periods = asArray(vt?.PERIODSTAT ?? vt?.PeriodStat).map(ps => {
        const pr = new TallyReader(ps);
        return {
          fromDate: pr.text("FROMDATE") ?? "",
          toDate: pr.text("TODATE") ?? "",
          cancelledCount: pr.number("CANCELLEDCOUNT") ?? 0,
          optionalCount: pr.number("OPTIONALCOUNT") ?? pr.number("OTIONALCOUNT") ?? 0,
          totalCount: pr.number("TOTALCOUNT") ?? 0,
        };
      });
      return {
        name,
        totalCount,
        periodStats: periods,
      };
    });
  }

  // Fallback for custom report
  const list = asArray(
    (data?.PeriodicVoucherStatReport as Record<string, unknown> | undefined)?.PERIODICVOUCHERSTATREPORT ||
    data?.COLLECTION?.OBJECT
  );

  return [{
    name: "All",
    totalCount: list.length,
    periodStats: list.map(item => {
      const r = new TallyReader(item);
      return {
        fromDate: r.text("FROMDATE") ?? "",
        toDate: r.text("TODATE") ?? "",
        cancelledCount: r.number("CANCELLEDCOUNT") ?? 0,
        optionalCount: r.number("OPTIONALCOUNT") ?? r.number("OTIONALCOUNT") ?? 0,
        totalCount: r.number("TOTALCOUNT") ?? 0,
      };
    }),
  }];
}

export function parsePostResponse(xml: string): PostResponse[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed.ENVELOPE;
  if (!envelope) {
    return [{ status: "failure", message: "Invalid XML response: missing ENVELOPE" }];
  }

  const data = envelope.BODY?.DATA ?? envelope.DATA;

  // Check custom report results: <RESULTS><RESULT>...
  const results = data?.RESULTS?.RESULT ?? envelope.RESULTS?.RESULT;
  if (results) {
    return asArray(results).map((item: TallyXmlResultItem) => {
      const r = new TallyReader(item);
      const err = r.text("ERROR");
      const isFailure = !!err;
      return {
        status: isFailure ? "failure" : "success",
        message: err ?? "Success",
        objectType: r.text("OBJECTTYPE"),
        name: r.text("NAME"),
        masterId: r.number("MASTERID"),
        guid: r.text("GUID"),
        remoteId: r.text("REMOTEID"),
        error: err,
      };
    });
  }

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
    : (created > 0 && altered === 0 && deleted === 0)
      ? "Created successfully"
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
    masterId: lastMid ?? lastVchId,
    lastVoucherId: lastVchId,
    lastVchId: lastVchId,
    lineErrors: lineErrors.length ? lineErrors : undefined,
    error: isFailure ? message : undefined,
  }];
}

export function parseActiveCompany(xml: string): string {
  const parsed = parseRawXml(xml);
  const data = parsed.ENVELOPE?.BODY?.DATA;
  const val = data?.RESULT ?? data?.STATICVARIABLES?.SVCURRENTCOMPANY ?? data;
  return typeof val === "string" ? val.trim() : (tallyText(val) ?? "").trim();
}

export function parseLicenseInfo(xml: string): LicenseInfo {
  const parsed = parseRawXml(xml);
  const data = parsed.ENVELOPE?.BODY?.DATA;
  const collection = data?.COLLECTION;
  const rawObj = collection?.OBJECT ?? collection?.TC_LICENSEINFOOBJECT ?? collection;
  const obj = Array.isArray(rawObj) ? rawObj[0] : rawObj;
  const r = new TallyReader(obj);
  return {
    serialNumber: r.text("SERIALNUMBER") ?? "",
    remoteSerialNumber: r.text("REMOTESERIALNUMBER") ?? "",
    accountId: r.text("ACCOUNTID") ?? "",
    adminMailId: r.text("ADMINMAILID") ?? "",
    isAdmin: r.boolean("ISADMIN") ?? false,
    isEducationalMode: r.boolean("ISEDUCATIONALMODE") ?? false,
    isSilver: r.boolean("ISSILVER") ?? false,
    isGold: r.boolean("ISGOLD") ?? false,
    planName: r.text("PLANNAME") ?? "",
    isIndian: r.boolean("ISINDIAN") ?? true,
    isRemoteAccessMode: false,
    isLicClientMode: false,
    applicationPath: r.text("APPLICATIONPATH") ?? "",
    dataPath: r.text("DATAPATH") ?? "",
    userLevel: r.text("USERLEVEL") ?? "",
    userName: r.text("USERNAME") ?? "",
    tallyVersion: r.text("TALLYVERSION") ?? "",
    tallyShortVersion: r.text("TALLYVERSION")?.split(" ")[0] ?? "",
    isTallyPrime: r.boolean("ISTALLYPRIME") ?? true,
    isTallyPrimeEditLog: false,
    isTallyPrimeServer: false,
  };
}

export function parseLastAlterIds(xml: string): { mastersLastId: number; vouchersLastId: number } {
  const parsed = parseRawXml(xml);
  const data = parsed.ENVELOPE?.BODY?.DATA;
  const report = data?.TC_ALTERIDSREPORT ?? data?.LastAlterIdsReport ?? data;
  const r = new TallyReader(report);
  return {
    mastersLastId: r.number("MASTERSLASTID") ?? 0,
    vouchersLastId: r.number("VOUCHERSLASTID") ?? 0,
  };
}
