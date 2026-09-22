import type { VoucherTags } from "../catalog/tallyTagsCatalog.js";
import { TallyObject } from "../common/base.js";
import { TallyLogical, TallyQuantity, TallyRate, TallyAmount, TallyDateInput } from "../../xml/values.js";
import { TallyUnknownFields } from "../../xml/types.js";

export type VoucherIdentity =
  | { readonly kind: "remote-id"; readonly remoteId: string; mode?: "CREATE" }
  | { readonly kind: "master-id"; readonly masterId: number; mode?: "MASTER_ID"; date?: string; voucherType?: string }
  | { readonly kind: "guid"; readonly guid: string; mode?: "GUID" }
  | { readonly kind: "voucher-number"; readonly date: TallyDateInput; readonly voucherType: string; readonly voucherNumber: string; mode?: "VOUCHER_KEY" }
  | { mode: "CREATE"; remoteId: string; kind?: "remote-id" }
  | { mode: "MASTER_ID"; masterId: number; date?: string; voucherType?: string; kind?: "master-id" }
  | { mode: "GUID"; guid: string; kind?: "guid" }
  | { mode: "VOUCHER_KEY"; date: string; voucherType: string; voucherNumber: string; kind?: "voucher-number" };

export interface VoucherXmlAttributes {
  remoteId?: string;
  vchKey?: string;
  vchType?: string;
  objView?: string;
  action?: string;
  tagName?: string;
  tagValue?: string;
}

export interface VoucherPartySnapshot {
  name?: string;
  mailingName?: string;
  address?: string[];
  pinCode?: string;
  state?: string;
  country?: string;
  gstin?: string;
  pan?: string;
  place?: string;
}

export interface VoucherDispatchDetails {
  orderNo?: string;
  orderDate?: string;
  dispatchDocNo?: string;
  dispatchedThrough?: string;
  destination?: string;
  carrierName?: string;
  billOfLadingNo?: string;
  billOfLadingDate?: string;
  vehicleNo?: string;
  termsOfPayment?: string;
  deliveryNotes?: string;
  dispatchFromName?: string;
  dispatchFromAddress?: string[];
  dispatchFromState?: string;
  dispatchFromPlace?: string;
  dispatchFromPincode?: string;
  shipToPlace?: string;
  billToPlace?: string;
}

export interface VoucherGSTDetails {
  registrationType?: string;
  gstRegistration?: string;
  partyGstin?: string;
  companyGstin?: string;
  placeOfSupply?: string;
  voucherGstClass?: string;
  totalTaxAmount?: TallyAmount;
  unknown?: TallyUnknownFields;
}

export interface VoucherEInvoiceDetails {
  irn?: string;
  irnAckNo?: string;
  irnAckDate?: string;
  irnQrCode?: string;
  irnStatus?: string;
  irnCancelDate?: string;
  irnCancelReason?: string;
}

export interface VoucherEWayBillDetails {
  billNumber?: string;
  billDate?: Date | string;
  billStatus?: string;
  consignorPlace?: string;
  consignorState?: string;
  consigneePlace?: string;
  consigneeState?: string;
  transporterName?: string;
  transporterId?: string;
  distance?: number;
  vehicleNumber?: string;
  vehicleType?: string;
}

export interface BillAllocation {
  name: string;
  billType?: string;
  amount?: TallyAmount | number;
  dueDate?: Date | string;
  billDate?: string;
  billCreationDate?: string;
  billId?: number;
  unknown?: TallyUnknownFields;
  _raw?: any;
}

export interface BankAllocation {
  transactionType?: string;
  paymentMode?: string;
  instrumentNumber?: string;
  instrumentDate?: string;
  chequeCrossComment?: string;
  bankName?: string;
  accountNumber?: string;
  ifsCode?: string;
  paymentFavouring?: string;
  payeeName?: string;
  amount?: TallyAmount | number;
  unknown?: TallyUnknownFields;
}

export interface CostCentreAllocation {
  category?: string;
  name: string;
  amount: TallyAmount | number;
}

export interface AccountingAllocation {
  ledgerName: string;
  amount: TallyAmount | number;
  isDeemedPositive?: boolean;
  isPartyLedger?: boolean;
  gstDutyHead?: string;
  roundType?: string;
  methodType?: string;
  taxClassificationName?: string;
  isGstAssessableValueOverridden?: boolean;
  strdIsGstApplicable?: boolean;
  unknown?: TallyUnknownFields;
}

export interface VoucherBatchAllocation {
  godownName: string;
  batchName?: string;
  batchId?: number;
  destinationGodownName?: string;
  indentNo?: string;
  orderNo?: string;
  trackingNumber?: string;
  orderType?: string;
  parentItem?: string;
  orderClosureReason?: string;
  amount?: TallyAmount | number;
  additionalAmount?: TallyAmount | number;
  additionalExpenseAmount?: TallyAmount | number;
  actualQuantity?: TallyQuantity | string | number;
  billedQuantity?: TallyQuantity | string | number;
  rate?: TallyRate | string | number;
  batchRate?: TallyRate | string | number;
  batchDiscount?: number;
  batchDiscountAmount?: TallyAmount | number;
  manufacturingDate?: string;
  mfgDate?: string;
  expiryPeriod?: string;
  indentDueDate?: string;
  orderDueDate?: string;
  unknown?: TallyUnknownFields;
  _raw?: any;
}

export interface VoucherGSTRateDetail {
  dutyHead?: string;
  valuationType?: string;
  rate?: number;
  ratePerUnit?: number;
}

export interface InventoryAllocation {
  stockItemName: string;
  description?: string;
  amount?: TallyAmount | number;
  rate?: TallyRate | string | number;
  actualQuantity?: TallyQuantity | string | number;
  billedQuantity?: TallyQuantity | string | number;
  quantity?: string | number;
  unit?: string;
  isDeemedPositive?: boolean;
  isLastDeemedPositive?: boolean;
  discount?: number;
  discountPercent?: number;
  discountAmount?: number;
  additionalAmount?: number;
  addlAmount?: number;
  additionalCostPercent?: number;
  addlCostPerc?: number;
  hsnCode?: string;
  hsnDescription?: string;
  gstSourceType?: string;
  gstItemSource?: string;
  gstLedgerSource?: string;
  gstGroupSource?: string;
  gstStockGroupSource?: string;
  hsnSourceType?: string;
  hsnItemSource?: string;
  hsnLedgerSource?: string;
  hsnGroupSource?: string;
  hsnStockGroupSource?: string;
  gstRateInferApplicability?: string;
  hsnInferApplicability?: string;
  gstTaxability?: string;
  taxability?: string;
  gstTypeOfSupply?: string;
  typeOfSupply?: string;
  gstStoredNature?: string;
  gstOverrideStoredNature?: string;
  reverseChargeApplicability?: TallyLogical;
  isReverseChargeApplicable?: boolean;
  taxOnMrpApplicability?: TallyLogical;
  computedAssessableValue?: number;
  computedCgst?: number;
  computedSgst?: number;
  computedIgst?: number;
  computedCess?: number;
  computedCessOnQty?: number;
  gstAssessableValue?: number;
  mrpRate?: number;
  mrpAssessableValue?: number;
  mrpComputedCgst?: number;
  mrpComputedSgst?: number;
  mrpComputedIgst?: number;
  mrpComputedCess?: number;
  isAutoNegate?: boolean;
  isCustomsClearance?: boolean;
  isTrackComponent?: boolean;
  isTrackProduction?: boolean;
  isPrimaryItem?: boolean;
  isScrap?: boolean;
  ledgers?: LedgerEntry[];
  batchAllocations?: VoucherBatchAllocation[];
  accountingAllocations?: AccountingAllocation[];
  rateDetails?: VoucherGSTRateDetail[];
  gstRateDetails?: VoucherGSTRateDetail[];
  unknown?: TallyUnknownFields;
  _raw?: any;
}

export interface LedgerEntry {
  ledgerName: string;
  amount?: TallyAmount | number;
  isDeemedPositive?: boolean;
  isLastDeemedPositive?: boolean;
  isPartyLedger?: boolean;
  isDutyLedger?: boolean;
  isSystem?: boolean;
  ledgerFromItem?: boolean;
  removeZeroEntries?: boolean;
  narration?: string;
  methodType?: string;
  roundType?: string;
  roundLimit?: number;
  gstClass?: string;
  gstDutyHead?: string;
  taxClassificationName?: string;
  statClassificationName?: string;
  rateOfTax?: number;
  gstTaxRate?: number;
  gstAssessableValue?: number;
  igstLiability?: number;
  cgstLiability?: number;
  sgstLiability?: number;
  gstCessLiability?: number;
  computedAssessableValue?: number;
  computedIgst?: number;
  computedCgst?: number;
  computedSgst?: number;
  computedCess?: number;
  billAllocations?: BillAllocation[];
  bankAllocations?: BankAllocation[];
  costCentreAllocations?: CostCentreAllocation[];
  inventoryAllocations?: InventoryAllocation[];
  rateDetails?: VoucherGSTRateDetail[];
  unknown?: TallyUnknownFields;
  _raw?: any;
}

export interface Voucher extends TallyObject {
  tags?: VoucherTags;
  date: string;
  effectiveDate?: string;
  voucherType: string;
  voucherTypeName?: string;
  voucherNumber?: string;
  voucherNumberSeries?: string;
  numberingStyle?: string;
  identity?: VoucherIdentity;
  attributes?: VoucherXmlAttributes;
  vchKey?: string;
  voucherKey?: number;
  voucherRetainKey?: number;
  reuseHoleId?: number;
  persistedView?: string;
  objView?: string;
  viewType?: string;
  voucherViewType?: string;
  entryMode?: string;
  vchEntryMode?: string;
  narration?: string;
  reference?: string;
  referenceDate?: string;
  partyName?: string;
  partyLedgerName?: string;
  partyMailingName?: string;
  isDeleted?: boolean;
  isCancelled?: boolean;
  isOptional?: boolean;
  isInvoice?: boolean;
  asOriginal?: boolean;
  asPayslip?: boolean;
  isDeemedPositive?: boolean;
  isDeletedVoucherRetained?: boolean;
  isDeletedVchRetained?: boolean;
  amount?: TallyAmount | number;
  roundOffAmount?: number;
  totalTaxAmount?: number;
  netAmount?: number;
  buyer?: VoucherPartySnapshot;
  consignee?: VoucherPartySnapshot;
  dispatch?: VoucherDispatchDetails;
  gst?: VoucherGSTDetails;
  eInvoice?: VoucherEInvoiceDetails;
  eWayBill?: VoucherEWayBillDetails;
  ewayBillDetails?: VoucherEWayBillDetails;
  ledgerEntries?: LedgerEntry[];
  allLedgerEntries?: LedgerEntry[];
  inventoryEntries?: InventoryAllocation[];
  allInventoryEntries?: InventoryAllocation[];
  inventoryAllocations?: InventoryAllocation[];
  // Backward compatibility flat properties
  partyGSTIN?: string;
  partyGSTRegistrationType?: string;
  partyPincode?: string;
  stateName?: string;
  countryOfResidence?: string;
  placeOfSupply?: string;
  address?: string[];
  buyerName?: string;
  buyerAddress?: string[];
  buyerPinNumber?: string;
  buyerState?: string;
  buyerCountry?: string;
  buyerGSTIN?: string;
  buyerPAN?: string;
  buyerPlace?: string;
  consigneeName?: string;
  consigneeMailingName?: string;
  consigneeAddress?: string[];
  consigneePinNumber?: string;
  consigneePincode?: string;
  consigneeState?: string;
  consigneeCountry?: string;
  consigneeGSTIN?: string;
  consigneePlace?: string;
  companyGSTIN?: string;
  companyState?: string;
  dispatchFromName?: string;
  dispatchFromAddress?: string[];
  dispatchFromState?: string;
  dispatchFromPlace?: string;
  dispatchFromPincode?: string;
  shipToPlace?: string;
  billToPlace?: string;
  orderNo?: string;
  orderDate?: string;
  dispatchDocNo?: string;
  dispatchedThrough?: string;
  destination?: string;
  carrierName?: string;
  billOfLadingNo?: string;
  billOfLadingDate?: string;
  vehicleNo?: string;
  termsOfPayment?: string;
  deliveryNotes?: string;
  irn?: string;
  irnAckNo?: string;
  irnAckDate?: string;
  irnQrCode?: string;
  irnStatus?: string;
  irnCancelDate?: string;
  irnCancelReason?: string;
  voucherGSTClass?: string;
  gstRegistration?: string;
  unknown?: TallyUnknownFields;
}
