import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CompanyContextLearner, parseRawXml, asArray, buildSalesInvoiceFor, TaxMode, resolvePolicy, TALLY_PRIME_DIALECT as D } from "../src/index.js";
import type { TallyClient, InvoiceContext } from "../src/index.js";

const G = D.reservedGroups;
const masters = (alter = 1) => ({
  Company: [{ name: "CO", guid: "g", _raw: { STATENAME: "ST" } }],
  Group: [{ name: G.sales, parent: "" }, { name: G.dutiesTaxes, parent: "" }],
  Ledger: [
    { name: "SL", parent: G.sales, guid: "l1", alterId: alter, _raw: { AFFECTSSTOCK: "Yes" } },
    { name: "C", parent: G.dutiesTaxes, guid: "l2", alterId: 1, _raw: { GSTDUTYHEAD: "CGST" } },
    { name: "S", parent: G.dutiesTaxes, guid: "l3", alterId: 1, _raw: { GSTDUTYHEAD: "SGST/UTGST" } },
    { name: "I", parent: G.dutiesTaxes, guid: "l4", alterId: 1, _raw: { GSTDUTYHEAD: "IGST" } },
  ],
  VoucherType: [], Unit: [], Godown: [],
});

const ctx: InvoiceContext = { companyState: "ST", ledgers: { sales: "SL", tax: { mode: "COMMON", cgst: "C", sgst: "S", igst: "I" } }, provenance: {} };
const oneVoucher = (i: number) => {
  const b = buildSalesInvoiceFor(ctx, { idempotencyKey: `k${i}`, date: "20261118", party: { name: "P" }, placeOfSupply: "ST", lines: [{ itemName: "X", quantity: "1", unit: "U", amountPaise: 11800, gst: { taxability: "Taxable", basisPoints: { cgst: 900, sgst: 900, igst: 1800, cess: 0 } } }], taxMode: TaxMode.INCLUSIVE });
  return asArray((parseRawXml(`<R>${b.xml}</R>`) as any).R.VOUCHER)[0] as Record<string, unknown>;
};

function stub(state: { alter: number; windows: number; vouchersPerWindow: number }) {
  return {
    getLoadedCompanies: async () => [{ name: "CO", guid: "g", number: "1" }],
    getObjects: async (type: keyof ReturnType<typeof masters>) => masters(state.alter)[type],
    getRawVoucherWindow: async () => { state.windows++; return Array.from({ length: state.vouchersPerWindow }, (_, i) => oneVoucher(i)); },
  } as unknown as TallyClient;
}

describe("CompanyContextLearner", () => {
  it("learns a context, then serves it from cache until the masters change", async () => {
    const st = { alter: 1, windows: 0, vouchersPerWindow: 50 };
    const learner = new CompanyContextLearner(stub(st), { now: () => new Date(2026, 10, 18) });
    const a = await learner.resolve();
    assert.equal(a.fromCache, false);
    assert.equal(a.context?.ledgers.sales, "SL");
    assert.equal(a.context?.companyState, "ST");
    const after = st.windows;
    assert.ok(after >= 1 && after <= 12);
    const b = await learner.resolve();
    assert.equal(b.fromCache, true);
    assert.equal(st.windows, after, "no voucher read when masters are unchanged");
    st.alter = 2; // a ledger was altered in Tally
    assert.equal((await learner.resolve()).fromCache, false);
    assert.ok(st.windows > after);
  });

  it("stops reading months as soon as the sample is large enough, honouring policy", async () => {
    const st = { alter: 1, windows: 0, vouchersPerWindow: 100 };
    const policy = resolvePolicy([{ name: "company", values: { "learn.sampleVouchers": 150 } }]);
    await new CompanyContextLearner(stub(st), { policy, now: () => new Date(2026, 10, 18) }).resolve();
    assert.equal(st.windows, 2);
  });

  it("refreshes a stale context even when the masters did not change", async () => {
    const st = { alter: 1, windows: 0, vouchersPerWindow: 50 };
    let t = new Date(2026, 10, 18);
    const learner = new CompanyContextLearner(stub(st), { now: () => t });
    await learner.resolve();
    t = new Date(2026, 10, 18, 23, 59);
    assert.equal((await learner.resolve()).fromCache, true);
    t = new Date(2026, 10, 20);
    assert.equal((await learner.resolve()).fromCache, false);
  });

  it("returns questions, not a context, when the company has no history to decide", async () => {
    const st = { alter: 1, windows: 0, vouchersPerWindow: 0 };
    const client = stub(st);
    (client as any).getObjects = async (type: string) => (type === "Ledger" ? [...masters().Ledger, { name: "SL2", parent: G.sales, guid: "l9", alterId: 1, _raw: { AFFECTSSTOCK: "Yes" } }] : (masters() as any)[type]);
    const r = await new CompanyContextLearner(client, { now: () => new Date(2026, 10, 18) }).resolve();
    assert.equal(r.context, undefined);
    assert.ok(r.questions.length > 0);
  });
});
