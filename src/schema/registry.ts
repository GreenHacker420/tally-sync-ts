import { XmlElement } from "../xml/types.js";
import {
  Company,
  Group,
  Ledger,
  CostCentre,
  CostCategory,
  VoucherType,
  Unit,
  StockGroup,
  StockCategory,
  Godown,
  StockItem,
  Employee,
  EmployeeGroup,
  Currency,
  GSTRegistration,
  AttendanceType,
  Budget
} from "./masters/types.js";
import { Voucher } from "./transactions/types.js";

export const TALLY_OBJECTS = {
  Ledger: { collectionType: "Ledger", xmlTag: "LEDGER", importReport: "All Masters" },
  Group: { collectionType: "Group", xmlTag: "GROUP", importReport: "All Masters" },
  Company: { collectionType: "Company", xmlTag: "COMPANY", importReport: "All Masters" },
  Voucher: { collectionType: "Voucher", xmlTag: "VOUCHER", importReport: "Vouchers" },
  CostCentre: { collectionType: "CostCentre", xmlTag: "COSTCENTRE", importReport: "All Masters" },
  CostCategory: { collectionType: "CostCategory", xmlTag: "COSTCATEGORY", importReport: "All Masters" },
  VoucherType: { collectionType: "VoucherType", xmlTag: "VOUCHERTYPE", importReport: "All Masters" },
  Unit: { collectionType: "Unit", xmlTag: "UNIT", importReport: "All Masters" },
  StockGroup: { collectionType: "StockGroup", xmlTag: "STOCKGROUP", importReport: "All Masters" },
  StockCategory: { collectionType: "StockCategory", xmlTag: "STOCKCATEGORY", importReport: "All Masters" },
  Godown: { collectionType: "Godown", xmlTag: "GODOWN", importReport: "All Masters" },
  StockItem: { collectionType: "StockItem", xmlTag: "STOCKITEM", importReport: "All Masters" },
  Employee: { collectionType: "CostCentre", xmlTag: "COSTCENTRE", importReport: "All Masters" },
  EmployeeGroup: { collectionType: "CostCentre", xmlTag: "COSTCENTRE", importReport: "All Masters" },
  Currency: { collectionType: "Currency", xmlTag: "CURRENCY", importReport: "All Masters" },
  GSTRegistration: { collectionType: "TaxUnit", xmlTag: "TAXUNIT", importReport: "All Masters" },
  AttendanceType: { collectionType: "AttendanceType", xmlTag: "ATTENDANCE", importReport: "All Masters" },
  Budget: { collectionType: "Budget", xmlTag: "BUDGET", importReport: "All Masters" },
} as const;

export type TallyObjectType = keyof typeof TALLY_OBJECTS;

export type TallyNativeCollectionType =
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
  | "Currency"
  | "TaxUnit"
  | "AttendanceType"
  | "Budget";

export type TallyCollectionType = TallyNativeCollectionType | (string & {});

export interface TallyObjectMap {
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
}

export type TallyFieldAccess = "read" | "write" | "read-write" | "system";

export interface TallyCodec<T> {
  readonly xmlTag: string;
  parse(node: Record<string, unknown>): T;
  build(value: T, options?: any): XmlElement;
}

export type TallyCodecRegistry = {
  [K in TallyObjectType]: TallyCodec<TallyObjectMap[K]>;
};

export function assertNever(value: never): never {
  throw new Error(`Unexpected value in exhaustive switch: ${String(value)}`);
}
