import { TallyReader } from "../../xml/reader.js";
import { XmlElement } from "../../xml/types.js";
import { el, boolElement } from "../../xml/writer.js";
import { TallyCodec } from "../registry.js";
import {
  Group,
  Unit,
  StockGroup,
  StockCategory,
  Godown,
  VoucherType,
  CostCentre,
  CostCategory,
  Currency,
  GSTRegistration,
  AttendanceType,
  Budget,
  Employee,
  EmployeeGroup
} from "./types.js";

export const groupCodec: TallyCodec<Group> = {
  xmlTag: "GROUP",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      parent: r.text("PARENT") ?? "",
      reservedName: r.text("RESERVEDNAME"),
      isRevenue: r.boolean("ISREVENUE"),
      isDeemedPositive: r.boolean("ISDEEMEDPOSITIVE"),
      affectGrossProfit: r.boolean("AFFECTSGROSSPROFIT"),
      isSubledger: r.boolean("ISSUBLEDGER"),
      sortPosition: r.number("SORTPOSITION"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "GROUP",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("PARENT", item.parent)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const unitCodec: TallyCodec<Unit> = {
  xmlTag: "UNIT",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      formalName: r.text("ORIGINALNAME"),
      baseUnit: r.text("BASEUNITS"),
      additionalUnits: r.text("ADDITIONALUNITS"),
      uqc: r.text("GSTREPUOM"),
      decimalPlaces: r.number("DECIMALPLACES"),
      isSimpleUnit: r.boolean("ISSIMPLEUNIT"),
      isGstExcluded: r.boolean("ISGSTEXCLUDED"),
      conversion: r.number("CONVERSION"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "UNIT",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("ORIGINALNAME", item.formalName)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const stockGroupCodec: TallyCodec<StockGroup> = {
  xmlTag: "STOCKGROUP",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      parent: r.text("PARENT") ?? "",
      isAddable: r.boolean("ISADDABLE"),
      gstApplicability: r.text("GSTAPPLICABLE"),
      baseUnit: r.text("BASEUNITS"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "STOCKGROUP",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("PARENT", item.parent)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const stockCategoryCodec: TallyCodec<StockCategory> = {
  xmlTag: "STOCKCATEGORY",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      parent: r.text("PARENT") ?? "",
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "STOCKCATEGORY",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("PARENT", item.parent)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const godownCodec: TallyCodec<Godown> = {
  xmlTag: "GODOWN",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      parent: r.text("PARENT") ?? "",
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "GODOWN",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("PARENT", item.parent)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const voucherTypeCodec: TallyCodec<VoucherType> = {
  xmlTag: "VOUCHERTYPE",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      parent: r.text("PARENT") ?? "",
      numberingMethod: r.text("NUMBERINGMETHOD"),
      useZeroEntries: r.boolean("USEZEROENTRIES"),
      isActive: r.boolean("ISACTIVE"),
      printAfterSave: r.boolean("PRINTAFTERSAVE"),
      useforPOSInvoice: r.boolean("USEFORPOSINVOICE"),
      vchPrintBankName: r.text("VCHPRINTBANKNAME"),
      vchPrintTitle: r.text("VCHPRINTTITLE"),
      taxUnitName: r.text("TAXUNITNAME"),
      vchPrintJurisdiction: r.text("VCHPRINTJURISDICTION"),
      isOptional: r.boolean("ISOPTIONAL"),
      commonNarration: r.boolean("COMMONNARRATION"),
      multiNarration: r.boolean("MULTINARRATION"),
      isDefaultAllocationEnabled: r.boolean("ISDEFAULTALLOCENABLED"),
      effectStock: r.boolean("AFFECTSSTOCK"),
      asMfgJrnl: r.boolean("ASMFGJRNL"),
      useforJobwork: r.boolean("USEFORJOBWORK"),
      isforJobworkIn: r.boolean("ISFORJOBWORKIN"),
      defaultVoucherCategory: r.text("DEFAULTVOUCHERCATEGORY"),
      coreVoucherType: r.text("COREVOUCHERTYPE"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "VOUCHERTYPE",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [
        el("NAME", item.name),
        el("PARENT", item.parent),
        el("VCHPRINTTITLE", item.vchPrintTitle), // Fix typo </VCHPRINTTITLE>
      ].filter((c): c is XmlElement => !!c),
    };
  },
};

export const costCentreCodec: TallyCodec<CostCentre> = {
  xmlTag: "COSTCENTRE",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      category: r.text("CATEGORY"),
      parent: r.text("PARENT") ?? "",
      emailId: r.text("EMAILID"),
      showOpeningBal: r.boolean("REVENUELEDFOROPBAL"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "COSTCENTRE",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("CATEGORY", item.category), el("PARENT", item.parent)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const costCategoryCodec: TallyCodec<CostCategory> = {
  xmlTag: "COSTCATEGORY",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      allocateRevenue: r.boolean("ALLOCATEREVENUE"),
      allocateNonRevenue: r.boolean("ALLOCATENONREVENUE"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "COSTCATEGORY",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const employeeCodec: TallyCodec<Employee> = costCentreCodec;
export const employeeGroupCodec: TallyCodec<EmployeeGroup> = costCentreCodec;

export const currencyCodec: TallyCodec<Currency> = {
  xmlTag: "CURRENCY",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.text("ORIGINALNAME") ?? r.attr("NAME") ?? r.text("NAME") ?? "",
      formalName: r.text("MAILINGNAME"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "CURRENCY",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("ORIGINALNAME", item.name), el("MAILINGNAME", item.formalName)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const gstRegistrationCodec: TallyCodec<GSTRegistration> = {
  xmlTag: "TAXUNIT",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      stateName: r.text("STATENAME") ?? "",
      gstin: r.text("GSTIN"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "TAXUNIT",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("STATENAME", item.stateName), el("GSTIN", item.gstin)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const attendanceTypeCodec: TallyCodec<AttendanceType> = {
  xmlTag: "ATTENDANCE",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      parent: r.text("PARENT") ?? "",
      attendanceType: r.text("ATTENDANCETYPE"),
      unit: r.text("BASEUNITS"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "ATTENDANCE",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("PARENT", item.parent)].filter((c): c is XmlElement => !!c),
    };
  },
};

export const budgetCodec: TallyCodec<Budget> = {
  xmlTag: "BUDGET",
  parse(node) {
    const r = new TallyReader(node);
    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      parent: r.text("PARENT") ?? "",
      startingFrom: r.text("STARTINGFROM"),
      endingAt: r.text("ENDINGAT"),
      _raw: node,
    };
  },
  build(item, opts = {}) {
    return {
      name: "BUDGET",
      attributes: { NAME: item.name, ACTION: opts.action || item.action || "Create" },
      children: [el("NAME", item.name), el("PARENT", item.parent)].filter((c): c is XmlElement => !!c),
    };
  },
};
