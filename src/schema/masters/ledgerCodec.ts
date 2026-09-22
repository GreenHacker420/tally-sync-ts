import { TallyReader, asArray } from "../../xml/reader.js";
import { tallyText } from "../../xml/values.js";
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
      "OLDPINCODE", "PINCODE", "PHONENUMBER", "MOBILENUMBER", "CONTACTPERSON", "FAXNUMBER",
      "COUNTRYISDCODE", "EMAIL", "EMAILCC", "WEBSITE", "BANKACCOUNTHOLDERNAME",
      "ISBILLWISEON", "ISCOSTCENTRESON", "ISINTERESTON", "ISCOSTTRACKINGON", "AFFECTSSTOCK",
      "ISTCSAPPLICABLE", "ISTDSAPPLICABLE", "ISGSTAPPLICABLE", "CONSIDERPURCHASEFOREXPORT",
      "ISTRANSPORTER", "ISCHEQUEPRINTINGENABLED", "ISEBANKINGENABLED", "SORTPOSITION",
      "PARTYGSTIN", "STATENAME", "COUNTRYNAME", "PLACEOFSUPPLY", "GSTREGISTRATIONTYPE",
      "CREDITLIMIT", "BILLCREDITPERIOD", "ADDRESS.LIST", "LEDMAILINGDETAILS.LIST",
      "LEDGSTREGDETAILS.LIST", "CONTACTDETAILS.LIST"
    ]);

    const mailingDetails = r.list("LEDMAILINGDETAILS.LIST").map(m => {
      const mr = new TallyReader(m);
      const rawAddr = asArray(m["ADDRESS.LIST"]);
      const addrList = rawAddr
        .flatMap((a: any) => asArray(a?.ADDRESS ?? a))
        .concat(asArray(m["ADDRESS"]))
        .map(tallyText)
        .filter((x): x is string => !!x);
      return {
        applicableFrom: mr.text("APPLICABLEFROM"),
        mailingName: mr.text("MAILINGNAME"),
        address: addrList.length ? addrList : undefined,
        state: mr.text("STATE"),
        country: mr.text("COUNTRY"),
        pinCode: mr.text("PINCODE"),
      };
    });

    const mailNode = mailingDetails[0];
    const gstRegNode = r.list("LEDGSTREGDETAILS.LIST")[0];
    const gstRegR = gstRegNode ? new TallyReader(gstRegNode) : undefined;

    const rawTopAddr = asArray(node["ADDRESS.LIST"]);
    const topAddress = rawTopAddr
      .flatMap((a: any) => asArray(a?.ADDRESS ?? a))
      .concat(asArray(node["ADDRESS"]))
      .map(tallyText)
      .filter((x): x is string => !!x);
    const addressLines = topAddress.length ? topAddress : (mailNode?.address ?? []);

    const gstin = r.text("PARTYGSTIN") ?? gstRegR?.text("GSTIN");
    const stateName = r.text("STATENAME") ?? mailNode?.state;
    const country = r.text("COUNTRYNAME") ?? mailNode?.country;
    const regType = r.text("GSTREGISTRATIONTYPE") ?? gstRegR?.text("GSTREGISTRATIONTYPE");
    const placeOfSupply = r.text("PLACEOFSUPPLY") ?? gstRegR?.text("PLACEOFSUPPLY");
    const pinCode = r.text("PINCODE") ?? r.text("OLDPINCODE") ?? mailNode?.pinCode;

    return {
      name: r.attr("NAME") ?? r.text("NAME") ?? "",
      group: r.text("PARENT") ?? "",
      parent: r.text("PARENT"),
      masterId: r.number("MASTERID"),
      alterId: r.number("ALTERID"),
      gstin: gstin,
      partyGstin: gstin,
      state: stateName,
      stateName: stateName,
      country: country,
      countryOfResidence: country,
      placeOfSupply: placeOfSupply,
      gstRegistrationType: regType,
      pinCode: pinCode,
      pincode: pinCode,
      oldPinCode: pinCode,
      addressLines: addressLines.length ? addressLines : undefined,
      address: addressLines.length ? addressLines.join(", ") : undefined,
      openingBalance: r.amountVal("OPENINGBALANCE") ?? r.number("OPENINGBALANCE") ?? 0,
      closingBalance: r.amountVal("CLOSINGBALANCE") ?? r.number("CLOSINGBALANCE") ?? 0,
      currency: r.text("CURRENCYNAME"),
      currencyName: r.text("CURRENCYNAME"),
      taxType: r.text("TAXTYPE"),
      gstTaxType: r.text("GSTTAXTYPE"),
      gstApplicable: r.text("GSTAPPLICABLE"),
      gstTypeOfSupply: r.text("GSTTYPEOFSUPPLY"),
      rateOfTax: r.number("RATEOFTAX"),
      appropriateFor: r.text("APPROPRIATEFOR"),
      panNumber: r.text("INCOMETAXNUMBER") ?? r.text("PANNUMBER"),
      phone: r.text("PHONENUMBER"),
      mobile: r.text("MOBILENUMBER"),
      contact: r.text("CONTACTPERSON"),
      fax: r.text("FAXNUMBER"),
      email: r.text("EMAIL"),
      emailCc: r.text("EMAILCC"),
      website: r.text("WEBSITE"),
      mailingDetails: mailingDetails.length ? mailingDetails : undefined,
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
      creditLimit: r.text("CREDITLIMIT"),
      creditPeriod: r.text("BILLCREDITPERIOD"),
      unknown: r.collectUnknown(known),
      _raw: node,
    };
  },

  build(item: Ledger, options: any = {}): XmlElement {
    const action = options.action || item.action || "Create";
    const attrs: Record<string, string> = {
      NAME: item.name,
      ACTION: action,
    };

    const children: Array<XmlElement | string> = [];
    const add = (c?: XmlElement) => { if (c) children.push(c); };

    add(el("NAME", item.name));
    add(el("PARENT", item.group || item.parent));
    add(amountElement("OPENINGBALANCE", item.openingBalance));
    if (item.currency || item.currencyName) add(el("CURRENCYNAME", item.currency || item.currencyName));
    if (item.taxType) add(el("TAXTYPE", item.taxType));
    if (item.gstTaxType) add(el("GSTTAXTYPE", item.gstTaxType));
    if (item.rateOfTax !== undefined) add(el("RATEOFTAX", item.rateOfTax));
    if (item.panNumber) add(el("INCOMETAXNUMBER", item.panNumber));
    if (item.phone) add(el("LEDGERPHONE", item.phone));
    if (item.mobile) add(el("LEDGERMOBILE", item.mobile));
    if (item.contact) add(el("LEDGERCONTACT", item.contact));
    if (item.fax) add(el("LEDGERFAX", item.fax));
    if (item.email) add(el("EMAIL", item.email));
    if (item.emailCc) add(el("EMAILCC", item.emailCc));
    if (item.website) add(el("WEBSITE", item.website));
    if (item.creditLimit) add(el("CREDITLIMIT", item.creditLimit));
    if (item.partyGstin || item.gstin) add(el("PARTYGSTIN", item.partyGstin || item.gstin));

    add(boolElement("ISBILLWISEON", item.isBillWiseOn ?? item.isBillWise));
    add(boolElement("ISCOSTCENTRESON", item.isCostCentresOn));
    add(boolElement("ISINTERESTON", item.isInterestOn));
    add(boolElement("ISCOSTTRACKINGON", item.isCostTrackingOn));
    add(boolElement("AFFECTSSTOCK", item.affectsStock));
    add(boolElement("ISTCSAPPLICABLE", item.isTcsApplicable));
    add(boolElement("ISTDSAPPLICABLE", item.isTdsApplicable));
    add(boolElement("ISGSTAPPLICABLE", item.isGstApplicable));
    add(boolElement("ISTRANSPORTER", item.isTransporter));
    add(boolElement("ISCHEQUEPRINTINGENABLED", item.isChequePrintingEnabled));
    add(boolElement("ISEBANKINGENABLED", item.isEBankingEnabled));

    return {
      name: "LEDGER",
      attributes: attrs,
      children,
    };
  },
};
