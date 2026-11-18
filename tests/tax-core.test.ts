import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeInvoiceTax, TaxMode, RoundingStrategy, paiseToTally, tallyToPaise, divRoundHalfUp } from "../src/index.js";
import type { LineGst } from "../src/index.js";

const g = (igst: number, taxability = "Taxable"): LineGst => ({ taxability, basisPoints: { cgst: igst / 2, sgst: igst / 2, igst, cess: 0 } });
const G18 = g(1800), G5 = g(500), G12 = g(1200), EXEMPT = g(0, "Exempt");

describe("money helpers", () => {
  it("formats and parses paise exactly", () => {
    assert.equal(paiseToTally(123456), "1234.56"); assert.equal(paiseToTally(-50), "-0.50"); assert.equal(paiseToTally(5), "0.05");
    assert.equal(tallyToPaise("1,234.56"), 123456); assert.equal(tallyToPaise("-0.5"), -50); assert.equal(tallyToPaise(" 18 "), 1800);
    assert.throws(() => tallyToPaise("abc"));
  });
  it("rounds half up", () => { assert.equal(divRoundHalfUp(5, 10), 1); assert.equal(divRoundHalfUp(4, 10), 0); assert.equal(divRoundHalfUp(15, 10), 2); });
});

describe("computeInvoiceTax - EXCLUSIVE", () => {
  it("₹1000 @18% intra-state = 90 CGST + 90 SGST, party 1180", () => {
    const r = computeInvoiceTax([{ amountPaise: 100000, gst: G18 }], { taxMode: TaxMode.EXCLUSIVE, interState: false });
    assert.deepEqual(r.slabs.map((s) => [s.taxablePaise, s.cgstPaise, s.sgstPaise, s.igstPaise]), [[100000, 9000, 9000, 0]]);
    assert.equal(r.partyAmountPaise, 118000); assert.equal(r.roundOffPaise, 0);
  });
  it("inter-state uses IGST only", () => {
    const r = computeInvoiceTax([{ amountPaise: 100000, gst: G18 }], { taxMode: TaxMode.EXCLUSIVE, interState: true });
    assert.deepEqual([r.slabs[0].cgstPaise, r.slabs[0].sgstPaise, r.slabs[0].igstPaise], [0, 0, 18000]);
  });
  it("mixed slabs are grouped per slab and exempt items carry no tax", () => {
    const r = computeInvoiceTax([{ amountPaise: 50000, gst: G5 }, { amountPaise: 20000, gst: G5 }, { amountPaise: 30000, gst: G12 }, { amountPaise: 10000, gst: EXEMPT }], { taxMode: TaxMode.EXCLUSIVE, interState: false });
    assert.equal(r.slabs.length, 3);
    assert.equal(r.taxablePaise, 110000);
    assert.equal(r.partyAmountPaise, 110000 + 3500 + 3600);
  });
  it("rounds the party total to a rupee and books the difference to Round Off", () => {
    const r = computeInvoiceTax([{ amountPaise: 33333, gst: G18 }], { taxMode: TaxMode.EXCLUSIVE, interState: false, roundTotalToRupee: true });
    assert.equal(r.partyAmountPaise % 100, 0);
    assert.equal(r.partyAmountPaise - r.roundOffPaise, r.computedTotalPaise);
    assert.ok(Math.abs(r.roundOffPaise) < 100);
  });
});

describe("computeInvoiceTax - INCLUSIVE", () => {
  it("the party pays exactly the sum of line totals; tax is backed out", () => {
    const r = computeInvoiceTax([{ amountPaise: 118000, gst: G18 }], { taxMode: TaxMode.INCLUSIVE, interState: false });
    assert.equal(r.partyAmountPaise, 118000);
    assert.equal(r.taxablePaise, 100000);
    assert.equal(r.roundOffPaise, 0);
  });
  it("paise left over by rounding go to Round Off, never to the party", () => {
    const r = computeInvoiceTax([{ amountPaise: 9999, gst: G18 }, { amountPaise: 12345, gst: G12 }], { taxMode: TaxMode.INCLUSIVE, interState: false });
    assert.equal(r.partyAmountPaise, 9999 + 12345);
    assert.equal(r.partyAmountPaise, r.computedTotalPaise + r.roundOffPaise);
    assert.ok(Math.abs(r.roundOffPaise) <= 2, `round off ${r.roundOffPaise}`);
  });
});

describe("computeInvoiceTax - invariants over 2,000 seeded random invoices", () => {
  let seed = 20261118;
  const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
  const slabs = [G18, G12, G5, g(2800), EXEMPT, { taxability: "Taxable", basisPoints: { cgst: 250, sgst: 250, igst: 500, cess: 100 } }];
  for (const mode of [TaxMode.EXCLUSIVE, TaxMode.INCLUSIVE]) for (const rounding of [RoundingStrategy.PER_SLAB, RoundingStrategy.PER_LINE]) {
    it(`${mode} / ${rounding}: voucher balances in integer paise, round-off stays tiny`, () => {
      for (let n = 0; n < 500; n++) {
        const lines = Array.from({ length: 1 + rnd(7) }, () => ({ amountPaise: 1 + rnd(2_000_000), gst: slabs[rnd(slabs.length)] }));
        const interState = rnd(2) === 0, toRupee = rnd(2) === 0;
        const r = computeInvoiceTax(lines, { taxMode: mode, interState, rounding, roundTotalToRupee: toRupee });
        assert.ok(Number.isSafeInteger(r.partyAmountPaise) && Number.isSafeInteger(r.roundOffPaise));
        assert.equal(r.taxablePaise + r.taxPaise + r.roundOffPaise, r.partyAmountPaise, "Σ credits must equal the party debit");
        if (mode === TaxMode.INCLUSIVE && !toRupee) assert.equal(r.partyAmountPaise, lines.reduce((s, l) => s + l.amountPaise, 0));
        assert.ok(Math.abs(r.roundOffPaise) <= (toRupee ? 50 : 0) + lines.length * 2 + 2, `round off ${r.roundOffPaise}`);
      }
    });
  }
});
