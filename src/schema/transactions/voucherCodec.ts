import { TallyReader } from "../../xml/reader.js";
import { XmlElement } from "../../xml/types.js";
import { el, boolElement, logicalElement, amountElement } from "../../xml/writer.js";
import { formatDateForTally } from "../../xml/values.js";
import { TallyCodec } from "../registry.js";
import {
  Voucher,
  LedgerEntry,
  InventoryAllocation,
  VoucherBatchAllocation,
  BillAllocation,
  BankAllocation,
  AccountingAllocation,
  VoucherGSTRateDetail,
  VoucherPartySnapshot,
  VoucherDispatchDetails,
  VoucherGSTDetails,
  VoucherEInvoiceDetails,
  VoucherEWayBillDetails,
} from "./types.js";

const VOUCHER_KNOWN_TAGS = new Set([
  "DATE", "EFFECTIVEDATE", "GUID", "REMOTEID", "MASTERID", "ALTERID",
  "VOUCHERTYPENAME", "VOUCHERNUMBER", "VOUCHERNUMBERSERIES", "NUMBERINGSTYLE",
  "VOUCHERKEY", "VOUCHERRETAINKEY", "REUSEHOLEID", "NARRATION", "REFERENCE", "REFERENCEDATE",
  "PARTYNAME", "PARTYLEDGERNAME", "PARTYMAILINGNAME", "STATENAME", "COUNTRYOFRESIDENCE", "PLACEOFSUPPLY",
  "VCHENTRYMODE", "PERSISTEDVIEW", "OBJVIEW", "VOUCHERVIEWTYPE", "ADDRESS.LIST",
  "PARTYGSTIN", "GSTREGISTRATIONTYPE", "PARTYPINCODE", "PINCODE", "GSTREGISTRATION",
  "VCHGSTCLASS", "CMPGSTIN", "CMPGSTSTATE",
  "BASICBUYERNAME", "BUYERNAME", "BUYERPINNUMBER", "BUYERSTATENAME", "BUYERCOUNTRYNAME",
  "BUYERGSTIN", "BUYERPANNUMBER", "PANNUMBER", "INCOMETAXNUMBER", "BUYERPLACEOFSUPPLY", "BILLTOPLACE",
  "BASICBUYERADDRESS.LIST", "CONSIGNEENAME", "BASICSHIPPEDBYNAME", "CONSIGNEEMAILINGNAME",
  "CONSIGNEECOUNTRYNAME", "CONSIGNEESTATENAME", "CONSIGNEEPINNUMBER", "CONSIGNEEPINCODE",
  "CONSIGNEEGSTIN", "SHIPTOPLACE", "BASICSHIPPEDBYADDRESS.LIST",
  "DISPATCHFROMNAME", "DISPATCHFROMSTATENAME", "DISPATCHFROMPLACE", "DISPATCHFROMPINCODE",
  "DISPATCHFROMADDRESS.LIST", "BASICPURCHASEORDERNO", "ORDERNO", "BASICORDERDATE", "ORDERDATE",
  "BASICSHIPDOCUMENTNO", "BASICSHIPPEDBY", "BASICFINALDESTINATION", "BASICCARRIERNAME",
  "BILLOFLADINGNO", "BILLOFLADINGDATE", "BASICVEHICLENO", "BASICDUEDATEOFTMS", "BASICORDERTERMS",
  "IRN", "IRNACKNO", "IRNACKDATE", "IRNQRCODE", "IRNSTATUS", "IRNCANCELDATE", "IRNCANCELREASON",
  "ISINVOICE", "ISOPTIONAL", "ISDELETED", "ISDEEMEDPOSITIVE", "ASORIGINAL", "ASPAYSLIP",
  "ISDELETEDVCHRETAINED", "AMOUNT", "ROUNDOFFAMOUNT", "TOTALTAXAMOUNT", "NETAMOUNT",
  "EWAYBILLDETAILS.LIST", "LEDGERENTRIES.LIST", "ALLLEDGERENTRIES.LIST",
  "INVENTORYENTRIES.LIST", "ALLINVENTORYENTRIES.LIST"
]);

function extractAddressLines(r: TallyReader, tag: string): string[] {
  const rawList = r.list(tag);
  const lines: string[] = [];
  for (const item of rawList) {
    if (item.ADDRESS) {
      if (Array.isArray(item.ADDRESS)) {
        lines.push(...item.ADDRESS.map(a => String(a).replace(/\u0004/g, "").trim()));
      } else {
        lines.push(String(item.ADDRESS).replace(/\u0004/g, "").trim());
      }
    } else {
      const txt = r.text(tag);
      if (txt) lines.push(txt);
    }
  }
  return lines.filter(s => s.length > 0 && s !== "[object Object]");
}

export function parseBatchAllocation(node: Record<string, unknown>): VoucherBatchAllocation {
  const r = new TallyReader(node);
  const known = new Set([
    "GODOWNNAME", "BATCHNAME", "BATCHID", "ORDERNO", "TRACKINGNUMBER", "INDENTNO",
    "ACTUALQTY", "ACTUALQUANTITY", "BILLEDQTY", "BILLEDQUANTITY", "RATE", "BATCHRATE",
    "AMOUNT", "EXPIRYPERIOD", "MFDON", "BATCHDISCOUNT", "BATCHDISCOUNTAMOUNT",
    "DESTINATIONGODOWNNAME", "ORDERCLOSUREREASON", "ORDERDUEDATE"
  ]);

  return {
    godownName: r.text("GODOWNNAME") ?? "",
    batchName: r.text("BATCHNAME"),
    batchId: r.number("BATCHID"),
    orderNo: r.text("ORDERNO"),
    trackingNumber: r.text("TRACKINGNUMBER"),
    indentNo: r.text("INDENTNO"),
    actualQuantity: r.quantity("ACTUALQTY") ?? r.quantity("ACTUALQUANTITY"),
    billedQuantity: r.quantity("BILLEDQTY") ?? r.quantity("BILLEDQUANTITY"),
    rate: r.rate("RATE"),
    batchRate: r.rate("BATCHRATE"),
    amount: r.amount("AMOUNT"),
    expiryPeriod: r.text("EXPIRYPERIOD"),
    mfgDate: r.text("MFDON"),
    manufacturingDate: r.text("MFDON"),
    batchDiscount: r.number("BATCHDISCOUNT"),
    batchDiscountAmount: r.amount("BATCHDISCOUNTAMOUNT"),
    destinationGodownName: r.text("DESTINATIONGODOWNNAME"),
    orderClosureReason: r.text("ORDERCLOSUREREASON"),
    orderDueDate: r.text("ORDERDUEDATE"),
    unknown: r.collectUnknown(known),
    _raw: node,
  };
}

export function parseAccountingAllocation(node: Record<string, unknown>): AccountingAllocation {
  const r = new TallyReader(node);
  const known = new Set([
    "LEDGERNAME", "AMOUNT", "ISDEEMEDPOSITIVE", "ISPARTYLEDGER", "GSTDUTYHEAD",
    "ROUNDTYPE", "METHODTYPE", "TAXCLASSIFICATIONNAME", "ISGSTASSESSABLEVALUEOVERRIDDEN",
    "STRDISGSTAPPLICABLE"
  ]);

  return {
    ledgerName: r.text("LEDGERNAME") ?? "",
    amount: r.amount("AMOUNT") ?? 0,
    isDeemedPositive: r.boolean("ISDEEMEDPOSITIVE"),
    isPartyLedger: r.boolean("ISPARTYLEDGER"),
    gstDutyHead: r.text("GSTDUTYHEAD"),
    roundType: r.text("ROUNDTYPE"),
    methodType: r.text("METHODTYPE"),
    taxClassificationName: r.text("TAXCLASSIFICATIONNAME"),
    isGstAssessableValueOverridden: r.boolean("ISGSTASSESSABLEVALUEOVERRIDDEN"),
    strdIsGstApplicable: r.boolean("STRDISGSTAPPLICABLE"),
    unknown: r.collectUnknown(known),
  };
}

export function parseInventoryAllocation(node: Record<string, unknown>): InventoryAllocation {
  const r = new TallyReader(node);
  const known = new Set([
    "STOCKITEMNAME", "DESCRIPTION", "ACTUALQTY", "ACTUALQUANTITY", "BILLEDQTY", "BILLEDQUANTITY",
    "RATE", "AMOUNT", "ISDEEMEDPOSITIVE", "ISLASTDEEMEDPOSITIVE", "DISCOUNT", "DISCOUNTAMOUNT",
    "ADDLAMOUNT", "ADDLCOSTPERC", "GSTHSNNAME", "GSTHSNDESCRIPTION", "HSNSOURCETYPE", "HSNITEMSOURCE",
    "HSNLEDGERSOURCE", "HSNGROUPSOURCE", "HSNSTOCKGROUPSOURCE", "GSTSOURCETYPE", "GSTITEMSOURCE",
    "GSTLEDGERSOURCE", "GSTGROUPSOURCE", "GSTSTOCKGROUPSOURCE", "GSTRATEINFERAPPLICABILITY",
    "GSTHSNINFERAPPLICABILITY", "GSTOVRDNTAXABILITY", "GSTOVRDNTYPEOFSUPPLY", "GSTOVRDNSTOREDNATURE",
    "GSTOVRDNISREVCHARGEAPPL", "GSTOVRDNISTAXONMRPAPPLICABLE", "STRDCOMPUTEDASSESSABLEVALUE",
    "STRDCOMPUTEDCGST", "STRDCOMPUTEDSGST", "STRDCOMPUTEDIGST", "STRDCOMPUTEDCESS", "STRDCOMPUTEDCESSONQTY",
    "GSTASSBLVALUE", "GSTASSESSABLEVALUE", "MRPRATE", "STRDMRPASSESSABLEVALUE", "STRDMRPCOMPUTEDCGST",
    "STRDMRPCOMPUTEDSGST", "STRDMRPCOMPUTEDIGST", "STRDMRPCOMPUTEDCESS", "ISSCRAP", "ISPRIMARYITEM",
    "ISCUSTOMSCLEARANCE", "ISTRACKCOMPONENT", "ISTRACKPRODUCTION", "ISAUTONEGATE",
    "BATCHALLOCATIONS.LIST", "ACCOUNTINGALLOCATIONS.LIST", "RATEDETAILS.LIST", "GSTRATEDETAILS.LIST"
  ]);

  const actualQty = r.quantity("ACTUALQTY") ?? r.quantity("ACTUALQUANTITY");
  const billedQty = r.quantity("BILLEDQTY") ?? r.quantity("BILLEDQUANTITY");

  return {
    stockItemName: r.text("STOCKITEMNAME") ?? "",
    description: r.text("DESCRIPTION"),
    actualQuantity: actualQty,
    billedQuantity: billedQty,
    quantity: actualQty?.raw ?? billedQty?.raw ?? actualQty?.value ?? billedQty?.value ?? "",
    unit: actualQty?.unit ?? billedQty?.unit,
    rate: r.rate("RATE") ?? r.text("RATE") ?? "",
    amount: r.amount("AMOUNT") ?? 0,
    isDeemedPositive: r.boolean("ISDEEMEDPOSITIVE") ?? false,
    isLastDeemedPositive: r.boolean("ISLASTDEEMEDPOSITIVE"),
    discount: r.number("DISCOUNT"),
    discountPercent: r.number("DISCOUNT"),
    discountAmount: r.number("DISCOUNTAMOUNT"),
    additionalAmount: r.number("ADDLAMOUNT"),
    addlAmount: r.number("ADDLAMOUNT"),
    additionalCostPercent: r.number("ADDLCOSTPERC"),
    addlCostPerc: r.number("ADDLCOSTPERC"),
    hsnCode: r.text("GSTHSNNAME"),
    hsnDescription: r.text("GSTHSNDESCRIPTION"),
    hsnSourceType: r.text("HSNSOURCETYPE"),
    hsnItemSource: r.text("HSNITEMSOURCE"),
    hsnLedgerSource: r.text("HSNLEDGERSOURCE"),
    hsnGroupSource: r.text("HSNGROUPSOURCE"),
    hsnStockGroupSource: r.text("HSNSTOCKGROUPSOURCE"),
    gstSourceType: r.text("GSTSOURCETYPE"),
    gstItemSource: r.text("GSTITEMSOURCE"),
    gstLedgerSource: r.text("GSTLEDGERSOURCE"),
    gstGroupSource: r.text("GSTGROUPSOURCE"),
    gstStockGroupSource: r.text("GSTSTOCKGROUPSOURCE"),
    gstRateInferApplicability: r.text("GSTRATEINFERAPPLICABILITY"),
    hsnInferApplicability: r.text("GSTHSNINFERAPPLICABILITY"),
    gstTaxability: r.text("GSTOVRDNTAXABILITY"),
    taxability: r.text("GSTOVRDNTAXABILITY"),
    gstTypeOfSupply: r.text("GSTOVRDNTYPEOFSUPPLY"),
    typeOfSupply: r.text("GSTOVRDNTYPEOFSUPPLY"),
    gstStoredNature: r.text("GSTOVRDNSTOREDNATURE"),
    gstOverrideStoredNature: r.text("GSTOVRDNSTOREDNATURE"),
    reverseChargeApplicability: r.logical("GSTOVRDNISREVCHARGEAPPL"),
    isReverseChargeApplicable: r.boolean("GSTOVRDNISREVCHARGEAPPL"),
    taxOnMrpApplicability: r.logical("GSTOVRDNISTAXONMRPAPPLICABLE"),
    computedAssessableValue: r.number("STRDCOMPUTEDASSESSABLEVALUE"),
    computedCgst: r.number("STRDCOMPUTEDCGST"),
    computedSgst: r.number("STRDCOMPUTEDSGST"),
    computedIgst: r.number("STRDCOMPUTEDIGST"),
    computedCess: r.number("STRDCOMPUTEDCESS"),
    computedCessOnQty: r.number("STRDCOMPUTEDCESSONQTY"),
    gstAssessableValue: r.number("GSTASSBLVALUE") ?? r.number("GSTASSESSABLEVALUE"),
    mrpRate: r.number("MRPRATE"),
    mrpAssessableValue: r.number("STRDMRPASSESSABLEVALUE"),
    mrpComputedCgst: r.number("STRDMRPCOMPUTEDCGST"),
    mrpComputedSgst: r.number("STRDMRPCOMPUTEDSGST"),
    mrpComputedIgst: r.number("STRDMRPCOMPUTEDIGST"),
    mrpComputedCess: r.number("STRDMRPCOMPUTEDCESS"),
    isScrap: r.boolean("ISSCRAP"),
    isPrimaryItem: r.boolean("ISPRIMARYITEM"),
    isCustomsClearance: r.boolean("ISCUSTOMSCLEARANCE"),
    isTrackComponent: r.boolean("ISTRACKCOMPONENT"),
    isTrackProduction: r.boolean("ISTRACKPRODUCTION"),
    isAutoNegate: r.boolean("ISAUTONEGATE"),
    batchAllocations: r.list("BATCHALLOCATIONS.LIST").map(parseBatchAllocation),
    accountingAllocations: r.list("ACCOUNTINGALLOCATIONS.LIST").map(parseAccountingAllocation),
    rateDetails: r.list("RATEDETAILS.LIST").map(rd => {
      const rr = new TallyReader(rd);
      return {
        dutyHead: rr.text("GSTRATEDUTYHEAD"),
        valuationType: rr.text("GSTRATEVALUATIONTYPE"),
        rate: rr.number("GSTRATE"),
        ratePerUnit: rr.number("GSTRATEPERUNIT"),
      };
    }),
    gstRateDetails: r.list("GSTRATEDETAILS.LIST").map(rd => {
      const rr = new TallyReader(rd);
      return {
        dutyHead: rr.text("GSTRATEDUTYHEAD"),
        valuationType: rr.text("GSTRATEVALUATIONTYPE"),
        rate: rr.number("GSTRATE"),
        ratePerUnit: rr.number("GSTRATEPERUNIT"),
      };
    }),
    unknown: r.collectUnknown(known),
    _raw: node,
  };
}

export function parseLedgerEntry(node: Record<string, unknown>): LedgerEntry {
  const r = new TallyReader(node);
  const known = new Set([
    "LEDGERNAME", "AMOUNT", "ISDEEMEDPOSITIVE", "ISLASTDEEMEDPOSITIVE", "ISPARTYLEDGER",
    "STRDGSTISDUTYLEDGER", "ISSYSTEM", "LEDGERFROMITEM", "REMOVEZEROENTRIES", "NARRATION",
    "METHODTYPE", "ROUNDTYPE", "ROUNDLIMIT", "GSTCLASS", "GSTDUTYHEAD", "TAXCLASSIFICATIONNAME",
    "STATCLASSIFICATIONNAME", "RATEOFADDLVAT", "VATTAXRATE", "GSTTAXRATE", "GSTASSBLVALUE",
    "GSTASSESSABLEVALUE", "IGSTLIABILITY", "CGSTLIABILITY", "SGSTLIABILITY", "GSTCESSLIABILITY",
    "STRDCOMPUTEDASSESSABLEVALUE", "STRDCOMPUTEDIGST", "STRDCOMPUTEDCGST", "STRDCOMPUTEDSGST",
    "STRDCOMPUTEDCESS", "BILLALLOCATIONS.LIST", "BANKALLOCATIONS.LIST", "CATEGORYALLOCATIONS.LIST",
    "INVENTORYALLOCATIONS.LIST", "RATEDETAILS.LIST"
  ]);

  return {
    ledgerName: r.text("LEDGERNAME") ?? "",
    amount: r.amount("AMOUNT") ?? 0,
    isDeemedPositive: r.boolean("ISDEEMEDPOSITIVE") ?? false,
    isLastDeemedPositive: r.boolean("ISLASTDEEMEDPOSITIVE"),
    isPartyLedger: r.boolean("ISPARTYLEDGER"),
    isDutyLedger: r.boolean("STRDGSTISDUTYLEDGER"),
    isSystem: r.boolean("ISSYSTEM"),
    ledgerFromItem: r.boolean("LEDGERFROMITEM"),
    removeZeroEntries: r.boolean("REMOVEZEROENTRIES"),
    narration: r.text("NARRATION"),
    methodType: r.text("METHODTYPE"),
    roundType: r.text("ROUNDTYPE"),
    roundLimit: r.number("ROUNDLIMIT"),
    gstClass: r.text("GSTCLASS"),
    gstDutyHead: r.text("GSTDUTYHEAD"),
    taxClassificationName: r.text("TAXCLASSIFICATIONNAME"),
    statClassificationName: r.text("STATCLASSIFICATIONNAME"),
    rateOfTax: r.number("RATEOFADDLVAT") ?? r.number("VATTAXRATE"),
    gstTaxRate: r.number("GSTTAXRATE"),
    gstAssessableValue: r.number("GSTASSBLVALUE") ?? r.number("GSTASSESSABLEVALUE"),
    igstLiability: r.number("IGSTLIABILITY"),
    cgstLiability: r.number("CGSTLIABILITY"),
    sgstLiability: r.number("SGSTLIABILITY"),
    gstCessLiability: r.number("GSTCESSLIABILITY"),
    computedAssessableValue: r.number("STRDCOMPUTEDASSESSABLEVALUE"),
    computedIgst: r.number("STRDCOMPUTEDIGST"),
    computedCgst: r.number("STRDCOMPUTEDCGST"),
    computedSgst: r.number("STRDCOMPUTEDSGST"),
    computedCess: r.number("STRDCOMPUTEDCESS"),
    billAllocations: r.list("BILLALLOCATIONS.LIST")
      .filter(b => b.NAME !== undefined || b.BILLTYPE !== undefined || b.AMOUNT !== undefined)
      .map(b => {
        const br = new TallyReader(b);
        return {
          name: br.text("NAME") ?? "",
          billType: br.text("BILLTYPE"),
          amount: br.amount("AMOUNT") ?? 0,
          dueDate: br.text("BILLCREDITPERIOD"),
          billDate: br.text("BILLDATE"),
          billCreationDate: br.text("BILLCREATIONDATE"),
          billId: br.number("BILLID"),
          _raw: b,
        };
      }),
    bankAllocations: r.list("BANKALLOCATIONS.LIST")
      .filter(bk => bk.BANKNAME !== undefined || bk.ACCOUNTNUMBER !== undefined || bk.AMOUNT !== undefined)
      .map(bk => {
        const bkr = new TallyReader(bk);
        return {
          transactionType: bkr.text("TRANSACTIONTYPE"),
          paymentMode: bkr.text("PAYMENTMODE"),
          instrumentNumber: bkr.text("INSTRUMENTNUMBER"),
          instrumentDate: bkr.text("INSTRUMENTDATE"),
          chequeCrossComment: bkr.text("CHEQUECROSSCOMMENT"),
          bankName: bkr.text("BANKNAME"),
          accountNumber: bkr.text("ACCOUNTNUMBER"),
          ifsCode: bkr.text("IFSCODE"),
          paymentFavouring: bkr.text("PAYMENTFAVOURING"),
          payeeName: bkr.text("PAYEENAME"),
          amount: bkr.amount("AMOUNT"),
        };
      }),
    costCentreAllocations: r.list("CATEGORYALLOCATIONS.LIST").flatMap(cat => {
      const catR = new TallyReader(cat);
      const category = catR.text("CATEGORY");
      return catR.list("COSTCENTREALLOCATIONS.LIST").map(cc => {
        const ccr = new TallyReader(cc);
        return {
          category,
          name: ccr.text("NAME") ?? "",
          amount: ccr.amount("AMOUNT") ?? 0,
        };
      });
    }),
    inventoryAllocations: r.list("INVENTORYALLOCATIONS.LIST").map(parseInventoryAllocation),
    rateDetails: r.list("RATEDETAILS.LIST").map(rd => {
      const rr = new TallyReader(rd);
      return {
        dutyHead: rr.text("GSTRATEDUTYHEAD"),
        valuationType: rr.text("GSTRATEVALUATIONTYPE"),
        rate: rr.number("GSTRATE"),
        ratePerUnit: rr.number("GSTRATEPERUNIT"),
      };
    }),
    unknown: r.collectUnknown(known),
    _raw: node,
  };
}

export const voucherCodec: TallyCodec<Voucher> = {
  xmlTag: "VOUCHER",

  parse(node: Record<string, unknown>): Voucher {
    const r = new TallyReader(node);

    // Parse Buyer
    const buyerAddress = extractAddressLines(r, "BASICBUYERADDRESS.LIST");
    let buyerPAN = r.text("BUYERPANNUMBER") ?? r.text("PANNUMBER") ?? r.text("INCOMETAXNUMBER");
    const buyerGSTIN = r.text("BUYERGSTIN") ?? r.text("PARTYGSTIN");
    if (!buyerPAN && buyerGSTIN && buyerGSTIN.length === 15) {
      buyerPAN = buyerGSTIN.substring(2, 12);
    }
    const buyer: VoucherPartySnapshot = {
      name: r.text("BASICBUYERNAME") ?? r.text("BUYERNAME") ?? r.text("PARTYNAME") ?? r.text("PARTYLEDGERNAME"),
      address: buyerAddress.length ? buyerAddress : undefined,
      pinCode: r.text("BUYERPINNUMBER"),
      state: r.text("BUYERSTATENAME") ?? r.text("STATENAME"),
      country: r.text("BUYERCOUNTRYNAME") ?? r.text("COUNTRYOFRESIDENCE"),
      gstin: buyerGSTIN,
      pan: buyerPAN,
      place: r.text("BUYERPLACEOFSUPPLY") ?? r.text("BILLTOPLACE"),
    };

    // Parse Consignee
    const consigneeAddress = extractAddressLines(r, "BASICSHIPPEDBYADDRESS.LIST");
    const consignee: VoucherPartySnapshot = {
      name: r.text("CONSIGNEENAME") ?? r.text("BASICSHIPPEDBYNAME"),
      mailingName: r.text("CONSIGNEEMAILINGNAME"),
      address: consigneeAddress.length ? consigneeAddress : undefined,
      pinCode: r.text("CONSIGNEEPINNUMBER") ?? r.text("CONSIGNEEPINCODE"),
      state: r.text("CONSIGNEESTATENAME"),
      country: r.text("CONSIGNEECOUNTRYNAME"),
      gstin: r.text("CONSIGNEEGSTIN"),
      place: r.text("SHIPTOPLACE"),
    };

    // Parse Dispatch
    const dispatchFromAddress = extractAddressLines(r, "DISPATCHFROMADDRESS.LIST");
    const dispatch: VoucherDispatchDetails = {
      orderNo: r.text("BASICPURCHASEORDERNO") ?? r.text("ORDERNO"),
      orderDate: r.text("BASICORDERDATE") ?? r.text("ORDERDATE"),
      dispatchDocNo: r.text("BASICSHIPDOCUMENTNO"),
      dispatchedThrough: r.text("BASICSHIPPEDBY"),
      destination: r.text("BASICFINALDESTINATION"),
      carrierName: r.text("BASICCARRIERNAME"),
      billOfLadingNo: r.text("BILLOFLADINGNO"),
      billOfLadingDate: r.text("BILLOFLADINGDATE"),
      vehicleNo: r.text("BASICVEHICLENO"),
      termsOfPayment: r.text("BASICDUEDATEOFTMS"),
      deliveryNotes: r.text("BASICORDERTERMS"),
      dispatchFromName: r.text("DISPATCHFROMNAME"),
      dispatchFromAddress: dispatchFromAddress.length ? dispatchFromAddress : undefined,
      dispatchFromState: r.text("DISPATCHFROMSTATENAME"),
      dispatchFromPlace: r.text("DISPATCHFROMPLACE"),
      dispatchFromPincode: r.text("DISPATCHFROMPINCODE"),
      shipToPlace: r.text("SHIPTOPLACE"),
      billToPlace: r.text("BILLTOPLACE"),
    };

    // Parse GST details
    const gst: VoucherGSTDetails = {
      registrationType: r.text("GSTREGISTRATIONTYPE"),
      gstRegistration: r.text("GSTREGISTRATION"),
      partyGstin: r.text("PARTYGSTIN"),
      companyGstin: r.text("CMPGSTIN"),
      placeOfSupply: r.text("PLACEOFSUPPLY"),
      voucherGstClass: r.text("VCHGSTCLASS"),
      totalTaxAmount: r.amount("TOTALTAXAMOUNT"),
    };

    // Parse E-Invoice
    const eInvoice: VoucherEInvoiceDetails = {
      irn: r.text("IRN"),
      irnAckNo: r.text("IRNACKNO"),
      irnAckDate: r.text("IRNACKDATE"),
      irnQrCode: r.text("IRNQRCODE"),
      irnStatus: r.text("IRNSTATUS"),
      irnCancelDate: r.text("IRNCANCELDATE"),
      irnCancelReason: r.text("IRNCANCELREASON"),
    };

    // Parse E-Way Bill
    let eWayBill: VoucherEWayBillDetails | undefined;
    const ewayNode = r.list("EWAYBILLDETAILS.LIST")[0];
    if (ewayNode) {
      const er = new TallyReader(ewayNode);
      eWayBill = {
        billNumber: er.text("BILLNUMBER"),
        billDate: er.text("BILLDATE"),
        billStatus: er.text("BILLSTATUS"),
        consignorPlace: er.text("CONSIGNORPLACE"),
        consignorState: er.text("CONSIGNORSTATE"),
        consigneePlace: er.text("CONSIGNEEPLACE"),
        consigneeState: er.text("CONSIGNEESTATE"),
        transporterName: er.text("TRANSPORTERNAME"),
        transporterId: er.text("TRANSPORTERID"),
        distance: er.number("DISTANCE"),
        vehicleNumber: er.text("VEHICLENUMBER"),
        vehicleType: er.text("VEHICLETYPE"),
      };
    }

    // Parse Ledgers independently
    const ledgerEntries = r.list("LEDGERENTRIES.LIST").map(parseLedgerEntry);
    const allLedgerEntries = r.list("ALLLEDGERENTRIES.LIST").map(parseLedgerEntry);

    // Parse Inventories independently
    const allInventoryEntries = r.list("ALLINVENTORYENTRIES.LIST").map(parseInventoryAllocation);
    const inventoryEntries = r.list("INVENTORYENTRIES.LIST").map(parseInventoryAllocation);

    // Resolve Amount: header AMOUNT, or absolute sum of party ledger
    let amount = r.amount("AMOUNT");
    if (!amount) {
      const activeLedgers = allLedgerEntries.length ? allLedgerEntries : ledgerEntries;
      const party = activeLedgers.find(l => l.isPartyLedger);
      if (party) {
        const pVal = typeof party.amount === "number" ? party.amount : party.amount?.value ?? 0;
        amount = { value: Math.abs(pVal), raw: String(Math.abs(pVal)) };
      }
    }

    const partyAddress = extractAddressLines(r, "ADDRESS.LIST");

    return {
      date: r.text("DATE") ?? "",
      effectiveDate: r.text("EFFECTIVEDATE"),
      voucherType: r.text("VOUCHERTYPENAME") ?? r.attr("VCHTYPE") ?? "",
      voucherTypeName: r.text("VOUCHERTYPENAME") ?? r.attr("VCHTYPE") ?? "",
      voucherNumber: r.text("VOUCHERNUMBER"),
      voucherNumberSeries: r.text("VOUCHERNUMBERSERIES"),
      numberingStyle: r.text("NUMBERINGSTYLE"),
      masterId: r.number("MASTERID"),
      alterId: r.number("ALTERID"),
      guid: r.text("GUID"),
      remoteId: r.attr("REMOTEID") ?? r.text("REMOTEID"),
      vchKey: r.attr("VCHKEY") ?? r.text("VOUCHERKEY"),
      voucherKey: r.number("VOUCHERKEY"),
      voucherRetainKey: r.number("VOUCHERRETAINKEY"),
      reuseHoleId: r.number("REUSEHOLEID"),
      persistedView: r.text("PERSISTEDVIEW"),
      objView: r.attr("OBJVIEW") ?? r.text("OBJVIEW"),
      vchEntryMode: r.text("VCHENTRYMODE"),
      narration: r.text("NARRATION"),
      reference: r.text("REFERENCE"),
      referenceDate: r.text("REFERENCEDATE"),
      partyName: r.text("PARTYNAME") ?? r.text("PARTYLEDGERNAME"),
      partyLedgerName: r.text("PARTYLEDGERNAME"),
      partyMailingName: r.text("PARTYMAILINGNAME"),
      isDeleted: r.boolean("ISDELETED"),
      isCancelled: r.boolean("ISOPTIONAL"), // or action Cancel
      isOptional: r.boolean("ISOPTIONAL"),
      isInvoice: r.boolean("ISINVOICE"),
      asOriginal: r.boolean("ASORIGINAL"),
      asPayslip: r.boolean("ASPAYSLIP"),
      isDeemedPositive: r.boolean("ISDEEMEDPOSITIVE"),
      isDeletedVoucherRetained: r.boolean("ISDELETEDVCHRETAINED"),
      isDeletedVchRetained: r.boolean("ISDELETEDVCHRETAINED"),
      amount,
      roundOffAmount: r.number("ROUNDOFFAMOUNT"),
      totalTaxAmount: r.number("TOTALTAXAMOUNT"),
      netAmount: r.number("NETAMOUNT"),
      buyer,
      consignee,
      dispatch,
      gst,
      eInvoice,
      eWayBill,
      ewayBillDetails: eWayBill,
      ledgerEntries: ledgerEntries.length ? ledgerEntries : undefined,
      allLedgerEntries: allLedgerEntries.length ? allLedgerEntries : undefined,
      inventoryEntries: inventoryEntries.length ? inventoryEntries : undefined,
      allInventoryEntries: allInventoryEntries.length ? allInventoryEntries : undefined,
      inventoryAllocations: allInventoryEntries.length ? allInventoryEntries : (inventoryEntries.length ? inventoryEntries : undefined),
      // Flat aliases
      partyGSTIN: gst.partyGstin,
      partyGSTRegistrationType: gst.registrationType,
      placeOfSupply: gst.placeOfSupply,
      partyPincode: r.text("PARTYPINCODE") ?? r.text("PINCODE"),
      stateName: r.text("STATENAME"),
      countryOfResidence: r.text("COUNTRYOFRESIDENCE"),
      address: partyAddress.length ? partyAddress : undefined,
      buyerName: buyer.name,
      buyerAddress: buyer.address,
      buyerPinNumber: buyer.pinCode,
      buyerState: buyer.state,
      buyerCountry: buyer.country,
      buyerGSTIN: buyer.gstin,
      buyerPAN: buyer.pan,
      buyerPlace: buyer.place,
      consigneeName: consignee.name,
      consigneeMailingName: consignee.mailingName,
      consigneeAddress: consignee.address,
      consigneePinNumber: consignee.pinCode,
      consigneePincode: consignee.pinCode,
      consigneeState: consignee.state,
      consigneeCountry: consignee.country,
      consigneeGSTIN: consignee.gstin,
      consigneePlace: consignee.place,
      companyGSTIN: gst.companyGstin,
      companyState: r.text("CMPGSTSTATE"),
      dispatchFromName: dispatch.dispatchFromName,
      dispatchFromAddress: dispatch.dispatchFromAddress,
      dispatchFromState: dispatch.dispatchFromState,
      dispatchFromPlace: dispatch.dispatchFromPlace,
      dispatchFromPincode: dispatch.dispatchFromPincode,
      shipToPlace: dispatch.shipToPlace,
      billToPlace: dispatch.billToPlace,
      orderNo: dispatch.orderNo,
      orderDate: dispatch.orderDate,
      dispatchDocNo: dispatch.dispatchDocNo,
      dispatchedThrough: dispatch.dispatchedThrough,
      destination: dispatch.destination,
      carrierName: dispatch.carrierName,
      billOfLadingNo: dispatch.billOfLadingNo,
      billOfLadingDate: dispatch.billOfLadingDate,
      vehicleNo: dispatch.vehicleNo,
      termsOfPayment: dispatch.termsOfPayment,
      deliveryNotes: dispatch.deliveryNotes,
      irn: eInvoice.irn,
      irnAckNo: eInvoice.irnAckNo,
      irnAckDate: eInvoice.irnAckDate,
      irnQrCode: eInvoice.irnQrCode,
      irnStatus: eInvoice.irnStatus,
      irnCancelDate: eInvoice.irnCancelDate,
      irnCancelReason: eInvoice.irnCancelReason,
      voucherGSTClass: gst.voucherGstClass,
      gstRegistration: gst.gstRegistration,
      unknown: r.collectUnknown(VOUCHER_KNOWN_TAGS),
      _raw: node,
    };
  },

  build(vch: Voucher, options: any = {}): XmlElement {
    const action = options.action || vch.action || "Create";
    const attrs: Record<string, string> = {
      VCHTYPE: vch.voucherType,
      ACTION: action,
    };

    // Identity attributes
    if (vch.identity) {
      if (vch.identity.kind === "remote-id") {
        attrs.REMOTEID = vch.identity.remoteId;
      } else if (vch.identity.kind === "guid") {
        attrs.TAGNAME = "GUID";
        attrs.TAGVALUE = vch.identity.guid;
      } else if (vch.identity.kind === "master-id") {
        attrs.TAGNAME = "MASTER ID";
        attrs.TAGVALUE = String(vch.identity.masterId);
      }
    } else if (vch.remoteId) {
      attrs.REMOTEID = vch.remoteId;
    }

    if (vch.vchKey) attrs.VCHKEY = vch.vchKey;
    if (vch.objView) attrs.OBJVIEW = vch.objView;

    const children: Array<XmlElement | string> = [];

    // Header scalar fields
    const add = (child?: XmlElement) => {
      if (child) children.push(child);
    };

    add(el("DATE", formatDateForTally(vch.date)));
    if (vch.effectiveDate) add(el("EFFECTIVEDATE", formatDateForTally(vch.effectiveDate)));
    if (vch.guid) add(el("GUID", vch.guid));
    if (vch.remoteId) add(el("REMOTEID", vch.remoteId));
    add(el("VOUCHERTYPENAME", vch.voucherType));
    if (vch.voucherNumber) add(el("VOUCHERNUMBER", vch.voucherNumber));
    if (vch.voucherNumberSeries) add(el("VOUCHERNUMBERSERIES", vch.voucherNumberSeries));
    if (vch.numberingStyle) add(el("NUMBERINGSTYLE", vch.numberingStyle));
    if (vch.reference) add(el("REFERENCE", vch.reference));
    if (vch.referenceDate) add(el("REFERENCEDATE", formatDateForTally(vch.referenceDate)));
    if (vch.narration) add(el("NARRATION", vch.narration));
    if (vch.persistedView) add(el("PERSISTEDVIEW", vch.persistedView));
    if (vch.vchEntryMode) add(el("VCHENTRYMODE", vch.vchEntryMode));

    add(boolElement("ISINVOICE", vch.isInvoice));
    add(boolElement("ISOPTIONAL", vch.isOptional));
    add(boolElement("ISDELETED", vch.isDeleted));
    add(boolElement("ISDEEMEDPOSITIVE", vch.isDeemedPositive));
    if (action === "Cancel") add(el("ISCANCELLED", "Yes"));

    // Party & Buyer snapshots
    const partyName = vch.partyName || vch.partyLedgerName || vch.buyer?.name;
    if (partyName) {
      add(el("PARTYNAME", partyName));
      add(el("PARTYLEDGERNAME", partyName));
      add(el("BASICBUYERNAME", partyName));
    }
    const buyerPan = vch.buyer?.pan || vch.buyerPAN;
    if (buyerPan) add(el("BUYERPANNUMBER", buyerPan));
    const buyerGstin = vch.buyer?.gstin || vch.buyerGSTIN || vch.gst?.partyGstin || vch.partyGSTIN;
    if (buyerGstin) add(el("PARTYGSTIN", buyerGstin));
    const placeOfSupply = vch.buyer?.place || vch.placeOfSupply || vch.gst?.placeOfSupply;
    if (placeOfSupply) add(el("PLACEOFSUPPLY", placeOfSupply));
    const stateName = vch.buyer?.state || vch.stateName;
    if (stateName) add(el("STATENAME", stateName));
    const country = vch.buyer?.country || vch.countryOfResidence;
    if (country) add(el("COUNTRYOFRESIDENCE", country));

    // Consignee
    const consigneeName = vch.consignee?.name || vch.consigneeName;
    if (consigneeName) add(el("CONSIGNEENAME", consigneeName));
    const consigneeGstin = vch.consignee?.gstin || vch.consigneeGSTIN;
    if (consigneeGstin) add(el("CONSIGNEEGSTIN", consigneeGstin));
    const consigneeState = vch.consignee?.state || vch.consigneeState;
    if (consigneeState) add(el("CONSIGNEESTATENAME", consigneeState));

    // Inventory allocations (for Item Invoice)
    const invEntries = vch.allInventoryEntries || vch.inventoryAllocations || vch.inventoryEntries || [];
    for (const inv of invEntries) {
      const invChildren: Array<XmlElement | string> = [];
      const addInv = (c?: XmlElement) => { if (c) invChildren.push(c); };

      addInv(el("STOCKITEMNAME", inv.stockItemName));
      addInv(boolElement("ISDEEMEDPOSITIVE", inv.isDeemedPositive));
      const rateVal = typeof inv.rate === "object" ? inv.rate.raw : String(inv.rate);
      addInv(el("RATE", rateVal));
      const actQty = typeof inv.actualQuantity === "object" ? inv.actualQuantity.raw : String(inv.actualQuantity || inv.quantity);
      addInv(el("ACTUALQTY", actQty));
      const billQty = typeof inv.billedQuantity === "object" ? inv.billedQuantity.raw : String(inv.billedQuantity || inv.quantity);
      addInv(el("BILLEDQTY", billQty));
      addInv(amountElement("AMOUNT", inv.amount));

      // Batch allocations
      if (inv.batchAllocations) {
        for (const b of inv.batchAllocations) {
          const bChildren: Array<XmlElement | string> = [];
          const addB = (c?: XmlElement) => { if (c) bChildren.push(c); };
          addB(el("GODOWNNAME", b.godownName));
          addB(el("BATCHNAME", b.batchName || "Primary Batch"));
          if (b.batchId !== undefined) addB(el("BATCHID", b.batchId));
          addB(amountElement("AMOUNT", b.amount || inv.amount));
          addB(el("ACTUALQTY", typeof b.actualQuantity === "object" ? b.actualQuantity.raw : (b.actualQuantity ? String(b.actualQuantity) : actQty)));
          addB(el("BILLEDQTY", typeof b.billedQuantity === "object" ? b.billedQuantity.raw : (b.billedQuantity ? String(b.billedQuantity) : billQty)));
          addB(el("BATCHRATE", typeof b.batchRate === "object" ? b.batchRate.raw : (b.batchRate ? String(b.batchRate) : rateVal)));
          invChildren.push({ name: "BATCHALLOCATIONS.LIST", children: bChildren });
        }
      }

      // Accounting allocations
      if (inv.accountingAllocations) {
        for (const a of inv.accountingAllocations) {
          const aChildren: Array<XmlElement | string> = [];
          aChildren.push({ name: "LEDGERNAME", children: [a.ledgerName] });
          const aDeemed = a.isDeemedPositive !== undefined ? a.isDeemedPositive : inv.isDeemedPositive;
          const aBool = boolElement("ISDEEMEDPOSITIVE", aDeemed);
          if (aBool) aChildren.push(aBool);
          const aAmt = amountElement("AMOUNT", a.amount);
          if (aAmt) aChildren.push(aAmt);
          invChildren.push({ name: "ACCOUNTINGALLOCATIONS.LIST", children: aChildren });
        }
      }

      children.push({ name: "ALLINVENTORYENTRIES.LIST", children: invChildren });
    }

    // Ledger allocations (Party, GST, Rounding)
    const ledEntries = vch.ledgerEntries || vch.allLedgerEntries || [];
    for (const led of ledEntries) {
      const ledChildren: Array<XmlElement | string> = [];
      const addLed = (c?: XmlElement) => { if (c) ledChildren.push(c); };

      addLed(el("LEDGERNAME", led.ledgerName));
      addLed(boolElement("ISDEEMEDPOSITIVE", led.isDeemedPositive));
      addLed(boolElement("ISPARTYLEDGER", led.isPartyLedger));
      if (led.methodType) addLed(el("METHODTYPE", led.methodType));
      if (led.roundType) addLed(el("ROUNDTYPE", led.roundType));
      addLed(amountElement("AMOUNT", led.amount));

      // Bill allocations
      if (led.billAllocations) {
        for (const bill of led.billAllocations) {
          const billChildren: Array<XmlElement | string> = [];
          billChildren.push({ name: "NAME", children: [bill.name] });
          if (bill.billType) billChildren.push({ name: "BILLTYPE", children: [bill.billType] });
          const bAmt = amountElement("AMOUNT", bill.amount);
          if (bAmt) billChildren.push(bAmt);
          ledChildren.push({ name: "BILLALLOCATIONS.LIST", children: billChildren });
        }
      }

      children.push({ name: "LEDGERENTRIES.LIST", children: ledChildren });
    }

    return {
      name: "VOUCHER",
      attributes: attrs,
      children,
    };
  },
};
