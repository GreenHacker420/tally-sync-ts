import { TallyReader } from "../../xml/reader.js";
import { XmlElement } from "../../xml/types.js";
import { el, boolElement, amountElement } from "../../xml/writer.js";
import { TallyCodec } from "../registry.js";
import { StockItem } from "./types.js";

export const stockItemCodec: TallyCodec<StockItem> = {
  xmlTag: "STOCKITEM",

  parse(node: Record<string, unknown>): StockItem {
    const r = new TallyReader(node);
    const known = new Set([
      "NAME", "PARENT", "CATEGORY", "BASEUNITS", "ADDITIONALUNITS",
      "GSTAPPLICABLE", "GSTTYPEOFSUPPLY", "TCSAPPLICABLE", "DESCRIPTION", "NARRATION",
      "COSTINGMETHOD", "VALUATIONMETHOD", "ISCOSTTRACKINGON", "ISCOSTCENTRESON",
      "ISBATCHWISEON", "ISPERISHABLEON", "HASMFGDATE", "INCLUSIVETAX", "DENOMINATOR",
      "CONVERSION", "BASICRATEOFEXCISE", "OPENINGBALANCE", "OPENINGRATE", "OPENINGVALUE",
      "CLOSINGBALANCE", "CLOSINGRATE", "CLOSINGVALUE", "STANDARDCOST", "STANDARDPRICE",
      "MRPRATE", "REORDERLEVEL", "MINIMUMORDERQTY", "GSTHSNNAME", "GSTHSNDESCRIPTION",
      "TAXABILITY", "INTEGRATEDTAXRATE", "CENTRALTAXRATE", "STATETAXRATE", "CESSRATE"
    ]);

    const hsnNode = r.list("HSNDETAILS.LIST")[0];
    const hsnR = hsnNode ? new TallyReader(hsnNode) : undefined;

    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      baseUnit: r.text("BASEUNITS") ?? "",
      stockGroup: r.text("PARENT"),
      stockCategory: r.text("CATEGORY"),
      additionalUnits: r.text("ADDITIONALUNITS"),
      gstApplicable: r.text("GSTAPPLICABLE"),
      gstTypeOfSupply: r.text("GSTTYPEOFSUPPLY"),
      tcsApplicable: r.text("TCSAPPLICABLE"),
      description: r.text("DESCRIPTION"),
      narration: r.text("NARRATION"),
      costingMethod: r.text("COSTINGMETHOD"),
      valuationMethod: r.text("VALUATIONMETHOD"),
      isCostTracking: r.boolean("ISCOSTTRACKINGON"),
      isCostCentresOn: r.boolean("ISCOSTCENTRESON"),
      isBatchWiseOn: r.boolean("ISBATCHWISEON"),
      maintainInBranches: r.boolean("ISBATCHWISEON"),
      isPerishableOn: r.boolean("ISPERISHABLEON"),
      useExpiryDates: r.boolean("ISPERISHABLEON"),
      hasManufacturingDate: r.boolean("HASMFGDATE"),
      trackDateOfManufacturing: r.boolean("HASMFGDATE"),
      inclusiveOfTax: r.boolean("INCLUSIVETAX"),
      denominator: r.number("DENOMINATOR"),
      conversion: r.number("CONVERSION"),
      rateOfDuty: r.text("BASICRATEOFEXCISE"),
      openingBalance: r.number("OPENINGBALANCE"),
      openingRate: r.number("OPENINGRATE"),
      openingValue: r.number("OPENINGVALUE"),
      closingBalance: r.number("CLOSINGBALANCE"),
      closingRate: r.number("CLOSINGRATE"),
      closingValue: r.number("CLOSINGVALUE"),
      standardCost: r.number("STANDARDCOST"),
      standardPrice: r.number("STANDARDPRICE"),
      mrpRate: r.number("MRPRATE"),
      reorderLevel: r.number("REORDERLEVEL"),
      minimumOrderQty: r.number("MINIMUMORDERQTY"),
      hsnCode: r.text("GSTHSNNAME") ?? hsnR?.text("HSNCODE"),
      hsnDescription: r.text("GSTHSNDESCRIPTION") ?? hsnR?.text("HSN"),
      taxability: r.text("TAXABILITY"),
      integratedTaxRate: r.number("INTEGRATEDTAXRATE"),
      centralTaxRate: r.number("CENTRALTAXRATE"),
      stateTaxRate: r.number("STATETAXRATE"),
      cessRate: r.number("CESSRATE"),
      unknown: r.collectUnknown(known),
      _raw: node,
    };
  },

  build(item: StockItem, options: any = {}): XmlElement {
    const action = options.action || item.action || "Create";
    const attrs: Record<string, string> = {
      NAME: item.name,
      ACTION: action,
    };

    const children: Array<XmlElement | string> = [];
    const add = (c?: XmlElement) => { if (c) children.push(c); };

    add(el("NAME", item.name));
    add(el("BASEUNITS", item.baseUnit));
    if (item.stockGroup) add(el("PARENT", item.stockGroup));
    if (item.stockCategory) add(el("CATEGORY", item.stockCategory));
    if (item.description) add(el("DESCRIPTION", item.description));
    add(boolElement("ISBATCHWISEON", item.isBatchWiseOn ?? item.maintainInBranches));
    add(boolElement("ISPERISHABLEON", item.isPerishableOn ?? item.useExpiryDates));
    add(boolElement("HASMFGDATE", item.hasManufacturingDate ?? item.trackDateOfManufacturing));
    add(amountElement("OPENINGBALANCE", item.openingBalance));
    add(amountElement("OPENINGRATE", item.openingRate));
    add(amountElement("OPENINGVALUE", item.openingValue));

    if (item.hsnCode) add(el("GSTHSNNAME", item.hsnCode));
    if (item.hsnDescription) add(el("GSTHSNDESCRIPTION", item.hsnDescription));
    if (item.gstApplicable) add(el("GSTAPPLICABLE", item.gstApplicable));
    if (item.gstTypeOfSupply) add(el("GSTTYPEOFSUPPLY", item.gstTypeOfSupply));

    return {
      name: "STOCKITEM",
      attributes: attrs,
      children,
    };
  },
};
