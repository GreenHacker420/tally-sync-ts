import { TallyReader } from "../../xml/reader.js";
import { XmlElement } from "../../xml/types.js";
import { el, boolElement } from "../../xml/writer.js";
import { TallyCodec } from "../registry.js";
import { Company } from "./types.js";

export const companyCodec: TallyCodec<Company> = {
  xmlTag: "COMPANY",

  parse(node: Record<string, unknown>): Company {
    const r = new TallyReader(node);
    const known = new Set([
      "NAME", "STARTINGFROM", "BOOKSFROM", "BOOKSBEGINNINGFROM", "FINANCIALYEARFROM",
      "BASICCOMPANYFORMALNAME", "STATENAME", "COUNTRYNAME", "PINCODE", "PHONENUMBER",
      "MOBILENO", "REMOTEFULLLISTNAME", "ADDRESS.LIST", "FAXNUMBER", "EMAIL", "WEBSITE",
      "TANUMBER", "TANREGNO", "INCOMETAXNUMBER", "PANNUMBER", "CORPORATEIDENTITYNO",
      "GSTIN", "CMPGSTIN", "PARTYGSTIN", "CURRENCYNAME", "BASECURRENCYNAME",
      "BASECURRENCYSYMBOL", "CURRENCYSYMBOL", "ISEDUCATIONALMODE", "ISINVENTORYON",
      "ISINTEGRATED", "ISBILLWISEON", "ISCOSTCENTRESON", "ISTDSON", "ISTCSON", "ISGSTON",
      "ISPAYROLLON", "ISINTERESTON"
    ]);

    const addrList = r.list("ADDRESS.LIST");
    const addressLines = addrList.flatMap(a => {
      if (a.ADDRESS) return Array.isArray(a.ADDRESS) ? a.ADDRESS.map(String) : [String(a.ADDRESS)];
      return [];
    });

    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      startingFrom: r.text("STARTINGFROM"),
      booksBeginningFrom: r.text("BOOKSFROM") ?? r.text("BOOKSBEGINNINGFROM"),
      financialYearFrom: r.text("FINANCIALYEARFROM") ?? r.text("STARTINGFROM"),
      formalName: r.text("BASICCOMPANYFORMALNAME"),
      state: r.text("STATENAME"),
      country: r.text("COUNTRYNAME"),
      pinCode: r.text("PINCODE"),
      phoneNumber: r.text("PHONENUMBER"),
      mobileNumber: r.text("MOBILENO"),
      address: r.text("REMOTEFULLLISTNAME"),
      addressLines: addressLines.length ? addressLines : undefined,
      faxNumber: r.text("FAXNUMBER"),
      email: r.text("EMAIL"),
      website: r.text("WEBSITE"),
      tanNumber: r.text("TANUMBER"),
      tanRegNumber: r.text("TANREGNO"),
      pan: r.text("INCOMETAXNUMBER"),
      panNumber: r.text("INCOMETAXNUMBER") ?? r.text("PANNUMBER"),
      cin: r.text("CORPORATEIDENTITYNO"),
      gstin: r.text("GSTIN") ?? r.text("CMPGSTIN") ?? r.text("PARTYGSTIN"),
      currency: r.text("CURRENCYNAME") ?? r.text("BASECURRENCYNAME"),
      baseCurrencySymbol: r.text("BASECURRENCYSYMBOL") ?? r.text("CURRENCYSYMBOL"),
      isEducationalMode: r.boolean("ISEDUCATIONALMODE"),
      isInventoryOn: r.boolean("ISINVENTORYON"),
      integrateAccountswithInventory: r.boolean("ISINTEGRATED"),
      isBillWiseOn: r.boolean("ISBILLWISEON"),
      isCostCentersOn: r.boolean("ISCOSTCENTRESON"),
      isTDSOn: r.boolean("ISTDSON"),
      isTCSOn: r.boolean("ISTCSON"),
      isGSTOn: r.boolean("ISGSTON"),
      isPayrollOn: r.boolean("ISPAYROLLON"),
      isInterestOn: r.boolean("ISINTERESTON"),
      unknown: r.collectUnknown(known),
      _raw: node,
    };
  },

  build(cmp: Company, options: any = {}): XmlElement {
    const action = options.action || cmp.action || "Create";
    const attrs: Record<string, string> = {
      NAME: cmp.name,
      ACTION: action,
    };
    const children: Array<XmlElement | string> = [];
    const add = (c?: XmlElement) => { if (c) children.push(c); };

    add(el("NAME", cmp.name));
    if (cmp.formalName) add(el("BASICCOMPANYFORMALNAME", cmp.formalName));
    if (cmp.state) add(el("STATENAME", cmp.state));
    if (cmp.country) add(el("COUNTRYNAME", cmp.country));
    if (cmp.gstin) add(el("GSTIN", cmp.gstin));
    if (cmp.panNumber || cmp.pan) add(el("INCOMETAXNUMBER", cmp.panNumber || cmp.pan));

    return {
      name: "COMPANY",
      attributes: attrs,
      children,
    };
  },
};
