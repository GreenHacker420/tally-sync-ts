import { TallyReader } from "../../xml/reader.js";
import { XmlElement } from "../../xml/types.js";
import { el, boolElement, amountElement } from "../../xml/writer.js";
import { TallyCodec } from "../registry.js";
import { Ledger } from "./types.js";

export const ledgerCodec: TallyCodec<Ledger> = {
  xmlTag: "LEDGER",

  parse(node: Record<string, unknown>): Ledger {
    const r = new TallyReader(node);
    const known = new Set([
      "NAME", "PARENT", "OPENINGBALANCE", "CLOSINGBALANCE", "CURRENCYNAME",
      "TAXTYPE", "GSTTAXTYPE", "GSTAPPLICABLE", "GSTTYPE", "GSTTYPEOFSUPPLY",
      "RATEOFTAX", "APPROPRIATEFOR", "INCOMETAXNUMBER", "PANNUMBER", "COUNTRYOFRESIDENCE",
      "OLDPINCODE", "PHONENUMBER", "MOBILENUMBER", "CONTACTPERSON", "FAXNUMBER",
      "COUNTRYISDCODE", "EMAIL", "EMAILCC", "WEBSITE", "BANKACCOUNTHOLDERNAME",
      "ISBILLWISEON", "ISCOSTCENTRESON", "ISINTERESTON", "ISCOSTTRACKINGON", "AFFECTSSTOCK",
      "ISTCSAPPLICABLE", "ISTDSAPPLICABLE", "ISGSTAPPLICABLE", "CONSIDERPURCHASEFOREXPORT",
      "ISTRANSPORTER", "ISCHEQUEPRINTINGENABLED", "ISEBANKINGENABLED", "SORTPOSITION",
      "PARTYGSTIN", "STATENAME", "COUNTRYNAME", "PLACEOFSUPPLY", "GSTREGISTRATIONTYPE",
      "CREDITLIMIT", "BILLCREDITPERIOD"
    ]);

    const mailNode = r.list("LEDMAILINGDETAILS.LIST")[0];
    const mailR = mailNode ? new TallyReader(mailNode) : undefined;
    const gstRegNode = r.list("LEDGSTREGDETAILS.LIST")[0];
    const gstRegR = gstRegNode ? new TallyReader(gstRegNode) : undefined;

    let gstin = r.text("PARTYGSTIN") ?? gstRegR?.text("GSTIN");
    let stateName = r.text("STATENAME") ?? mailR?.text("STATE");
    let country = r.text("COUNTRYNAME") ?? mailR?.text("COUNTRY");
    let regType = r.text("GSTREGISTRATIONTYPE") ?? gstRegR?.text("GSTREGISTRATIONTYPE");
    let placeOfSupply = r.text("PLACEOFSUPPLY") ?? gstRegR?.text("PLACEOFSUPPLY");

    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      group: r.text("PARENT") ?? "",
      parent: r.text("PARENT"),
      openingBalance: r.amount("OPENINGBALANCE"),
      closingBalance: r.amount("CLOSINGBALANCE"),
      currency: r.text("CURRENCYNAME"),
      currencyName: r.text("CURRENCYNAME"),
      taxType: r.text("TAXTYPE"),
      gstTaxType: r.text("GSTTAXTYPE"),
      gstApplicable: r.text("GSTAPPLICABLE"),
      gstTypeOfSupply: r.text("GSTTYPEOFSUPPLY"),
      rateOfTax: r.number("RATEOFTAX"),
      appropriateFor: r.text("APPROPRIATEFOR"),
      panNumber: r.text("INCOMETAXNUMBER") ?? r.text("PANNUMBER"),
      countryOfResidence: country,
      phone: r.text("PHONENUMBER"),
      mobile: r.text("MOBILENUMBER"),
      contact: r.text("CONTACTPERSON"),
      fax: r.text("FAXNUMBER"),
      email: r.text("EMAIL"),
      emailCc: r.text("EMAILCC"),
      website: r.text("WEBSITE"),
      isBillWise: r.boolean("ISBILLWISEON"),
      isBillWiseOn: r.boolean("ISBILLWISEON"),
      isCostCentresOn: r.boolean("ISCOSTCENTRESON"),
      isInterestOn: r.boolean("ISINTERESTON"),
      isCostTrackingOn: r.boolean("ISCOSTTRACKINGON"),
      affectsStock: r.boolean("AFFECTSSTOCK"),
      isTcsApplicable: r.boolean("ISTCSAPPLICABLE"),
      isTdsApplicable: r.boolean("ISTDSAPPLICABLE"),
      isGstApplicable: r.boolean("ISGSTAPPLICABLE"),
      isTransporter: r.boolean("ISTRANSPORTER"),
      isChequePrintingEnabled: r.boolean("ISCHEQUEPRINTINGENABLED"),
      isEBankingEnabled: r.boolean("ISEBANKINGENABLED"),
      gstin,
      partyGstin: gstin,
      stateName,
      state: stateName,
      country,
      placeOfSupply,
      gstRegistrationType: regType,
      creditLimit: r.text("CREDITLIMIT"),
      creditPeriod: r.text("BILLCREDITPERIOD"),
      unknown: r.collectUnknown(known),
      _raw: node,
    };
  },

  build(led: Ledger, options: any = {}): XmlElement {
    const action = options.action || led.action || "Create";
    const attrs: Record<string, string> = {
      NAME: led.name,
      ACTION: action,
    };

    const children: Array<XmlElement | string> = [];
    const add = (c?: XmlElement) => { if (c) children.push(c); };

    add(el("NAME", led.name));
    add(el("PARENT", led.group || led.parent));
    add(boolElement("ISBILLWISEON", led.isBillWise ?? led.isBillWiseOn));
    add(boolElement("ISCOSTCENTRESON", led.isCostCentresOn));
    add(boolElement("ISINTERESTON", led.isInterestOn));
    add(amountElement("OPENINGBALANCE", led.openingBalance));

    const gstin = led.gstin || led.partyGstin;
    if (gstin) add(el("PARTYGSTIN", gstin));
    const state = led.stateName || led.state;
    if (state) add(el("STATENAME", state));
    if (led.country) add(el("COUNTRYNAME", led.country));
    if (led.gstRegistrationType) add(el("GSTREGISTRATIONTYPE", led.gstRegistrationType));
    if (led.panNumber) add(el("INCOMETAXNUMBER", led.panNumber));

    return {
      name: "LEDGER",
      attributes: attrs,
      children,
    };
  },
};
