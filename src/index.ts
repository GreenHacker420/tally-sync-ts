export { TallyClient, default } from "./client.js";
export * from "./transport.js";
export * from "./constants.js";

// XML Layer
export * from "./xml/types.js";
export * from "./xml/values.js";
export * from "./xml/escaping.js";
export * from "./xml/parser.js";
export * from "./xml/reader.js";
export * from "./xml/writer.js";

// Schemas & Codecs
export * from "./schema/registry.js";
export * from "./schema/codecs.js";
export * from "./schema/common/base.js";
export * from "./schema/common/types.js";
export * from "./schema/transactions/types.js";
export * from "./schema/transactions/voucherCodec.js";
export * from "./schema/masters/types.js";
export * from "./schema/masters/ledgerCodec.js";
export * from "./schema/masters/stockItemCodec.js";
export * from "./schema/masters/companyCodec.js";
export * from "./schema/masters/otherCodecs.js";
export * from "./schema/zod.js";

// TDL
export * from "./tdl/profiles.js";
export * from "./tdl/filters.js";
export * from "./tdl/builders.js";

// Models
export * from "./models/normalized.js";

// Imports needed for exports below
import { serializeXml } from "./xml/writer.js";
import { voucherCodec } from "./schema/transactions/voucherCodec.js";

// Legacy parser exports for backward compatibility
export {
  parseExportCollection,
  parsePostResponse,
  parseCountResponse,
  parseMasterStatistics,
  parseVoucherStatistics,
  parsePeriodicVoucherStatistics,
  checkTallyError,
  parseActiveCompany,
  parseLicenseInfo,
  parseLastAlterIds,
  parseTallyBoolean,
  parseTallyNumeric,
} from "./xmlParser.js";

// Backward compatibility: voucherToXml
export function voucherToXml(vch: any, options: any = {}): string {
  const el = voucherCodec.build(vch, options);
  return serializeXml(el, 0);
}

// Backward-compatible escapeXml alias
export { escapeXmlText as escapeXml } from "./xml/escaping.js";

// SQLite Mirror Engine
export * from "./sqlite/index.js";

// Statutory GST, MSME & ERP Reporting Analytics
export * from "./analytics/index.js";

// 808 Tally XML Tags Catalog
export * from "./schema/catalog/tallyTagsCatalog.js";

// Import outcome classification + Tally.imp reader
export * from "./importOutcome.js";
export * from "./importLog.js";

// Transport safety: gate (single-flight, priority, timeout, circuit breaker), flight recorder, typed errors
export * from "./errors.js";
export * from "./gate.js";
export * from "./recording.js";

// GST details: parse Tally's dated GST/HSN history and resolve the rate effective on an invoice date
export * from "./gst/details.js";
export * from "./gst/effective.js";

// Change detection: month-chunked voucher index + diff
export * from "./voucherIndex.js";

// Posting core: integer-paise money, invoice tax (inclusive / exclusive), sales invoice builder and posting operation
export * from "./post/money.js";
export * from "./post/tax.js";
export * from "./post/salesInvoice.js";
export * from "./post/operation.js";
export * from "./post/catalog.js";

// Tally data-path finder (where the company folders live; metadata only, never opens data files)
export * from "./discovery/dataPath.js";

// Dialects: Tally protocol facts and environment data as data (no vocabulary in engine code)
export * from "./dialects/tally.js";
export * from "./dialects/environment.js";

// Policy registry: tunables declared once, resolved from layers with provenance
export * from "./config/policy.js";

// Company profile: facts discovered from Tally (roles by group ancestry and attributes, never by name)
export * from "./profile/companyProfile.js";
export * from "./profile/blueprint.js";
export * from "./profile/learnedNames.js";
export * from "./profile/invoiceContext.js";
export * from "./rules/rulePack.js";
export * from "./rules/importRules.js";
export * from "./adaptive/control.js";
