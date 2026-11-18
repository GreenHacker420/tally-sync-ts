import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCompanyProfile, buildSalesInvoiceFor, learnVoucherBlueprint, resolveInvoiceContext, TALLY_PRIME_DIALECT as D, TaxMode, parseRawXml, asArray, QuestionCode } from "../src/index.js";
import type { RawLedger, RawMasters, LineGst, InvoiceContext } from "../src/index.js";

const G = D.reservedGroups;
const groups = [{ name: G.sales, parent: "" }, { name: G.dutiesTaxes, parent: "" }, { name: "CA", parent: "" }, { name: G.debtors, parent: "CA" }, { name: "IE", parent: "" }];
const L = (name: string, parent: string, extra: Partial<RawLedger> = {}): RawLedger => ({ name, parent, ...extra });

describe("learn from built vouchers, then build again (round trip over random companies)", () => {
  let seed = 7; const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
  const word = () => Array.from({ length: 4 + rnd(6) }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[rnd(34)]).join("");
  const slab: LineGst = { taxability: "Taxable", basisPoints: { cgst: 900, sgst: 900, igst: 1800, cess: 0 } };

  it("recovers the ledgers, godown and batch the company really uses, ignoring unused duplicates", () => {
    for (let n = 0; n < 60; n++) {
      const used = new Set<string>(); const u = (): string => { let w = word(); while (used.has(w)) w = word(); used.add(w); return w; };
      const truth = { sales: u(), cgst: u(), sgst: u(), igst: u(), roundOff: u(), godown: rnd(2) ? u() : undefined, batch: rnd(2) ? u() : undefined, state: u() };
      const ledgers: RawLedger[] = [
        L(truth.sales, G.sales, { affectsStock: true }), L(u(), G.sales, { affectsStock: true }),
        L(truth.cgst, G.dutiesTaxes, { dutyHead: "CGST" }), L(u(), G.dutiesTaxes, { dutyHead: "CGST" }),
        L(truth.sgst, G.dutiesTaxes, { dutyHead: "SGST/UTGST" }), L(u(), G.dutiesTaxes, { dutyHead: "SGST/UTGST" }),
        L(truth.igst, G.dutiesTaxes, { dutyHead: "IGST" }), L(u(), G.dutiesTaxes, { dutyHead: "IGST" }),
        L(truth.roundOff, "IE"), L(u(), "IE"), L("PARTY", G.debtors, { isBillWise: true }),
      ];
      const raw: RawMasters = { company: { name: "C", guid: "g", number: "1", state: truth.state }, groups, ledgers, voucherTypes: [], units: [], godowns: truth.godown ? [{ name: truth.godown }] : [] };
      const profile = buildCompanyProfile(raw);
      // the company's own habit: one sales ledger, one set of tax ledgers, optional godown/batch
      const seedCtx: InvoiceContext = { companyState: truth.state, ledgers: { sales: truth.sales, roundOff: truth.roundOff, tax: { mode: "COMMON", cgst: truth.cgst, sgst: truth.sgst, igst: truth.igst } }, godown: truth.godown, batch: truth.batch, provenance: {} };
      const vouchers: unknown[] = [];
      for (let i = 0; i < 40; i++) {
        const b = buildSalesInvoiceFor(seedCtx, { idempotencyKey: `k${n}-${i}`, date: "20261118", party: { name: "PARTY", isBillWise: true }, placeOfSupply: i % 10 === 9 ? "ELSEWHERE" : truth.state, lines: [{ itemName: word(), quantity: "1", unit: "U", amountPaise: 1000 + rnd(900_000), gst: slab }], taxMode: TaxMode.INCLUSIVE, roundTotalToRupee: i % 2 === 0 });
        vouchers.push(asArray((parseRawXml(`<R>${b.xml}</R>`) as any).R.VOUCHER)[0]);
      }
      const bp = learnVoucherBlueprint(vouchers);
      const r = resolveInvoiceContext(profile, bp);
      assert.ok(r.context, `n=${n} unresolved: ${JSON.stringify(r.questions)}`);
      assert.deepEqual(r.context!.ledgers.tax, { mode: "COMMON", cgst: truth.cgst, sgst: truth.sgst, igst: truth.igst }, `n=${n}`);
      assert.equal(r.context!.ledgers.sales, truth.sales);
      assert.equal(r.context!.ledgers.roundOff, truth.roundOff);
      assert.equal(r.context!.godown, truth.godown);
      assert.equal(r.context!.batch, truth.batch);
      assert.equal(r.context!.companyState, truth.state);
      // rebuilding from the learned context reproduces the same ledgers
      const again = buildSalesInvoiceFor(r.context!, { idempotencyKey: "again", date: "20261118", party: { name: "PARTY" }, placeOfSupply: truth.state, lines: [{ itemName: "I", quantity: "1", unit: "U", amountPaise: 11800, gst: slab }], taxMode: TaxMode.INCLUSIVE });
      assert.deepEqual(again.entries.map((e) => e.ledger).sort(), ["PARTY", truth.cgst, truth.sgst].sort());
    }
  });

  it("refuses to build when the company has no usable history and several candidates", () => {
    const raw: RawMasters = { company: { name: "C", guid: "g", number: "1", state: "S" }, groups, ledgers: [L("S1", G.sales, { affectsStock: true }), L("S2", G.sales, { affectsStock: true }), L("C1", G.dutiesTaxes, { dutyHead: "CGST" }), L("C2", G.dutiesTaxes, { dutyHead: "CGST" }), L("S-1", G.dutiesTaxes, { dutyHead: "SGST/UTGST" }), L("I1", G.dutiesTaxes, { dutyHead: "IGST" })], voucherTypes: [], units: [], godowns: [] };
    const r = resolveInvoiceContext(buildCompanyProfile(raw), learnVoucherBlueprint([]));
    assert.equal(r.context, undefined);
    assert.ok(r.questions.some((q) => q.code === QuestionCode.PICK_SALES_LEDGER));
    assert.ok(r.questions.some((q) => q.code === QuestionCode.TAX_LEDGER_AMBIGUOUS));
  });
});
