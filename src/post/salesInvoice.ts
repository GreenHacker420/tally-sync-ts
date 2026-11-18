import { escapeXmlText } from "../xml/escaping.js";
import { paiseToTally, assertPaise, type Paise } from "./money.js";
import { TALLY_PRIME_DIALECT as D } from "../dialects/tally.js";
import { computeInvoiceTax, TaxMode, RoundingStrategy, type LineGst, type TaxResult } from "./tax.js";

export interface PartySnapshot {
  name: string;
  gstin?: string;
  stateName?: string;
  addressLines?: string[];
  registrationType?: "Regular" | "Unregistered" | "Consumer" | "Composition";
  /** Country of residence; the tag is omitted when unknown (discovered from the company profile, never defaulted). */
  country?: string;
  /** Only parties maintained bill-by-bill in Tally take a New Ref allocation (read it from the master catalog; in the live company 193 of 215 debtors are bill-wise). */
  isBillWise?: boolean;
}

export interface InvoiceLineInput {
  itemName: string;
  /** Decimal quantity as text, e.g. "2" or "1.5" (no floats). */
  quantity: string;
  unit: string;
  /** INCLUSIVE: customer-paid line total. EXCLUSIVE: taxable value. Positive integer paise. */
  amountPaise: Paise;
  gst: LineGst;
  hsnCode?: string;
  typeOfSupply?: "Goods" | "Services";
  godown?: string;
  batch?: string;
}

/** Common ledgers (`CGST`, `SGST`, `IGST`) or one ledger per rate (`CGST 9%`) — discovered per company, never assumed. */
export type TaxLedgerNaming =
  | { mode: "COMMON"; cgst: string; sgst: string; igst: string; cess?: string }
  | { mode: "PER_RATE"; name: (head: "cgst" | "sgst" | "igst" | "cess", basisPoints: number) => string };

export interface LedgerNames {
  sales: string;
  roundOff?: string;
  tax: TaxLedgerNaming;
}

export interface SalesInvoiceInput {
  /** Stable id of the sale (e.g. ShopControl sale id). Becomes the voucher GUID/REMOTEID so a replay never double-posts. */
  idempotencyKey: string;
  /** YYYYMMDD */
  date: string;
  /** ShopControl invoice number, stored in the voucher Reference for traceability. */
  reference?: string;
  narration?: string;
  /** Omit to let Tally number it (numbering style is "Auto Renumber" in the live company; voucher numbers are not identity). */
  voucherNumber?: string;
  /** Voucher type to post as; defaults to the dialect's reserved Sales type. */
  voucherTypeName?: string;
  party: PartySnapshot;
  placeOfSupply: string;
  /** The company's own state, read from Tally (not hardcoded). */
  companyState: string;
  lines: InvoiceLineInput[];
  taxMode: TaxMode;
  roundTotalToRupee?: boolean;
  rounding?: RoundingStrategy;
  ledgers: LedgerNames;
}

export interface VoucherEntry {
  ledger: string;
  /** Tally sign convention: debits negative (ISDEEMEDPOSITIVE Yes), credits positive. */
  amountPaise: Paise;
}

export interface BuiltSalesInvoice {
  xml: string;
  identity: { guid: string; remoteId: string };
  tax: TaxResult;
  entries: VoucherEntry[];
  interState: boolean;
}

export class UnbalancedVoucherError extends Error {
  constructor(readonly differencePaise: Paise) {
    super(`Voucher does not balance (difference ${differencePaise} paise); refusing to send it to Tally`);
    this.name = "UnbalancedVoucherError";
  }
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");
const x = escapeXmlText;
export const salesInvoiceGuid = (key: string): string => `sc-sal-${key}`;

function taxEntries(tax: TaxResult, naming: TaxLedgerNaming): VoucherEntry[] {
  const totals = new Map<string, number>();
  // The ledger name is looked up only when there is tax to book: a company need not own a ledger for a head it never charges.
  const add = (name: () => string, paise: number) => { if (paise > 0) { const n = name(); totals.set(n, (totals.get(n) ?? 0) + paise); } };
  for (const slab of tax.slabs) {
    const bp = slab.gst.basisPoints;
    if (naming.mode === "COMMON") {
      add(() => naming.cgst, slab.cgstPaise); add(() => naming.sgst, slab.sgstPaise); add(() => naming.igst, slab.igstPaise);
      add(() => { if (!naming.cess) throw new RangeError("Cess is due but no cess ledger is configured"); return naming.cess; }, slab.cessPaise);
    } else {
      add(() => naming.name("cgst", bp.cgst), slab.cgstPaise); add(() => naming.name("sgst", bp.sgst), slab.sgstPaise);
      add(() => naming.name("igst", bp.igst), slab.igstPaise); add(() => naming.name("cess", bp.cess), slab.cessPaise);
    }
  }
  return [...totals.entries()].map(([ledger, amountPaise]) => ({ ledger, amountPaise }));
}

/** Pure: validates, computes tax, checks the voucher balances, and renders the Tally voucher XML (TallyPrime 3.0+ tag set). */
export function buildSalesInvoice(input: SalesInvoiceInput): BuiltSalesInvoice {
  if (!/^\d{8}$/.test(input.date)) throw new RangeError(`date must be YYYYMMDD, got "${input.date}"`);
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(input.idempotencyKey)) throw new RangeError("idempotencyKey must be 1-64 characters of [A-Za-z0-9._:-]");
  input.lines.forEach((l, i) => assertPaise(l.amountPaise, `line ${i + 1} amount`));

  const interState = norm(input.placeOfSupply) !== norm(input.companyState);
  const tax = computeInvoiceTax(input.lines.map((l) => ({ amountPaise: l.amountPaise, gst: l.gst })), {
    taxMode: input.taxMode, interState, rounding: input.rounding, roundTotalToRupee: input.roundTotalToRupee,
  });

  const entries: VoucherEntry[] = [{ ledger: input.party.name, amountPaise: -tax.partyAmountPaise }];
  entries.push(...taxEntries(tax, input.ledgers.tax));
  if (tax.roundOffPaise !== 0) {
    if (!input.ledgers.roundOff) throw new RangeError(`This invoice needs a round-off of ${tax.roundOffPaise} paise but no round-off ledger is configured`);
    entries.push({ ledger: input.ledgers.roundOff, amountPaise: tax.roundOffPaise });
  }
  const lineCredits = tax.lines.reduce((s, l) => s + l.taxablePaise, 0);
  const net = entries.reduce((s, e) => s + e.amountPaise, 0) + lineCredits;
  if (net !== 0) throw new UnbalancedVoucherError(net);

  const guid = salesInvoiceGuid(input.idempotencyKey);
  const party = input.party;
  const gstin = party.gstin?.trim();
  const regType = party.registrationType ?? (gstin ? "Regular" : "Unregistered");

  const inventory = input.lines.map((l, i) => {
    const lt = tax.lines[i];
    const qty = `${l.quantity} ${l.unit}`;
    const rate = `${paiseToTally(Math.round(lt.taxablePaise / Number(l.quantity)))}/${l.unit}`;
    const amt = paiseToTally(lt.taxablePaise);
    const bp = l.gst.basisPoints;
    // Godown/batch are company/item facts: emitted only when the caller supplies them (from the profile or a learned blueprint).
    const batchXml = l.godown || l.batch
      ? `
        <BATCHALLOCATIONS.LIST>${l.godown ? `\n          <GODOWNNAME>${x(l.godown)}</GODOWNNAME>` : ""}${l.batch ? `\n          <BATCHNAME>${x(l.batch)}</BATCHNAME>` : ""}${l.godown ? `\n          <DESTINATIONGODOWNNAME>${x(l.godown)}</DESTINATIONGODOWNNAME>` : ""}
          <AMOUNT>${amt}</AMOUNT>
          <ACTUALQTY> ${x(qty)}</ACTUALQTY>
          <BILLEDQTY> ${x(qty)}</BILLEDQTY>
        </BATCHALLOCATIONS.LIST>`
      : "";
    const head = (name: string, v: number) => `<RATEDETAILS.LIST><GSTRATEDUTYHEAD>${name}</GSTRATEDUTYHEAD><GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE><GSTRATE>${(v / 100).toString()}</GSTRATE></RATEDETAILS.LIST>`;
    return `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${x(l.itemName)}</STOCKITEMNAME>
        <GSTOVRDNISREVCHARGEAPPL>No</GSTOVRDNISREVCHARGEAPPL>
        <GSTOVRDNTAXABILITY>${x(l.gst.taxability)}</GSTOVRDNTAXABILITY>
        <GSTOVRDNTYPEOFSUPPLY>${l.typeOfSupply ?? "Goods"}</GSTOVRDNTYPEOFSUPPLY>
        <GSTSOURCETYPE>Stock Item</GSTSOURCETYPE>
        <HSNSOURCETYPE>Stock Item</HSNSOURCETYPE>${l.hsnCode ? `\n        <GSTHSNNAME>${x(l.hsnCode)}</GSTHSNNAME>` : ""}
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <RATE>${rate}</RATE>
        <AMOUNT>${amt}</AMOUNT>
        <ACTUALQTY> ${x(qty)}</ACTUALQTY>
        <BILLEDQTY> ${x(qty)}</BILLEDQTY>
        ${head(D.importDutyHeads.cgst, bp.cgst)}${head(D.importDutyHeads.sgst, bp.sgst)}${head(D.importDutyHeads.igst, bp.igst)}
        <ACCOUNTINGALLOCATIONS.LIST>
          <LEDGERNAME>${x(input.ledgers.sales)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amt}</AMOUNT>
        </ACCOUNTINGALLOCATIONS.LIST>
${batchXml}      </ALLINVENTORYENTRIES.LIST>`;
  }).join("");

  const ledgerEntry = (e: VoucherEntry, isParty: boolean) => {
    const debit = e.amountPaise < 0;
    const bill = isParty && party.isBillWise
      ? `\n        <BILLALLOCATIONS.LIST><NAME>${x(input.reference ?? input.idempotencyKey)}</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>${paiseToTally(e.amountPaise)}</AMOUNT></BILLALLOCATIONS.LIST>`
      : "";
    return `
      <LEDGERENTRIES.LIST>
        <LEDGERNAME>${x(e.ledger)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>${isParty ? "\n        <ISPARTYLEDGER>Yes</ISPARTYLEDGER>" : ""}
        <AMOUNT>${paiseToTally(e.amountPaise)}</AMOUNT>${bill}
      </LEDGERENTRIES.LIST>`;
  };

  const addr = (party.addressLines ?? []).filter(Boolean);
  const addressXml = addr.length
    ? `\n      <ADDRESS.LIST TYPE="String">${addr.map((a) => `<ADDRESS>${x(a)}</ADDRESS>`).join("")}</ADDRESS.LIST>\n      <BASICBUYERADDRESS.LIST TYPE="String">${addr.map((a) => `<BASICBUYERADDRESS>${x(a)}</BASICBUYERADDRESS>`).join("")}</BASICBUYERADDRESS.LIST>`
    : "";

  const xml = `<VOUCHER REMOTEID="${x(guid)}" VCHTYPE="${x(input.voucherTypeName ?? D.voucherTypes.sales)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
      <GUID>${x(guid)}</GUID>
      <DATE>${input.date}</DATE>
      <EFFECTIVEDATE>${input.date}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>${x(input.voucherTypeName ?? D.voucherTypes.sales)}</VOUCHERTYPENAME>${input.voucherNumber ? `\n      <VOUCHERNUMBER>${x(input.voucherNumber)}</VOUCHERNUMBER>` : ""}${input.reference ? `\n      <REFERENCE>${x(input.reference)}</REFERENCE>` : ""}${input.narration ? `\n      <NARRATION>${x(input.narration)}</NARRATION>` : ""}
      <ISINVOICE>Yes</ISINVOICE>
      <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
      <VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
      <ISGSTOVERRIDDEN>No</ISGSTOVERRIDDEN>
      <PARTYNAME>${x(party.name)}</PARTYNAME>
      <PARTYLEDGERNAME>${x(party.name)}</PARTYLEDGERNAME>
      <BASICBUYERNAME>${x(party.name)}</BASICBUYERNAME>${gstin ? `\n      <PARTYGSTIN>${x(gstin)}</PARTYGSTIN>` : ""}
      <GSTREGISTRATIONTYPE>${regType}</GSTREGISTRATIONTYPE>${party.country ? `\n      <COUNTRYOFRESIDENCE>${x(party.country)}</COUNTRYOFRESIDENCE>` : ""}
      <STATENAME>${x(party.stateName ?? input.placeOfSupply)}</STATENAME>
      <PLACEOFSUPPLY>${x(input.placeOfSupply)}</PLACEOFSUPPLY>${addressXml}${ledgerEntry(entries[0], true)}${inventory}${entries.slice(1).map((e) => ledgerEntry(e, false)).join("")}
    </VOUCHER>`;

  return { xml, identity: { guid, remoteId: guid }, tax, entries, interState };
}

/** Wrap one or more rendered vouchers in an import envelope for the given company. */
export function wrapVoucherImport(voucherXml: string, company?: string, credentials?: { username: string; password: string }): string {
  return `<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
  <BODY>
    <DESC><STATICVARIABLES>${company ? `<SVCURRENTCOMPANY>${x(company)}</SVCURRENTCOMPANY>` : ""}${credentials ? `<SVUSERNAME>${x(credentials.username)}</SVUSERNAME><SVPASSWORD>${x(credentials.password)}</SVPASSWORD>` : ""}</STATICVARIABLES></DESC>
    <DATA><TALLYMESSAGE xmlns:UDF="TallyUDF">
    ${voucherXml}
    </TALLYMESSAGE></DATA>
  </BODY>
</ENVELOPE>`;
}
