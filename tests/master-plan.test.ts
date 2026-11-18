import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planSalesInvoiceMasters, rootGroupOf, MissingKind, TaxMode } from "../src/index.js";
import type { MasterCatalog, SalesInvoiceInput } from "../src/index.js";

const L = (name: string, rootGroup: string, extra: Partial<{ parent: string; isBillWise: boolean; gstin: string }> = {}) => [name.toLowerCase(), { name, parent: extra.parent ?? rootGroup, rootGroup, isBillWise: !!extra.isBillWise, gstin: extra.gstin }] as const;
const catalog: MasterCatalog = {
  ledgers: new Map([L("Cash", "Cash-in-Hand"), L("SHYAM COMPUTER", "Sundry Debtors", { isBillWise: true, gstin: "27ABCDE1234F1Z5" }), L("SALES A/C", "Sales Accounts"), L("CGST", "Duties & Taxes"), L("SGST", "Duties & Taxes"), L("IGST", "Duties & Taxes"), L("ROUND OFF", "Indirect Expenses"), L("MISFILED TAX", "Sales Accounts")]),
  stockItems: new Set(["demo toner 85a"]), companyState: "Maharashtra",
};
const input = (over: Partial<SalesInvoiceInput> = {}): SalesInvoiceInput => ({
  idempotencyKey: "k1", date: "20261118", party: { name: "Cash" }, placeOfSupply: "Maharashtra", companyState: "Maharashtra", taxMode: TaxMode.EXCLUSIVE,
  lines: [{ itemName: "DEMO TONER 85A", quantity: "1", unit: "PCS", amountPaise: 10000, gst: { taxability: "Taxable", basisPoints: { cgst: 900, sgst: 900, igst: 1800, cess: 0 } } }],
  ledgers: { sales: "SALES A/C", roundOff: "ROUND OFF", tax: { mode: "COMMON", cgst: "CGST", sgst: "SGST", igst: "IGST" } }, ...over,
});

describe("planSalesInvoiceMasters (pure pre-flight)", () => {
  it("is ready when party, sales, round-off, tax ledgers and items all exist under the right groups", () => {
    const p = planSalesInvoiceMasters(input(), catalog, undefined, ["CGST", "SGST"]);
    assert.equal(p.ready, true); assert.deepEqual(p.missing, []);
  });
  it("reports a missing party, tax ledger and stock item, case-insensitively", () => {
    const p = planSalesInvoiceMasters(input({ party: { name: "NEW CUSTOMER" }, lines: [{ ...input().lines[0], itemName: "NO SUCH ITEM" }] }), catalog, undefined, ["cgst", "UTGST"]);
    assert.deepEqual(p.missing.map((m) => [m.kind, m.name]), [[MissingKind.PARTY_LEDGER, "NEW CUSTOMER"], [MissingKind.TAX_LEDGER, "UTGST"], [MissingKind.STOCK_ITEM, "NO SUCH ITEM"]]);
    assert.equal(p.ready, false);
  });
  it("flags a ledger sitting in the wrong group (a Sales ledger under Duties & Taxes would mis-post GST)", () => {
    const p = planSalesInvoiceMasters(input(), catalog, undefined, ["MISFILED TAX"]);
    assert.deepEqual(p.missing.map((m) => m.kind), [MissingKind.WRONG_GROUP]);
  });
  it("exposes whether the party is bill-wise so the builder only adds New Ref when Tally maintains bills", () => {
    assert.equal(planSalesInvoiceMasters(input({ party: { name: "SHYAM COMPUTER" } }), catalog).partyIsBillWise, true);
    assert.equal(planSalesInvoiceMasters(input(), catalog).partyIsBillWise, false);
  });
  it("warns on a GSTIN or company-state mismatch instead of silently posting", () => {
    const p = planSalesInvoiceMasters(input({ party: { name: "SHYAM COMPUTER", gstin: "27ZZZZZ9999Z1Z1" }, companyState: "Madhya Pradesh" }), catalog);
    assert.equal(p.warnings.length, 2);
  });
});

describe("rootGroupOf", () => {
  const parents = new Map([["sundry debtors", "Current Assets"], ["current assets", "Primary"]]);
  it("walks to the group directly under Primary and survives cycles", () => {
    assert.equal(rootGroupOf("Sundry Debtors", parents, new Set(["primary", ""])), "Current Assets");
    assert.equal(rootGroupOf("A", new Map([["a", "B"], ["b", "A"]]), new Set(["primary"])), "A");
  });
});
