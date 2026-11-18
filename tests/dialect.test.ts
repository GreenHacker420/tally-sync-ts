import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TALLY_PRIME_DIALECT as D, selectDialect, normaliseDutyHead, buildSalesInvoice, TaxMode, WINDOWS_FINDER_ENVIRONMENT } from "../src/index.js";
import type { SalesInvoiceInput, LineGst } from "../src/index.js";

describe("Tally dialect (protocol facts as data)", () => {
  it("maps both the export and the import spellings of every duty head", () => {
    for (const [alias, key] of [["CGST", "cgst"], ["Central Tax", "cgst"], ["SGST/UTGST", "sgst"], ["State Tax", "sgst"], ["IGST", "igst"], ["Integrated Tax", "igst"], ["Cess", "cess"], ["State Cess", "stateCess"]] as const) assert.equal(normaliseDutyHead(alias), key, alias);
    assert.equal(normaliseDutyHead("something else"), undefined);
  });
  it("discovery field lists are explicit named fields - never a wildcard (it stopped a live TallyPrime 7.1)", () => {
    for (const [type, list] of Object.entries(D.fetch)) { assert.ok(list.length > 0, type); assert.ok(!list.includes("*"), `${type} must not fetch *`); assert.ok(list.includes("Name"), type); }
  });
  it("selectDialect returns a dialect for any detected release", () => { assert.equal(selectDialect({ major: 7 }).id, D.id); assert.equal(selectDialect().id, D.id); });
  it("the finder environment is data: skip list, backup hint, default roots, log names", () => {
    assert.ok(WINDOWS_FINDER_ENVIRONMENT.skipDirs.has("windows")); assert.ok(WINDOWS_FINDER_ENVIRONMENT.backupHint.test("E:\\TallyBackup"));
    assert.ok(WINDOWS_FINDER_ENVIRONMENT.defaultRoots.some((r) => r.startsWith("{install}"))); assert.ok(WINDOWS_FINDER_ENVIRONMENT.logNames.includes("tallyerr.log"));
  });
});

const G18: LineGst = { taxability: "Taxable", basisPoints: { cgst: 900, sgst: 900, igst: 1800, cess: 0 } };
const base = (over: Partial<SalesInvoiceInput> = {}, line: Partial<SalesInvoiceInput["lines"][0]> = {}): SalesInvoiceInput => ({
  idempotencyKey: "k-1", date: "20261118", party: { name: "Cash" }, placeOfSupply: "S1", companyState: "S1", taxMode: TaxMode.EXCLUSIVE,
  lines: [{ itemName: "ITEM", quantity: "1", unit: "PCS", amountPaise: 10000, gst: G18, ...line }],
  ledgers: { sales: "L-SALES", roundOff: "L-RO", tax: { mode: "COMMON", cgst: "L-C", sgst: "L-S", igst: "L-I" } }, ...over,
});

describe("buildSalesInvoice invents nothing about the company", () => {
  it("emits NO batch/godown allocation unless the line carries one (was a hardcoded 'Main Location' / 'Primary Batch')", () => {
    const xml = buildSalesInvoice(base()).xml;
    assert.doesNotMatch(xml, /BATCHALLOCATIONS|GODOWNNAME|BATCHNAME/);
  });
  it("a batch-only company (like the real one: batch name, no godown) gets BATCHNAME and no GODOWNNAME", () => {
    const xml = buildSalesInvoice(base({}, { batch: "B-1" })).xml;
    assert.match(xml, /<BATCHNAME>B-1<\/BATCHNAME>/); assert.doesNotMatch(xml, /GODOWNNAME/);
  });
  it("godown + batch are emitted exactly as supplied", () => {
    const xml = buildSalesInvoice(base({}, { godown: "G-1", batch: "B-1" })).xml;
    assert.match(xml, /<GODOWNNAME>G-1<\/GODOWNNAME>/); assert.match(xml, /<DESTINATIONGODOWNNAME>G-1<\/DESTINATIONGODOWNNAME>/); assert.match(xml, /<BATCHNAME>B-1<\/BATCHNAME>/);
  });
  it("country is omitted unless known (was a hardcoded 'India')", () => {
    assert.doesNotMatch(buildSalesInvoice(base()).xml, /COUNTRYOFRESIDENCE/);
    assert.match(buildSalesInvoice(base({ party: { name: "P", country: "C-1" } })).xml, /<COUNTRYOFRESIDENCE>C-1<\/COUNTRYOFRESIDENCE>/);
  });
  it("voucher type comes from the dialect unless the caller names one; import duty heads come from the dialect", () => {
    const xml = buildSalesInvoice(base()).xml;
    assert.match(xml, new RegExp(`<VOUCHERTYPENAME>${D.voucherTypes.sales}</VOUCHERTYPENAME>`));
    assert.match(xml, new RegExp(`<GSTRATEDUTYHEAD>${D.importDutyHeads.cgst}</GSTRATEDUTYHEAD>`));
    assert.match(buildSalesInvoice(base({ voucherTypeName: "Retail Sales" })).xml, /<VOUCHERTYPENAME>Retail Sales<\/VOUCHERTYPENAME>/);
  });
});
