import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { learnLedgerNames, QuestionCode, LedgerRole } from "../src/index.js";
import type { CompanyProfile, VoucherBlueprint } from "../src/index.js";

const roles = (o: Partial<Record<keyof typeof LedgerRole, string[]>>) => Object.fromEntries(Object.values(LedgerRole).map((r) => [r, (o as Record<string, string[]>)[r] ?? []]));
const profile = (r: Partial<Record<keyof typeof LedgerRole, string[]>>, stock: string[] = []): CompanyProfile => ({ roles: roles(r), stockSalesLedgers: stock } as unknown as CompanyProfile);
const use = (name: string, count: number, negativeCount = 0) => ({ name, count, fraction: count / 100, firstCount: 0, negativeCount });
const bp = (ledgers: ReturnType<typeof use>[], lineLedger = "S1", n = 100): VoucherBlueprint => ({ sampleSize: n, ledgers, lineLedgers: [{ name: lineLedger, count: n, fraction: 1 }] } as unknown as VoucherBlueprint);

describe("learnLedgerNames", () => {
  const base = { SALES: ["S1"], TAX_CGST: ["CGST", "OLD CGST"], TAX_SGST: ["SGST", "OLD SGST"], TAX_IGST: ["IGST"], OTHER: ["RND", "MISC"] };

  it("prefers the tax ledger the company really posts to over an unused duplicate", () => {
    const r = learnLedgerNames(profile(base, ["S1"]), bp([use("CGST", 99), use("SGST", 99), use("RND", 60, 30)]));
    assert.deepEqual(r.ledgers, { sales: "S1", tax: { mode: "COMMON", cgst: "CGST", sgst: "SGST", igst: "IGST" }, roundOff: "RND" });
    assert.match(r.provenance["tax.cgst"], /99\/100/);
    assert.deepEqual(r.questions, []);
  });

  it("asks when usage is split between two candidates", () => {
    const r = learnLedgerNames(profile(base, ["S1"]), bp([use("CGST", 50), use("OLD CGST", 49), use("SGST", 99)]));
    assert.equal(r.ledgers, undefined);
    assert.ok(r.questions.some((q) => q.code === QuestionCode.TAX_LEDGER_AMBIGUOUS && q.candidates.includes("OLD CGST")));
  });

  it("asks when several duplicates exist and none is ever used", () => {
    const r = learnLedgerNames(profile(base, ["S1"]), bp([]));
    assert.equal(r.ledgers, undefined);
    assert.ok(r.questions.length >= 1);
  });

  it("omits round-off when the company never uses one, and asks when several compete", () => {
    assert.equal(learnLedgerNames(profile({ ...base, TAX_CGST: ["CGST"], TAX_SGST: ["SGST"] }, ["S1"]), bp([])).ledgers?.roundOff, undefined);
    const r = learnLedgerNames(profile({ ...base, TAX_CGST: ["CGST"], TAX_SGST: ["SGST"] }, ["S1"]), bp([use("RND", 40), use("MISC", 35)]));
    assert.ok(r.questions.some((q) => q.code === QuestionCode.PICK_ROUND_OFF));
  });

  it("falls back to the only stock sales ledger and surfaces unknown-head tax ledgers", () => {
    const b = { sampleSize: 0, ledgers: [], lineLedgers: [] } as unknown as VoucherBlueprint;
    const r = learnLedgerNames(profile({ SALES: ["S1"], TAX_CGST: ["C"], TAX_SGST: ["S"], TAX_IGST: ["I"], TAX_UNKNOWN: ["GST X"] }, ["S1"]), b);
    assert.equal(r.ledgers?.sales, "S1");
    assert.match(r.provenance.sales, /only stock-affecting/);
    assert.ok(r.questions.some((q) => q.code === QuestionCode.TAX_LEDGER_UNKNOWN_HEAD));
  });
});
