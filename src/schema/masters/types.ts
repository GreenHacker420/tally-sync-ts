import type { LedgerTags, StockItemTags, CompanyTags } from "../catalog/tallyTagsCatalog.js";
import { BaseAliasedMasterObject, TallyObject } from "../common/base.js";
import {
  MultiAddress,
  MailingDetail,
  PaymentDetails,
  LedgerContactDetail,
  LedgerGSTRegistrationDetail,
  GSTDetail,
  HSNDetail
} from "../common/types.js";
import { TallyAmount } from "../../xml/values.js";
import { TallyUnknownFields } from "../../xml/types.js";

export interface Company extends TallyObject {
  tags?: CompanyTags;
  name: string;
  startingFrom?: string;
  booksBeginningFrom?: string;
  financialYearFrom?: string;
  formalName?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  phoneNumber?: string;
  mobileNumber?: string;
  address?: string;
  addressLines?: string[];
  faxNumber?: string;
  email?: string;
  website?: string;
  tanNumber?: string;
  tanRegNumber?: string;
  pan?: string;
  panNumber?: string;
  cin?: string;
  gstin?: string;
  currency?: string;
  baseCurrencySymbol?: string;
  isEducationalMode?: boolean;
  isInventoryOn?: boolean;
  integrateAccountswithInventory?: boolean;
  isBillWiseOn?: boolean;
  isCostCentersOn?: boolean;
  isTDSOn?: boolean;
  isTCSOn?: boolean;
  isGSTOn?: boolean;
  isPayrollOn?: boolean;
  isInterestOn?: boolean;
  unknown?: TallyUnknownFields;
}

export interface Group extends BaseAliasedMasterObject {
  parent: string;
  reservedName?: string;
  isRevenue?: boolean;
  isDeemedPositive?: boolean;
  affectGrossProfit?: boolean;
  isSubledger?: boolean;
  sortPosition?: number;
  addlAllocType?: string;
  isCalculable?: boolean;
  isAddable?: boolean;
  unknown?: TallyUnknownFields;
}

export interface Ledger extends BaseAliasedMasterObject {
  tags?: LedgerTags;
  msmeRegNumber?: string;
  msmeEnterpriseType?: "Micro" | "Small" | "Medium" | "Non-MSME" | string;
  msmeRegDate?: string;
  msmeStatus?: string;
  isCreditCheck?: boolean;
  bankName?: string;
  accountNumber?: string;
  bankBsrCode?: string;
  branchName?: string;
  ifsCode?: string;
  swiftCode?: string;
  group: string;
  parent?: string;
  openingBalance?: TallyAmount | number;
  closingBalance?: TallyAmount | number;
  currency?: string;
  currencyName?: string;
  taxType?: string;
  gstTaxType?: string;
  gstApplicable?: string;
  gstType?: string;
  gstTypeOfSupply?: string;
  rateOfTax?: number;
  appropriateFor?: string;
  panNumber?: string;
  countryOfResidence?: string;
  pinCode?: string;
  pincode?: string;
  oldPinCode?: string;
  address?: string;
  phone?: string;
  mobile?: string;
  contact?: string;
  fax?: string;
  countryIsdCode?: string;
  email?: string;
  emailCc?: string;
  website?: string;
  bankAccountHolderName?: string;
  isBillWise?: boolean;
  isBillWiseOn?: boolean;
  isCostCentresOn?: boolean;
  isInterestOn?: boolean;
  isCostTrackingOn?: boolean;
  affectsStock?: boolean;
  isTcsApplicable?: boolean;
  isTdsApplicable?: boolean;
  isGstApplicable?: boolean;
  considerPurchaseForExport?: boolean;
  isTransporter?: boolean;
  isChequePrintingEnabled?: boolean;
  isEBankingEnabled?: boolean;
  sortPosition?: number;
  partyGstin?: string;
  gstin?: string;
  state?: string;
  stateName?: string;
  country?: string;
  placeOfSupply?: string;
  gstRegistrationType?: string;
  addressLines?: string[];
  creditLimit?: string;
  creditPeriod?: string;
  addresses?: MultiAddress[];
  mailingDetails?: MailingDetail[];
  gstRegistrationDetails?: LedgerGSTRegistrationDetail[];
  contactDetails?: LedgerContactDetail[];
  gstDetails?: GSTDetail[];
  hsnDetails?: HSNDetail[];
  paymentDetails?: PaymentDetails[];
  unknown?: TallyUnknownFields;
}

export interface CostCentre extends BaseAliasedMasterObject {
  category?: string;
  parent?: string;
  emailId?: string;
  showOpeningBal?: boolean;
  unknown?: TallyUnknownFields;
}

export interface CostCategory extends BaseAliasedMasterObject {
  allocateRevenue?: boolean;
  allocateNonRevenue?: boolean;
  unknown?: TallyUnknownFields;
}

export interface VoucherClassLedger {
  name: string;
  roundType?: string;
  gstClassificationNature?: string;
  methodType?: string;
  classRate?: string;
  ledgerFromItem?: boolean;
  removeZeroEntries?: boolean;
  roundLimit?: number;
}

export interface DefaultAllocforItem {
  stockItemName: string;
  ledgerFromItem?: boolean;
  ledgerEntries?: VoucherClassLedger[];
}

export interface VoucherClass {
  className: string;
  posCardLedger?: string;
  posCashLedger?: string;
  posGiftLedger?: string;
  posChequeLedger?: string;
  forJobCosting?: boolean;
  useforInterest?: boolean;
  useforGainLoss?: boolean;
  useforGodownTransfer?: boolean;
  useforCompound?: boolean;
  classforVAT?: boolean;
  useforFBT?: boolean;
  posEnableCardLedger?: boolean;
  posEnableCashLedger?: boolean;
  posEnableGiftLedger?: boolean;
  posEnableChequeLedger?: boolean;
  useforExciseCommercialInvoice?: boolean;
  useforServiceTax?: boolean;
  classforExcise?: boolean;
  classforDealerExciseShortage?: boolean;
  posEnableOnAccountLedger?: boolean;
  useBankAllocforcc?: boolean;
  isDefaultClass?: boolean;
  adjDiffinFirstLedger?: boolean;
  adjDiffinFirstLedgerItem?: boolean;
  ledgersforInventory?: VoucherClassLedger[];
  ledgerEntries?: VoucherClassLedger[];
  stockEntries?: DefaultAllocforItem[];
}

export interface VoucherType extends BaseAliasedMasterObject {
  parent: string;
  numberingMethod?: string;
  useZeroEntries?: boolean;
  isActive?: boolean;
  printAfterSave?: boolean;
  useforPOSInvoice?: boolean;
  vchPrintBankName?: string;
  vchPrintTitle?: string;
  taxUnitName?: string;
  vchPrintJurisdiction?: string;
  isOptional?: boolean;
  commonNarration?: boolean;
  multiNarration?: boolean;
  isDefaultAllocationEnabled?: boolean;
  effectStock?: boolean;
  asMfgJrnl?: boolean;
  useforJobwork?: boolean;
  isforJobworkIn?: boolean;
  voucherClasses?: VoucherClass[];
  defaultVoucherCategory?: string;
  coreVoucherType?: string;
  unknown?: TallyUnknownFields;
}

export interface Unit extends TallyObject {
  name: string;
  formalName?: string;
  baseUnit?: string;
  additionalUnits?: string;
  uqc?: string;
  decimalPlaces?: number;
  isSimpleUnit?: boolean;
  isGstExcluded?: boolean;
  conversion?: number;
  unknown?: TallyUnknownFields;
}

export interface StockGroup extends BaseAliasedMasterObject {
  parent?: string;
  isAddable?: boolean;
  gstApplicability?: string;
  baseUnit?: string;
  gstDetails?: GSTDetail[];
  unknown?: TallyUnknownFields;
}

export interface StockCategory extends BaseAliasedMasterObject {
  parent?: string;
  unknown?: TallyUnknownFields;
}

export interface Godown extends BaseAliasedMasterObject {
  parent?: string;
  unknown?: TallyUnknownFields;
}

export interface OpeningBatchAllocation {
  batchName?: string;
  godownName: string;
  name?: string;
  manufacturingDate?: Date | string;
  expiryPeriod?: string;
  quantity?: number;
  rate?: number;
  value?: number;
}

export interface ComponentListItem {
  natureOfComponent: string;
  itemName: string;
  defaultGodown?: string;
  actualQuantity: number;
}

export interface ComponentList {
  name: string;
  baseQuantity: number;
  componentListItems: ComponentListItem[];
}

export interface StockItem extends BaseAliasedMasterObject {
  tags?: StockItemTags;
  baseUnit: string;
  additionalUnits?: string;
  stockGroup?: string;
  stockCategory?: string;
  gstApplicable?: string;
  gstTypeOfSupply?: string;
  tcsApplicable?: string;
  description?: string;
  narration?: string;
  costingMethod?: string;
  valuationMethod?: string;
  isCostTracking?: boolean;
  isCostCentresOn?: boolean;
  isBatchWiseOn?: boolean;
  maintainInBranches?: boolean; // alias for isBatchWiseOn
  isPerishableOn?: boolean;
  useExpiryDates?: boolean; // alias for isPerishableOn
  hasManufacturingDate?: boolean;
  trackDateOfManufacturing?: boolean; // alias for hasManufacturingDate
  inclusiveOfTax?: boolean;
  denominator?: number;
  conversion?: number;
  rateOfDuty?: string;
  openingBalance?: number;
  openingRate?: number;
  openingValue?: number;
  closingBalance?: number;
  closingRate?: number;
  closingValue?: number;
  standardCost?: number;
  standardPrice?: number;
  mrpRate?: number;
  reorderLevel?: number;
  minimumOrderQty?: number;
  ignorePhysicalDifference?: boolean;
  ignoreNegativeStock?: boolean;
  treatSalesAsManufactured?: boolean;
  treatPurchasesAsConsumed?: boolean;
  calcOnMrp?: boolean;
  isMrpInclOfTax?: boolean;
  gstCalcSlabOnMrp?: boolean;
  modifyMrpRate?: boolean;
  mailingNames?: string[];
  gstDetails?: GSTDetail[];
  hsnDetails?: HSNDetail[];
  hsnCode?: string;
  hsnDescription?: string;
  taxability?: string;
  integratedTaxRate?: number;
  centralTaxRate?: number;
  stateTaxRate?: number;
  cessRate?: number;
  openingBatchAllocations?: OpeningBatchAllocation[];
  components?: ComponentList[];
  unknown?: TallyUnknownFields;
}

export interface Employee extends CostCentre {}
export interface EmployeeGroup extends CostCentre {}

export interface Currency extends TallyObject {
  name: string;
  formalName?: string;
  unknown?: TallyUnknownFields;
}

export interface GSTRegistrationDetail {
  applicableFrom?: Date | string;
  gstRegistrationType?: string;
  state?: string;
  placeOfSupply?: string;
  isOtherTerritoryAssessee?: boolean;
  isStateCessOn?: boolean;
}

export interface GSTRegistration extends BaseAliasedMasterObject {
  stateName: string;
  priorStateName?: string;
  gstin?: string;
  eWayApplicableType?: string;
  gstUserName?: string;
  eSignMethod?: string;
  isOtherTerritoryAssessee?: boolean;
  isEwayBillApplicable?: boolean;
  isEwayBillApplicableForIntra?: boolean;
  registrationDetails?: GSTRegistrationDetail[];
  unknown?: TallyUnknownFields;
}

export interface AttendanceType extends BaseAliasedMasterObject {
  parent?: string;
  attendanceType?: string;
  unit?: string;
  unknown?: TallyUnknownFields;
}

export interface Budget extends BaseAliasedMasterObject {
  parent?: string;
  startingFrom?: Date | string;
  endingAt?: Date | string;
  unknown?: TallyUnknownFields;
}
