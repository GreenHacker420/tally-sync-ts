import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRawXml, asArray } from "../src/xmlParser.js";
import { learnVoucherBlueprint, dominantLineLedger, dominantGodown, roundOffUsage } from "../src/index.js";

interface Shape { party?: string; igst?: boolean; roundOff?: number; godown?: string; batch?: string; lines?: number; salesLedger?: string; bill?: boolean; number?: string }

const voucherXml = (s: Shape): string => {
  const lines = s.lines ?? 2;
  const inv = Array.from({ length: lines }, (_, i) => `
    <ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>ITEM ${i}</STOCKITEMNAME><RATE>10/PCS</RATE><AMOUNT>100</AMOUNT><BILLEDQTY> 1 PCS</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>${s.godown ? `<GODOWNNAME>${s.godown}</GODOWNNAME>` : ""}<BATCHNAME>${s.batch ?? "Any"}</BATCHNAME><AMOUNT>100</AMOUNT></BATCHALLOCATIONS.LIST>
      <ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>${s.salesLedger ?? "S1"}</LEDGERNAME><AMOUNT>100</AMOUNT></ACCOUNTINGALLOCATIONS.LIST>
    </ALLINVENTORYENTRIES.LIST>`).join("");
  const tax = s.igst ? `<LEDGERENTRIES.LIST><LEDGERNAME>T-I</LEDGERNAME><AMOUNT>18</AMOUNT></LEDGERENTRIES.LIST>`
    : `<LEDGERENTRIES.LIST><LEDGERNAME>T-C</LEDGERNAME><AMOUNT>9</AMOUNT></LEDGERENTRIES.LIST><LEDGERENTRIES.LIST><LEDGERNAME>T-S</LEDGERNAME><AMOUNT>9</AMOUNT></LEDGERENTRIES.LIST>`;
  const ro = s.roundOff !== undefined ? `<LEDGERENTRIES.LIST><LEDGERNAME>RO</LEDGERNAME><AMOUNT>${s.roundOff}</AMOUNT></LEDGERENTRIES.LIST>` : "";
  const bill = s.bill ? `<BILLALLOCATIONS.LIST><NAME>B</NAME></BILLALLOCATIONS.LIST>` : "";
  return `<VOUCHER VCHTYPE="X"><DATE>20260401</DATE>${s.number === "" ? "" : `<VOUCHERNUMBER>${s.number ?? "1"}</VOUCHERNUMBER>`}
    <LEDGERENTRIES.LIST><LEDGERNAME>${s.party ?? "P"}</LEDGERNAME><ISPARTYLEDGER>Yes</ISPARTYLEDGER><AMOUNT>-218</AMOUNT>${bill}</LEDGERENTRIES.LIST>${tax}${ro}${inv}</VOUCHER>`;
};

const load = (shapes: Shape[]): unknown[] => {
  const parsed = parseRawXml(`<ENVELOPE><BODY><DATA><COLLECTION>${shapes.map(voucherXml).join("")}</COLLECTION></DATA></BODY></ENVELOPE>`) as any;
  return asArray(parsed.ENVELOPE.BODY.DATA.COLLECTION.VOUCHER);
};

describe("learnVoucherBlueprint", () => {
  it("reports an empty sample without inventing anything", () => {
    const bp = learnVoucherBlueprint([]);
    assert.equal(bp.sampleSize, 0);
    assert.deepEqual(bp.corePaths, []);
    assert.equal(dominantLineLedger(bp, 0.9), undefined);
  });

  it("learns the core skeleton and separates optional paths", () => {
    const shapes: Shape[] = [...Array(10)].map((_, i) => ({ roundOff: i < 6 ? 1 : undefined, igst: i === 9 }));
    const bp = learnVoucherBlueprint(load(shapes));
    assert.equal(bp.sampleSize, 10);
    assert.ok(bp.corePaths.includes("DATE"));
    assert.ok(bp.corePaths.includes("LEDGERENTRIES.LIST/LEDGERNAME"));
    assert.ok(bp.corePaths.includes("ALLINVENTORYENTRIES.LIST/BATCHALLOCATIONS.LIST/BATCHNAME"));
    assert.ok(!bp.corePaths.includes("ALLINVENTORYENTRIES.LIST/BATCHALLOCATIONS.LIST/GODOWNNAME"));
    assert.ok(!bp.corePaths.includes("LEDGERENTRIES.LIST/BILLALLOCATIONS.LIST"));
  });

  it("counts ledger usage per voucher with first-position and sign", () => {
    const shapes: Shape[] = [...Array(10)].map((_, i) => ({ roundOff: i < 6 ? -1 : undefined, igst: i >= 8 }));
    const bp = learnVoucherBlueprint(load(shapes));
    const by = Object.fromEntries(bp.ledgers.map((l) => [l.name, l]));
    assert.equal(by["RO"].count, 6);
    assert.equal(by["RO"].fraction, 0.6);
    assert.equal(by["RO"].negativeCount, 6);
    assert.equal(by["T-I"].count, 2);
    assert.equal(by["T-C"].count, 8);
    assert.equal(by["P"].firstCount, 10);
    assert.equal(bp.partyFirstFraction, 1);
    const ro = roundOffUsage(bp, ["ro"]);
    assert.deepEqual(ro, { name: "RO", fraction: 0.6, negativeShare: 1 });
    assert.equal(roundOffUsage(bp, ["nothing"]), undefined);
  });

  it("finds the single line ledger and ignores a batch-only company (no godown)", () => {
    const bp = learnVoucherBlueprint(load([...Array(20)].map(() => ({ salesLedger: "SALES X", batch: "Primary Batch", lines: 3 }))));
    assert.deepEqual(dominantLineLedger(bp, 0.9), { value: "SALES X", confidence: 1, evidence: "20/20 vouchers" });
    assert.equal(dominantGodown(bp, 0.5), undefined);
    assert.equal(bp.lineGodownFraction, 0);
    assert.equal(bp.lineBatchFraction, 1);
    assert.equal(bp.batches[0].name, "Primary Batch");
  });

  it("refuses a dominant line ledger when usage is split", () => {
    const bp = learnVoucherBlueprint(load([...Array(10)].map((_, i) => ({ salesLedger: i < 6 ? "A" : "B" }))));
    assert.equal(dominantLineLedger(bp, 0.9), undefined);
    assert.equal(dominantLineLedger(bp, 0.5)?.value, "A");
  });

  it("learns a consistent godown, numbering and bill-reference habit", () => {
    const bp = learnVoucherBlueprint(load([...Array(10)].map((_, i) => ({ godown: "G1", bill: i % 2 === 0, number: i < 7 ? "9" : "" }))));
    assert.equal(dominantGodown(bp, 0.9)?.value, "G1");
    assert.equal(bp.billReferenceFraction, 0.5);
    assert.equal(bp.numberedFraction, 0.7);
  });

  it("ignores non-object samples and handles a single voucher", () => {
    const bp = learnVoucherBlueprint([null, "x", ...load([{}])]);
    assert.equal(bp.sampleSize, 1);
    assert.ok(bp.corePaths.length > 5);
  });
});
