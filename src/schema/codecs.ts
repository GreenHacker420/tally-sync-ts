import { TallyCodecRegistry } from "./registry.js";
import { voucherCodec } from "./transactions/voucherCodec.js";
import { ledgerCodec } from "./masters/ledgerCodec.js";
import { stockItemCodec } from "./masters/stockItemCodec.js";
import { companyCodec } from "./masters/companyCodec.js";
import {
  groupCodec,
  unitCodec,
  stockGroupCodec,
  stockCategoryCodec,
  godownCodec,
  voucherTypeCodec,
  costCentreCodec,
  costCategoryCodec,
  employeeCodec,
  employeeGroupCodec,
  currencyCodec,
  gstRegistrationCodec,
  attendanceTypeCodec,
  budgetCodec,
} from "./masters/otherCodecs.js";

export const tallyCodecs: TallyCodecRegistry = {
  Voucher: voucherCodec,
  Ledger: ledgerCodec,
  StockItem: stockItemCodec,
  Company: companyCodec,
  Group: groupCodec,
  Unit: unitCodec,
  StockGroup: stockGroupCodec,
  StockCategory: stockCategoryCodec,
  Godown: godownCodec,
  VoucherType: voucherTypeCodec,
  CostCentre: costCentreCodec,
  CostCategory: costCategoryCodec,
  Employee: employeeCodec,
  EmployeeGroup: employeeGroupCodec,
  Currency: currencyCodec,
  GSTRegistration: gstRegistrationCodec,
  AttendanceType: attendanceTypeCodec,
  Budget: budgetCodec,
};
