import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSalesInvoice, postSalesInvoice, TaxMode, TallyClient, TallyGate, FetchTallyTransport, PostState, ImportErrorCode, UnbalancedVoucherError } from "../src/index.js";
import type { SalesInvoiceInput, LineGst } from "../src/index.js";
import { startFakeTally } from "../src/testing/fakeTally.js";

const G18: LineGst = { taxability: "Taxable", basisPoints: { cgst: 900, sgst: 900, igst: 1800, cess: 0 } };
const base = (over: Partial<SalesInvoiceInput> = {}): SalesInvoiceInput => ({
  idempotencyKey: "sale-001", date: "20261118", reference: "INV-0001",
  party: { name: "Cash", registrationType: "Consumer" },
  placeOfSupply: "Maharashtra", companyState: "Maharashtra",
  lines: [{ itemName: "DEMO TONER 85A", quantity: "2", unit: "PCS", amountPaise: 100000, gst: G18, hsnCode: "8443" }],
  taxMode: TaxMode.EXCLUSIVE, roundTotalToRupee: true,
  ledgers: { sales: "SALES A/C", roundOff: "ROUND OFF", tax: { mode: "COMMON", cgst: "CGST", sgst: "SGST", igst: "IGST" } },
  ...over,
});

describe("buildSalesInvoice - voucher XML", () => {
  it("renders the live company's layout: item invoice, common tax ledgers, sales ledger inside the line, Tally decimals", () => {
    const b = buildSalesInvoice(base());
    assert.equal(b.interState, false);
    assert.match(b.xml, /REMOTEID="sc-sal-sale-001"/); assert.match(b.xml, /<GUID>sc-sal-sale-001<\/GUID>/);
    assert.match(b.xml, /<VCHENTRYMODE>Item Invoice<\/VCHENTRYMODE>/); assert.match(b.xml, /<ISINVOICE>Yes<\/ISINVOICE>/);
    assert.match(b.xml, /<REFERENCE>INV-0001<\/REFERENCE>/);
    assert.doesNotMatch(b.xml, /<VOUCHERNUMBER>/, "Tally numbers it (Auto Renumber)");
    assert.match(b.xml, /<PLACEOFSUPPLY>Maharashtra<\/PLACEOFSUPPLY>/);
    assert.match(b.xml, /<LEDGERNAME>CGST<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>90.00<\/AMOUNT>/);
    assert.match(b.xml, /<LEDGERNAME>SGST<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>90.00<\/AMOUNT>/);
    assert.match(b.xml, /<ACCOUNTINGALLOCATIONS\.LIST>\s*<LEDGERNAME>SALES A\/C<\/LEDGERNAME>/);
    assert.match(b.xml, /<LEDGERNAME>Cash<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<ISPARTYLEDGER>Yes<\/ISPARTYLEDGER>\s*<AMOUNT>-1180.00<\/AMOUNT>/);
    assert.doesNotMatch(b.xml, /BILLALLOCATIONS/, "the Cash ledger is not bill-wise");
    assert.doesNotMatch(b.xml, /<LEDGERNAME>IGST/);
  });

  it("inter-state bills use IGST only", () => {
    const b = buildSalesInvoice(base({ placeOfSupply: "Gujarat" }));
    assert.equal(b.interState, true);
    assert.match(b.xml, /<LEDGERNAME>IGST<\/LEDGERNAME>\s*<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>180.00<\/AMOUNT>/);
    assert.doesNotMatch(b.xml, /<LEDGERNAME>CGST/);
  });

  it("takes a New Ref bill allocation only for bill-wise parties", () => {
    const b = buildSalesInvoice(base({ party: { name: "SHYAM COMPUTER", gstin: "27ABCDE1234F1Z5", isBillWise: true } }));
    assert.match(b.xml, /<BILLTYPE>New Ref<\/BILLTYPE>/); assert.match(b.xml, /<PARTYGSTIN>27ABCDE1234F1Z5<\/PARTYGSTIN>/); assert.match(b.xml, /<GSTREGISTRATIONTYPE>Regular<\/GSTREGISTRATIONTYPE>/);
  });

  it("books a Round Off credit or debit with the right sign", () => {
    const up = buildSalesInvoice(base({ lines: [{ itemName: "X", quantity: "1", unit: "PCS", amountPaise: 33333, gst: G18 }] }));
    const roundOff = up.entries.find((e) => e.ledger === "ROUND OFF");
    assert.ok(roundOff);
    assert.equal(up.entries.reduce((s, e) => s + e.amountPaise, 0) + up.tax.lines.reduce((s, l) => s + l.taxablePaise, 0), 0);
    assert.match(up.xml, new RegExp(`<LEDGERNAME>ROUND OFF</LEDGERNAME>\\s*<ISDEEMEDPOSITIVE>${roundOff!.amountPaise < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`));
  });

  it("per-rate tax ledgers are supported when the company uses them", () => {
    const b = buildSalesInvoice(base({ ledgers: { sales: "SALES", roundOff: "ROUND OFF", tax: { mode: "PER_RATE", name: (h, bp) => `${h.toUpperCase()} ${bp / 100}%` } } }));
    assert.match(b.xml, /<LEDGERNAME>CGST 9%<\/LEDGERNAME>/); assert.match(b.xml, /<LEDGERNAME>SGST 9%<\/LEDGERNAME>/);
  });

  it("escapes XML in names and rejects unsafe idempotency keys, bad dates and non-integer paise", () => {
    assert.match(buildSalesInvoice(base({ party: { name: "A & B <Traders>" } })).xml, /A &amp; B &lt;Traders&gt;/);
    assert.throws(() => buildSalesInvoice(base({ idempotencyKey: 'x"y' })), RangeError);
    assert.throws(() => buildSalesInvoice(base({ date: "2026-11-18" })), RangeError);
    assert.throws(() => buildSalesInvoice(base({ lines: [{ itemName: "X", quantity: "1", unit: "PCS", amountPaise: 10.5, gst: G18 }] })), RangeError);
  });

  it("never emits an unbalanced voucher", () => {
    assert.ok(UnbalancedVoucherError);
    const b = buildSalesInvoice(base({ taxMode: TaxMode.INCLUSIVE, lines: [{ itemName: "X", quantity: "3", unit: "PCS", amountPaise: 9999, gst: G18 }, { itemName: "Y", quantity: "1", unit: "PCS", amountPaise: 12345, gst: G18 }], roundTotalToRupee: false }));
    assert.equal(b.entries.reduce((s, e) => s + e.amountPaise, 0) + b.tax.lines.reduce((s, l) => s + l.taxablePaise, 0), 0);
  });
});

// ---- posting against the fake Tally -------------------------------------------------------------
const importOk = `<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><LASTVCHID>4242</LASTVCHID><LASTMID>0</LASTMID><COMBINED>0</COMBINED><IGNORED>0</IGNORED><ERRORS>0</ERRORS><CANCELLED>0</CANCELLED></RESPONSE>`;
const importErr = (text: string) => `<RESPONSE>${text ? `<LINEERROR>${text}</LINEERROR>` : "<LINEERROR/>"}<CREATED>0</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><LASTVCHID>0</LASTVCHID><LASTMID>0</LASTMID><COMBINED>0</COMBINED><IGNORED>0</IGNORED><ERRORS>1</ERRORS><CANCELLED>0</CANCELLED></RESPONSE>`;
const stored = (partyPaise: string) => `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION><VOUCHER VCHTYPE="Sales"><GUID>sc-sal-sale-001</GUID><MASTERID> 4242</MASTERID><ALTERID> 9001</ALTERID><DATE>20261118</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>VS/26-27/812</VOUCHERNUMBER>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes</ISPARTYLEDGER><AMOUNT>${partyPaise}</AMOUNT></ALLLEDGERENTRIES.LIST>
 <ALLLEDGERENTRIES.LIST><LEDGERNAME>CGST</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>90.00</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></COLLECTION></DATA></BODY></ENVELOPE>`;
const none = `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION/></DATA></BODY></ENVELOPE>`;
const isFind = (x: string) => x.includes("TC_ByGuid");
const isImport = (x: string) => x.includes("<TALLYREQUEST>Import</TALLYREQUEST>");

async function withTally<T>(rules: Parameters<typeof startFakeTally>[0], fn: (client: TallyClient, fake: Awaited<ReturnType<typeof startFakeTally>>) => Promise<T>, gateMs = 3000): Promise<T> {
  const fake = await startFakeTally(rules);
  try {
    const gate = new TallyGate(new FetchTallyTransport({ baseURL: "http://127.0.0.1", port: fake.port }), { timeoutMs: gateMs, cooldownMs: 60_000 });
    return await fn(new TallyClient({ transport: gate }), fake);
  } finally { await fake.close(); }
}

describe("postSalesInvoice", () => {
  it("CONFIRMED: checks for an existing GUID, imports, reads back and matches the party amount", async () => {
    await withTally([{ when: isFind, once: true, reply: none }, { when: isImport, reply: importOk }, { when: isFind, reply: stored("-1180.00") }], async (client, fake) => {
      const out = await postSalesInvoice(client, base());
      assert.equal(out.state, PostState.CONFIRMED);
      if (out.state === "CONFIRMED") {
        assert.equal(out.identity.masterId, 4242); assert.equal(out.identity.alterId, 9001); assert.equal(out.voucherNumber, "VS/26-27/812");
        assert.equal(out.partyAmountPaise, 118000); assert.equal(out.alreadyPosted, false);
      }
      assert.equal(fake.requests.filter(isImport).length, 1);
    });
  });

  it("is idempotent: a voucher that already exists in Tally is verified, never imported twice", async () => {
    await withTally([{ when: isFind, reply: stored("-1180.00") }, { when: isImport, reply: importOk }], async (client, fake) => {
      const out = await postSalesInvoice(client, base());
      assert.equal(out.state, PostState.CONFIRMED);
      if (out.state === "CONFIRMED") assert.equal(out.alreadyPosted, true);
      assert.equal(fake.requests.filter(isImport).length, 0, "no second import");
    });
  });

  it("MISMATCH: Tally stored a different party amount; reported, never auto-adjusted", async () => {
    await withTally([{ when: isFind, once: true, reply: none }, { when: isImport, reply: importOk }, { when: isFind, reply: stored("-1181.00") }], async (client) => {
      const out = await postSalesInvoice(client, base());
      assert.equal(out.state, PostState.MISMATCH);
      if (out.state === "MISMATCH") assert.deepEqual([out.expectedPaise, out.actualPaise, out.diffPaise], [118000, 118100, 100]);
    });
  });

  it("FAILED_PERMANENT with a typed reason for a missing ledger", async () => {
    await withTally([{ when: isFind, reply: none }, { when: isImport, reply: importErr("Ledger 'Cash' does not exist!") }], async (client) => {
      const out = await postSalesInvoice(client, base());
      assert.equal(out.state, PostState.FAILED_PERMANENT);
      if (out.state === "FAILED_PERMANENT" && out.failure.kind === "IMPORT") {
        assert.equal(out.failure.info.code, ImportErrorCode.MASTER_MISSING);
        assert.deepEqual(out.failure.info.detail, { masterKind: "Ledger", masterName: "Cash" });
      }
    });
  });

  it("FAILED_RETRYABLE when the company is not loaded in Tally", async () => {
    await withTally([{ when: isFind, reply: none }, { when: isImport, reply: importErr("Could not set 'SVCurrentCompany' to 'ACME'") }], async (client) => {
      assert.equal((await postSalesInvoice(client, base())).state, PostState.FAILED_RETRYABLE);
    });
  });

  it("explains an EMPTY LINEERROR from the Tally.imp lines written during the import (TallyPrime 3.0+)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tally-imp-")); const log = join(dir, "Tally.imp"); writeFileSync(log, "previous import noise\n");
    try {
      await withTally([{ when: isFind, reply: none }, { when: isImport, reply: (x) => { appendFileSync(log, "Voucher totals do not match! Dr: 10.00 Dr Cr: 12.00 Cr Diff: 2.00 Cr\n"); return importErr(""); } }], async (client) => {
        const out = await postSalesInvoice(client, base(), { importLogFile: log });
        assert.equal(out.state, PostState.FAILED_PERMANENT);
        if (out.state === "FAILED_PERMANENT" && out.failure.kind === "IMPORT") {
          assert.equal(out.failure.info.code, ImportErrorCode.TOTALS_MISMATCH); assert.equal(out.failure.info.source, "IMPORT_LOG");
          assert.doesNotMatch(out.failure.info.text, /previous import noise/);
        }
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("FAILED_RETRYABLE (TIMEOUT) when Tally hangs, and the next call fails fast without touching Tally", async () => {
    await withTally([{ when: () => true, reply: "", hang: true }], async (client, fake) => {
      const first = await postSalesInvoice(client, base());
      assert.equal(first.state, PostState.FAILED_RETRYABLE);
      if (first.state === "FAILED_RETRYABLE") assert.deepEqual([first.failure.kind, (first.failure as { code?: string }).code], ["TRANSPORT", "TIMEOUT"]);
      const second = await postSalesInvoice(client, base());
      assert.equal(second.state, PostState.FAILED_RETRYABLE);
      if (second.state === "FAILED_RETRYABLE") assert.equal((second.failure as { code?: string }).code, "CIRCUIT_OPEN");
      assert.equal(fake.requests.length, 1);
    }, 150);
  });

  it("fails permanently, without contacting Tally, when the input cannot be balanced", async () => {
    await withTally([], async (client, fake) => {
      await assert.rejects(postSalesInvoice(client, base({ lines: [] })), RangeError);
      assert.equal(fake.requests.length, 0);
    });
  });
});
