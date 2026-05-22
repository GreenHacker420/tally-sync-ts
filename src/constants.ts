export const PREFIX = "TC_";

export const VOUCHER_TYPES = {
  PAYMENT: "$$VchTypePayment",
  RECEIPT: "$$VchTypeReceipt",
  CONTRA: "$$VchTypeContra",
  JOURNAL: "$$VchTypeJournal",
  REVERSING_JOURNAL: "$$VchTypeRevJrnl",
  SALES: "$$VchTypeSales",
  PURCHASE: "$$VchTypePurchase",
  SALES_ORDER: "$$VchTypeSalesOrder",
  PURCHASE_ORDER: "$$VchTypePurcOrder",
  DEBIT_NOTE: "$$VchTypeDebitNote",
  CREDIT_NOTE: "$$VchTypeCreditNote",
  JOB_WORK_OUT: "$$VchTypeJobOrderIn",
  JOB_WORK_IN: "$$VchTypeJobOrderOut",
  MATERIAL_OUT: "$$VchTypeJobMaterialIssue",
  MATERIAL_IN: "$$VchTypeJobMaterialReceive",
  DELIVERY_NOTE: "$$VchTypeDelNote",
  RECEIPT_NOTE: "$$VchTypeRcptNote",
  STOCK_JOURNAL: "$$VchTypeStockJrnl",
  PHYSICAL_STOCK: "$$VchTypePhysStock",
  REJECTIONS_IN: "$$VchTypeRejIn",
  REJECTIONS_OUT: "$$VchTypeRejOut",
  PAYROLL: "$$VchTypePayroll",
  ATTENDANCE: "$$VchTypeAttendance",
  MEMO: "$$VchTypeMemo",
} as const;

export type TallyVoucherType = typeof VOUCHER_TYPES[keyof typeof VOUCHER_TYPES];

export const PERIODICITY = {
  MONTH: "Month",
  DAY: "Day",
  WEEK: "Week",
  FORTNIGHT: "Fortnight",
  THREE_MONTH: "3 Month",
  SIX_MONTH: "6 Month",
  YEAR: "Year",
} as const;

// Default TDL dynamic functions used in requests
export const DEFAULT_TDL_FUNCTIONS = [
  {
    name: "TC_GetBooleanFromLogicField",
    parameters: ["val : Logical : None"],
    returns: "String",
    actions: [
      "000 :   If  : $$ISEmpty:##val",
      "001 :Return :\"false\"",
      "002 : Else    :",
      "003 : If  :  ##val ",
      "004 :Return :\"true\"",
      "005 : Else    :",
      "006 :Return : \"false\"",
      "007 : End If",
      "008 : End If",
    ],
  },
  {
    name: "TC_TransformDateToXSD",
    parameters: ["ParamInputDate   : Date"],
    variables: [
      "ParamSeparator        : String : \"-\"",
      "TempVarYear           : String",
      "TempVarMonth          : String",
      "TempVarDate           : String",
    ],
    returns: "String",
    actions: [
      "01  : If        : NOT $$IsEmpty:##ParamInputDate",
      "02  :   Set     : TempVarYear       : $$Zerofill:($$YearofDate:##ParamInputDate):4",
      "03  :   Set     : TempVarMonth      : $$Zerofill:($$MonthofDate:##ParamInputDate):2",
      "04  :   Set     : TempVarDate       : $$Zerofill:($$DayofDate:##ParamInputDate):2",
      "05  :   Return  : $$String:##TempVarYear + $$String:##ParamSeparator + $$String:##TempVarMonth + $$String:##ParamSeparator + $$String:##TempVarDate",
      "06  : End If",
      "07  : Return    : \"\"",
    ],
  },
];
