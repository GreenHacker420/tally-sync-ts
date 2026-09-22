import { z } from "zod";
import {
  tallyText,
  tallyNumber,
  tallyBoolean,
  tallyLogical,
  parseQuantity,
  parseRate,
  formatDateForTally,
  REGEX_CR,
  REGEX_COMMA,
  REGEX_NOT_APPLICABLE,
  TallyQuantity,
  TallyRate,
} from "../xml/values.js";

// --- Primitive Helper Functions & Codecs ---
export function parseTallyNumeric(val: unknown): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const str = String(val).trim();
  if (str === "") return 0;
  const isCr = REGEX_CR.test(str);
  const cleaned = str.replace(REGEX_COMMA, "").replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isCr ? -Math.abs(num) : num;
}

export const tallyNumericSchema = z.preprocess((val) => {
  return parseTallyNumeric(val);
}, z.number());

export const tallyNumericCodec = {
  parse: (val: unknown): number => parseTallyNumeric(val),
  encode: (val: number): string => String(val),
};

export const tallyBooleanSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  return tallyBoolean(val);
}, z.boolean().optional());

export const tallyBooleanCodec = {
  parse: (val: unknown): boolean | undefined => tallyBoolean(val),
  encode: (val: boolean): string => (val ? "Yes" : "No"),
};

export const tallyLogicalSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  const str = typeof val === "string" ? val.trim() : "";
  if (REGEX_NOT_APPLICABLE.test(str)) return "Not Applicable";
  return tallyBoolean(val);
}, z.union([z.boolean(), z.literal("Not Applicable")]).optional());

export const tallyTextSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  return tallyText(val);
}, z.string().optional());

export const tallyQuantitySchema = z.preprocess((val) => {
  return parseQuantity(val);
}, z.custom<TallyQuantity>((v) => v && typeof v === "object" && "value" in v));

export const tallyRateSchema = z.preprocess((val) => {
  return parseRate(val);
}, z.custom<TallyRate>((v) => v && typeof v === "object" && "value" in v));

export const tallyDateSchema = z.preprocess((val) => {
  if (val === undefined || val === null) return undefined;
  return formatDateForTally(val as any);
}, z.string());

// --- System & Envelope Schemas ---
export const TallyHeaderSchema = z.object({
  VERSION: z.union([z.string(), z.number()]).optional(),
  TALLYREQUEST: z.string().optional(),
  TYPE: z.string().optional(),
  ID: z.string().optional(),
  STATUS: z.string().optional(),
  SUBSTATUS: z.string().optional(),
}).passthrough();

export const TallyImportResultSchema = z.object({
  CREATED: z.union([z.string(), z.number()]).optional(),
  ALTERED: z.union([z.string(), z.number()]).optional(),
  DELETED: z.union([z.string(), z.number()]).optional(),
  COMBINED: z.union([z.string(), z.number()]).optional(),
  IGNORED: z.union([z.string(), z.number()]).optional(),
  CANCELLED: z.union([z.string(), z.number()]).optional(),
  ERRORS: z.union([z.string(), z.number()]).optional(),
  LASTMID: z.union([z.string(), z.number()]).optional(),
  LASTVCHID: z.union([z.string(), z.number()]).optional(),
}).passthrough();

export const LicenseInfoSchema = z.object({
  serialNumber: z.string().default(""),
  remoteSerialNumber: z.string().default(""),
  accountId: z.string().default(""),
  adminMailId: z.string().default(""),
  isAdmin: z.boolean().default(false),
  isEducationalMode: z.boolean().default(false),
  isSilver: z.boolean().default(false),
  isGold: z.boolean().default(false),
  planName: z.string().default(""),
  isIndian: z.boolean().default(true),
  isRemoteAccessMode: z.boolean().default(false),
  isLicClientMode: z.boolean().default(false),
  applicationPath: z.string().default(""),
  dataPath: z.string().default(""),
  userLevel: z.string().default(""),
  userName: z.string().default(""),
  tallyVersion: z.string().default(""),
  tallyShortVersion: z.string().default(""),
  isTallyPrime: z.boolean().default(true),
  isTallyPrimeEditLog: z.boolean().default(false),
  isTallyPrimeServer: z.boolean().default(false),
});

export const LastAlterIdsSchema = z.object({
  mastersLastId: z.number().default(0),
  vouchersLastId: z.number().default(0),
});

// --- Master Schemas ---
export const LedgerAddressSchema = z.object({
  address: z.array(z.string()).default([]),
  state: z.string().optional(),
  country: z.string().optional(),
  pincode: z.string().optional(),
});

export const BankDetailsSchema = z.object({
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  swiftCode: z.string().optional(),
});

export const LedgerSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  openingBalance: tallyNumericSchema.default(0),
  closingBalance: tallyNumericSchema.optional(),
  isBillwise: tallyBooleanSchema.default(false),
  mailingName: z.string().optional(),
  addressLines: z.array(z.string()).default([]),
  address: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  pinCode: z.string().optional(),
  pincode: z.string().optional(),
  gstin: z.string().optional(),
  gstRegistrationType: z.string().optional(),
  pan: z.string().optional(),
  email: z.string().optional(),
  mobileNo: z.string().optional(),
  contactPerson: z.string().optional(),
  creditPeriod: z.string().optional(),
  creditLimit: tallyNumericSchema.optional(),
  bankDetails: BankDetailsSchema.optional(),
  isDeemedPositive: tallyBooleanSchema.optional(),
  description: z.string().optional(),
  narration: z.string().optional(),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const StockItemSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  category: z.string().optional(),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  baseUnits: z.string().default(""),
  additionalUnits: z.string().optional(),
  openingBalance: tallyNumericSchema.default(0),
  openingRate: tallyNumericSchema.optional(),
  openingValue: tallyNumericSchema.optional(),
  closingBalance: tallyNumericSchema.optional(),
  closingRate: tallyNumericSchema.optional(),
  closingValue: tallyNumericSchema.optional(),
  gstApplicable: z.string().optional(),
  hsnCode: z.string().optional(),
  gstRate: tallyNumericSchema.optional(),
  taxability: z.string().optional(),
  partNumber: z.string().optional(),
  description: z.string().optional(),
  narration: z.string().optional(),
  costingMethod: z.string().optional(),
  valuationMethod: z.string().optional(),
  isBatchWise: tallyBooleanSchema.optional(),
  hasExpiryDate: tallyBooleanSchema.optional(),
  hasMfgDate: tallyBooleanSchema.optional(),
  standardCost: tallyNumericSchema.optional(),
  standardPrice: tallyNumericSchema.optional(),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const CompanySchema = z.object({
  name: z.string(),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  formalName: z.string().optional(),
  addressLines: z.array(z.string()).default([]),
  state: z.string().optional(),
  country: z.string().optional(),
  pincode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  currency: z.string().optional(),
  booksStartDate: z.string().optional(),
  financialYearStart: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const GroupSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  isSubLedger: tallyBooleanSchema.optional(),
  isRevenue: tallyBooleanSchema.optional(),
  affectsGrossProfit: tallyBooleanSchema.optional(),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const UnitSchema = z.object({
  name: z.string(),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  formalName: z.string().optional(),
  decimalPlaces: tallyNumericSchema.default(0),
  isSimpleUnit: tallyBooleanSchema.default(true),
  uqc: z.string().optional(),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const GodownSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  addressLines: z.array(z.string()).default([]),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const VoucherTypeSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  numberingMethod: z.string().optional(),
  isPreventDuplicates: tallyBooleanSchema.optional(),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const CostCentreSchema = z.object({
  name: z.string(),
  parent: z.string().default(""),
  category: z.string().optional(),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const CurrencySchema = z.object({
  name: z.string(),
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  symbol: z.string().optional(),
  formalName: z.string().optional(),
  decimalPlaces: tallyNumericSchema.default(2),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

// --- Transaction Schemas ---
export const BillAllocationSchema = z.object({
  billType: z.string().default("New Ref"),
  billName: z.string().default(""),
  amount: tallyNumericSchema.default(0),
  billCreditPeriod: z.string().optional(),
});

export const BankAllocationSchema = z.object({
  transactionType: z.string().default(""),
  instrumentNumber: z.string().optional(),
  instrumentDate: z.string().optional(),
  bankName: z.string().optional(),
  amount: tallyNumericSchema.default(0),
});

export const BatchAllocationSchema = z.object({
  batchName: z.string().default(""),
  godownName: z.string().optional(),
  destinationGodownName: z.string().optional(),
  amount: tallyNumericSchema.default(0),
  actualQuantity: tallyNumericSchema.default(0),
  billedQuantity: tallyNumericSchema.default(0),
  rate: tallyNumericSchema.default(0),
  unit: z.string().optional(),
  orderNumber: z.string().optional(),
  trackingNumber: z.string().optional(),
});

export const LedgerEntrySchema = z.object({
  ledgerName: z.string(),
  amount: tallyNumericSchema,
  isPartyLedger: tallyBooleanSchema.default(false),
  methodType: z.string().optional(),
  billAllocations: z.array(BillAllocationSchema).default([]),
  bankAllocations: z.array(BankAllocationSchema).default([]),
});

export const InventoryEntrySchema = z.object({
  stockItemName: z.string(),
  amount: tallyNumericSchema,
  actualQuantity: tallyNumericSchema.default(0),
  billedQuantity: tallyNumericSchema.default(0),
  rate: tallyNumericSchema.default(0),
  unit: z.string().default(""),
  discount: tallyNumericSchema.optional(),
  godownName: z.string().optional(),
  hsnCode: z.string().optional(),
  hsnDescription: z.string().optional(),
  gstRate: tallyNumericSchema.optional(),
  batchAllocations: z.array(BatchAllocationSchema).default([]),
  accountingAllocations: z.array(LedgerEntrySchema).default([]),
});

export const VoucherSchema = z.object({
  guid: z.string().optional(),
  masterId: z.number().optional(),
  alterId: z.number().optional(),
  date: z.string(),
  voucherType: z.string(),
  voucherTypeName: z.string().optional(),
  voucherNumber: z.string().default(""),
  referenceNo: z.string().optional(),
  referenceDate: z.string().optional(),
  narration: z.string().optional(),
  partyLedgerName: z.string().optional(),
  partyName: z.string().optional(),
  partyGstin: z.string().optional(),
  partyState: z.string().optional(),
  partyAddress: z.array(z.string()).default([]),
  placeOfSupply: z.string().optional(),
  amount: tallyNumericSchema.default(0),
  isInvoice: tallyBooleanSchema.default(false),
  isOptional: tallyBooleanSchema.default(false),
  isCancelled: tallyBooleanSchema.default(false),
  orderNumber: z.string().optional(),
  orderDate: z.string().optional(),
  dispatchDocNo: z.string().optional(),
  dispatchedThrough: z.string().optional(),
  destination: z.string().optional(),
  carrierName: z.string().optional(),
  billOfLadingNo: z.string().optional(),
  billOfLadingDate: z.string().optional(),
  motorVehicleNo: z.string().optional(),
  termsOfPayment: z.string().optional(),
  otherReferences: z.string().optional(),
  buyersOrderNo: z.string().optional(),
  buyersOrderDate: z.string().optional(),
  consigneeName: z.string().optional(),
  consigneeState: z.string().optional(),
  consigneeGstin: z.string().optional(),
  consigneeAddress: z.array(z.string()).default([]),
  ledgerEntries: z.array(LedgerEntrySchema).default([]),
  inventoryEntries: z.array(InventoryEntrySchema).default([]),
  _raw: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

// Inferred TypeScript Types from Zod Schemas
export type ZodTallyHeader = z.infer<typeof TallyHeaderSchema>;
export type ZodTallyImportResult = z.infer<typeof TallyImportResultSchema>;
export type ZodLicenseInfo = z.infer<typeof LicenseInfoSchema>;
export type ZodLastAlterIds = z.infer<typeof LastAlterIdsSchema>;
export type ZodLedger = z.infer<typeof LedgerSchema>;
export type ZodStockItem = z.infer<typeof StockItemSchema>;
export type ZodCompany = z.infer<typeof CompanySchema>;
export type ZodGroup = z.infer<typeof GroupSchema>;
export type ZodUnit = z.infer<typeof UnitSchema>;
export type ZodGodown = z.infer<typeof GodownSchema>;
export type ZodVoucherType = z.infer<typeof VoucherTypeSchema>;
export type ZodCostCentre = z.infer<typeof CostCentreSchema>;
export type ZodCurrency = z.infer<typeof CurrencySchema>;
export type ZodVoucher = z.infer<typeof VoucherSchema>;
export type ZodLedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type ZodInventoryEntry = z.infer<typeof InventoryEntrySchema>;
