export * from "./schema/registry.js";
export * from "./schema/common/base.js";
export * from "./schema/common/types.js";
export * from "./schema/transactions/types.js";
export * from "./schema/masters/types.js";
export * from "./xml/types.js";
export * from "./xml/values.js";
export * from "./tdl/builders.js";
export * from "./tdl/profiles.js";
export * from "./tdl/filters.js";
export * from "./models/normalized.js";
export {
  MasterStatistics,
  VoucherStatistics,
  PeriodicVoucherStat,
  AutoColVoucherTypeStat,
  PostResponse
} from "./xmlParser.js";
export { LicenseInfo, LastAlterIds, PaginatedResponse } from "./client.js";

export type VoucherAction = "Create" | "Alter" | "Cancel";
export interface VoucherXmlOptions {
  action?: VoucherAction;
  identity?: import("./schema/transactions/types.js").VoucherIdentity;
  companyName?: string;
}

export type Periodicity = "Day" | "Week" | "Fortnight" | "Month" | "Three Month" | "Six Month" | "Year";
import { RequestOptions } from "./tdl/builders.js";
export interface PeriodicVoucherStatisticsOptions extends RequestOptions {
  voucherType?: string;
}
