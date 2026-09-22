
export type VoucherAction = "Create" | "Alter" | "Cancel";

export type VoucherIdentity =
  | { mode: "CREATE"; remoteId: string }
  | { mode: "MASTER_ID"; masterId: number; date?: string; voucherType?: string }
  | { mode: "GUID"; guid: string }
  | { mode: "VOUCHER_KEY"; date: string; voucherType: string; voucherNumber: string };

export interface VoucherXmlOptions {
  action?: VoucherAction;
  identity?: VoucherIdentity;
  companyName?: string;
}

export interface RequestOptions {
  company?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  filters?: { name: string; formula?: string }[];
  fetchList?: string[];
  compute?: string[];
  computeVar?: string[];
  childOf?: string;
  collectionType?: string;
  belongsTo?: "Yes" | "No";
}

export interface PaginatedRequestOptions extends RequestOptions {
  pageNum?: number;
  recordsPerPage?: number;
  disableCountTag?: boolean;
}

export interface PostRequestOptions {
  company?: string;
  stopAtFirstError?: boolean;
}

export interface PeriodicVoucherStatisticsOptions extends RequestOptions {
  voucherType?: string;
}

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

export interface LastAlterIds {
  mastersLastId: number;
  vouchersLastId: number;
}

export interface TallyResult {
  status: "success" | "failure";
  response?: string;
  error?: string;
}

export interface PostResponse {
  status: "success" | "failure";
  message: string;
  masterId?: number;
  lastVchId?: number;
  created?: number;
  altered?: number;
  deleted?: number;
  cancelled?: number;
  errors?: number;
  alteredId?: number;
  objectType?: string;
  name?: string;
  guid?: string;
  remoteId?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  totalCount: number;
  pageNum: number;
  recordsPerPage: number;
  totalPages: number;
  objects: T[];
}

// Complex helper interfaces mirroring C# structures
export interface TallyAmount {
  amount: number;
  currency?: string;
  forexAmount?: number;
  forexCurrency?: string;
  rateOfExchange?: number;
  isDebit?: boolean;
}

export interface TallyQuantity {
  quantity: number;
  unit?: string;
}

export interface TallyRate {
  rate: number;
  per?: string;
  unit?: string;
}

export interface DueDate {
  date?: Date | string;
  text?: string;
}

export interface LanguageNameList {
  names: string[];
  languageId?: number;
}

export interface MailingDetail {
  addressLines?: string[];
  applicableFrom?: Date | string;
  mailingName?: string;
  country?: string;
  state?: string;
  pinCode?: string;
}

export interface ExciseJurisdiction {
  applicableFrom?: Date | string;
  range?: string;
  division?: string;
  commissionerate?: string;
}

export interface MultiAddress {
  addressName: string;
  addressLines?: string[];
  country?: string;
  state?: string;
  pinCode?: string;
  contactPerson?: string;
  mobileNo?: string;
  phoneNumber?: string;
  faxNumber?: string;
  email?: string;
  panNumber?: string;
  vatNumber?: string;
  cstNumber?: string;
  exciseNatureOfPurchase?: string;
  exciseRegistrationNo?: string;
  exciseImportRegistrationNo?: string;
  importExportCode?: string;
  gstDealerType?: string;
  isOtherTerritoryAssessee?: boolean;
  gstin?: string;
  exciseJurisdictions?: ExciseJurisdiction[];
}

export interface PaymentDetails {
  bankName: string;
  city?: string;
  defaultTransactionType?: string;
  inFavour?: string;
  transactionName?: string;
  chequeCrossComment?: string;
  setAsDefault?: boolean;
  bankAccountNo?: string;
  bankBranch?: string;
  ifsc?: string;
}

export interface LedgerGSTRegistrationDetail {
  applicableFrom?: Date | string;
  gstRegistrationType?: string;
  state?: string;
  placeOfSupply?: string;
  isOtherTerritoryAssessee?: boolean;
  considerPurchaseForExport?: boolean;
  isTransporter?: boolean;
  transporterId?: string;
  isCommonParty?: boolean;
  gstin?: string;
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
}

export interface GSTRateDetail {
  dutyHead?: string;
  valuationType?: string;
  gstRate: number;
}

export interface StateWiseDetail {
  stateName?: string;
  rateDetails?: GSTRateDetail[];
}

export interface GSTDetail {
  applicableFrom?: Date | string;
  calculationType?: string;
  calculateSlabOnMRP?: boolean;
  natureOfTransaction?: string;
  isNonGSTGoods?: boolean;
  taxability?: string;
  sourceOfGSTDetails?: string;
  isReverseChargeApplicable?: boolean;
  isInEligibleForITC?: boolean;
  includeExpForSlabCalc?: boolean;
  stateWiseDetails?: StateWiseDetail[];
}

export interface HSNDetail {
  applicableFrom?: Date | string;
  hsnDescription?: string;
  hsnCode?: string;
  hsnClassificationName?: string;
  source?: string;
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

// C# Base class structures ported to TypeScript
export interface BaseObject {}

export interface BaseTallyObject extends BaseObject {
  guid?: string;
  remoteId?: string;
  action?: "Create" | "Alter" | "Delete" | "Cancel";
  _raw?: any;
}

export interface TallyObject extends BaseTallyObject {
  masterId?: number;
  alterId?: number;
  enteredBy?: string;
  alteredBy?: string;
  canDelete?: boolean;
}

export interface BaseMasterObject extends TallyObject {
  name: string;
}

export interface BaseAliasedMasterObject extends BaseMasterObject {
  alias?: string;
  languageNameList?: LanguageNameList[];
}

// Main Master Models
export interface Company extends TallyObject {
  name: string;
  startingFrom?: string;
  booksBeginningFrom?: string;
  endDate?: string | Date;
  compNum?: string;
  isGroupCompany?: boolean;
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
  financialYearFrom?: string;
  isEducationalMode?: boolean;
  // Settings
  isInventoryOn?: boolean;
  integrateAccountswithInventory?: boolean;
  isBillWiseOn?: boolean;
  isCostCentersOn?: boolean;
  isTDSOn?: boolean;
  isTCSOn?: boolean;
  isGSTOn?: boolean;
  isPayrollOn?: boolean;
  isInterestOn?: boolean;
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
}

export interface Ledger extends BaseAliasedMasterObject {
  group: string;
  openingBalance?: number | TallyAmount;
  closingBalance?: number | TallyAmount;
  currency?: string;
  taxType?: string;
  gstTaxType?: string;
  rateOfTax?: number;
  appropriateFor?: string;
  isBillWise?: boolean;
  isCostCentresOn?: boolean;
  isInterestOn?: boolean;
  isCreditCheck?: boolean;
  creditLimit?: string;
  email?: string;
  emailCc?: string;
  website?: string;
  panNumber?: string;
  gstTypeOfSupply?: string;
  bankName?: string;
  accountNumber?: string;
  bankBsrCode?: string;
  branchName?: string;
  ifsCode?: string;
  swiftCode?: string;
  paymentDetails?: PaymentDetails[];
  addresses?: MultiAddress[];
  mailingDetails?: MailingDetail[];
  gstRegistrationDetails?: LedgerGSTRegistrationDetail[];
  gstDetails?: GSTDetail[];
  hsnDetails?: HSNDetail[];
  updatedAt?: Date | string;
  phone?: string;
  mobile?: string;
  contact?: string;
  partyGstin?: string;
  state?: string;
  stateName?: string;
  country?: string;
  placeOfSupply?: string;
  gstRegistrationType?: string;
  gstin?: string;
  addressLines?: string[];
}

export interface CostCentre extends BaseAliasedMasterObject {
  category?: string;
  parent?: string;
  emailId?: string;
  showOpeningBal?: boolean;
}

export interface CostCategory extends BaseAliasedMasterObject {
  allocateRevenue?: boolean;
  allocateNonRevenue?: boolean;
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
}

export interface Unit extends TallyObject {
  name: string; // dzn
  formalName?: string; // Dozens
  baseUnit?: string;
  additionalUnits?: string;
  uqc?: string;
  decimalPlaces?: number;
  isSimpleUnit?: boolean;
  isGstExcluded?: boolean;
  conversion?: number;
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
  maintainInBranches?: boolean;
  useExpiryDates?: boolean;
  trackDateOfManufacturing?: boolean;
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
}

export interface StockGroup extends BaseAliasedMasterObject {
  parent?: string;
  isAddable?: boolean;
  gstApplicability?: string;
  baseUnit?: string;
  gstDetails?: GSTDetail[];
}

export interface StockCategory extends BaseAliasedMasterObject {
  parent?: string;
}

export interface Godown extends BaseAliasedMasterObject {
  parent?: string;
}

export interface Employee extends CostCentre {
  // Inherits category, parent, emailId, showOpeningBal
}

export interface EmployeeGroup extends CostCentre {
  // Inherits category, parent, emailId, showOpeningBal
}

// Transaction Models
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
  amount?: number | TallyAmount;
}

export interface LedgerEntry {
  ledgerName: string;
  amount: number | TallyAmount;
  isDeemedPositive: boolean;
  isPartyLedger?: boolean;
  isDutyLedger?: boolean;
  isSystem?: boolean;
  isLastDeemedPositive?: boolean;
  narration?: string;
  methodType?: string;
  roundType?: string;
  roundLimit?: number;
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
  _raw?: any;
}

export interface InventoryAllocation {
  stockItemName: string;
  description?: string;
  quantity: string | number;
  rate: string | number;
  amount: number | TallyAmount;
  unit?: string;
  isDeemedPositive: boolean;
  discount?: number;
  discountAmount?: number;
  addlAmount?: number;
  addlCostPerc?: number;
  hsnCode?: string;
  hsnDescription?: string;
  hsnSourceType?: string;
  hsnItemSource?: string;
  gstSourceType?: string;
  gstItemSource?: string;
  rateInferApplicability?: string;
  hsnInferApplicability?: string;
  taxability?: string;
  typeOfSupply?: string;
  gstOverrideStoredNature?: string;
  isReverseChargeApplicable?: boolean;
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
  isScrap?: boolean;
  isPrimaryItem?: boolean;
  isCustomsClearance?: boolean;
  isTrackComponent?: boolean;
  isTrackProduction?: boolean;
  isAutoNegate?: boolean;
  ledgers?: LedgerEntry[];
  billedQuantity?: string | number | TallyQuantity;
  actualQuantity?: string | number | TallyQuantity;
  batchAllocations?: VoucherBatchAllocation[];
  accountingAllocations?: AccountingAllocation[];
  gstRateDetails?: VoucherGSTRateDetail[];
  _raw?: any;
}

export interface BillAllocation {
  name: string;
  billType?: string;
  amount: number | TallyAmount;
  dueDate?: Date | string | DueDate;
  billDate?: string;
  billCreationDate?: string;
  billId?: number;
  _raw?: any;
}

export interface CostCentreAllocation {
  category?: string;
  name: string;
  amount: number | TallyAmount;
}

export interface AccountingAllocation {
  ledgerName: string;
  amount: number | TallyAmount;
  isDeemedPositive?: boolean;
  isPartyLedger?: boolean;
  gstDutyHead?: string;
  roundType?: string;
  methodType?: string;
  taxClassificationName?: string;
  isGstAssessableValueOverridden?: boolean;
  strdIsGstApplicable?: boolean;
}

export interface VoucherBatchAllocation {
  godownName: string;
  batchName?: string;
  batchId?: number;
  orderNo?: string;
  trackingNumber?: string;
  indentNo?: string;
  amount?: number | TallyAmount;
  actualQuantity?: string | number | TallyQuantity;
  billedQuantity?: string | number | TallyQuantity;
  rate?: string | number | TallyRate;
  batchRate?: string | number;
  expiryPeriod?: string;
  mfgDate?: string;
  discount?: number;
  discountAmount?: number;
  destinationGodownName?: string;
  orderClosureReason?: string;
  orderDueDate?: string;
  _raw?: any;
}

export interface VoucherGSTRateDetail {
  dutyHead?: string;
  valuationType?: string;
  rate?: number;
  ratePerUnit?: number;
}

export interface EWayBillDetails {
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

export interface Voucher extends TallyObject {
  remoteId?: string;
  guid?: string;
  identity?: VoucherIdentity;
  isCancelled?: boolean;
  isDeleted?: boolean;
  isInvoice?: boolean;
  isOptional?: boolean;
  isDeemedPositive?: boolean;
  asOriginal?: boolean;
  asPayslip?: boolean;
  isDeletedVchRetained?: boolean;
  date: Date | string;
  effectiveDate?: Date | string;
  voucherType: string;
  voucherTypeName?: string;
  voucherNumber?: string;
  voucherNumberSeries?: string;
  numberingStyle?: string;
  vchKey?: string | number;
  vchRetainKey?: string | number;
  reuseHoleId?: number;
  narration?: string;
  reference?: string;
  referenceDate?: Date | string;
  partyName?: string;
  partyLedgerName?: string;
  partyMailingName?: string;
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
  stateName?: string;
  countryOfResidence?: string;
  address?: string[];
  partyGSTIN?: string;
  partyGSTRegistrationType?: string;
  gstRegistration?: string;
  placeOfSupply?: string;
  partyPincode?: string;
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
  vchEntryMode?: "Item Invoice" | "Accounting Invoice" | "As Voucher" | string;
  persistedView?: string;
  objView?: string;
  viewType?: string;
  amount?: number | TallyAmount;
  totalTaxAmount?: number;
  netAmount?: number;
  roundOffAmount?: number;
  ledgerEntries?: LedgerEntry[];
  inventoryAllocations?: InventoryAllocation[];
  allInventoryEntries?: InventoryAllocation[];
  ewayBillDetails?: EWayBillDetails;
}

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

export interface Currency extends TallyObject {
  name: string; // Maps to ORIGINALNAME
  formalName?: string; // Maps to MAILINGNAME
}

export interface AttendanceType extends BaseAliasedMasterObject {
  parent?: string;
  attendanceType?: string; // e.g. "Attendance / Leave with Pay", "Leave without Pay", "Production", etc.
  unit?: string; // Associated payroll unit
}

export interface Budget extends BaseAliasedMasterObject {
  parent?: string;
  startingFrom?: Date | string;
  endingAt?: Date | string;
}

export type Periodicity = "Day" | "Week" | "Fortnight" | "Month" | "Three Month" | "Six Month" | "Year";

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

export type TallyObjectType =
  | "Ledger"
  | "Group"
  | "Company"
  | "Voucher"
  | "CostCentre"
  | "CostCategory"
  | "VoucherType"
  | "Unit"
  | "StockGroup"
  | "StockCategory"
  | "Godown"
  | "StockItem"
  | "Employee"
  | "EmployeeGroup"
  | "Currency"
  | "GSTRegistration"
  | "AttendanceType"
  | "Budget";

export type TallyObjectMap = {
  Ledger: Ledger;
  Group: Group;
  Company: Company;
  Voucher: Voucher;
  CostCentre: CostCentre;
  CostCategory: CostCategory;
  VoucherType: VoucherType;
  Unit: Unit;
  StockGroup: StockGroup;
  StockCategory: StockCategory;
  Godown: Godown;
  StockItem: StockItem;
  Employee: Employee;
  EmployeeGroup: EmployeeGroup;
  Currency: Currency;
  GSTRegistration: GSTRegistration;
  AttendanceType: AttendanceType;
  Budget: Budget;
};

