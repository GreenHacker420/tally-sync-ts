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
