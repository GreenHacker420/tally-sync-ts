import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseExportCollection, resolveEffectiveGst, GstResolution, UnresolvedReason, normaliseDutyHead } from "../src/index.js";
import type { StockItem } from "../src/index.js";

// Structure copied from a live TallyPrime 7.1 export (names/ids invented).
const items = parseExportCollection<StockItem>(readFileSync(new URL("./fixtures/stock-items-gst.xml", import.meta.url), "utf8"), "StockItem");
const byName = (n: string) => items.find((i) => i.name === n)!;

describe("stock item identity + GST history parsing", () => {
  it("carries guid, masterId and alterId (previously dropped)", () => {
    const i = byName("DEMO TONER 85A");
    assert.equal(i.guid, "demo-guid-0001");
    assert.equal(i.masterId, 101);
    assert.equal(i.alterId, 777);
  });

  it("parses dated GST entries with duty-head rates and the source of details", () => {
    const i = byName("DEMO TONER 85A");
    assert.equal(i.gstHistory?.length, 2);
    assert.deepEqual(i.gstHistory?.[0].rates, { cgst: 9, sgst: 9, igst: 18 });
    assert.equal(i.gstHistory?.[0].applicableFrom, "20230401");
    assert.equal(i.gstHistory?.[0].state, "Any");
    assert.equal(i.gstHistory?.[0].sourceOfDetails, "Specify Details Here");
    assert.deepEqual(i.gstHistory?.[1].rates, { cgst: 2.5, sgst: 2.5, igst: 5 });
    assert.equal(i.gstHistory?.[1].sourceOfDetails, "As per Company/Stock Group");
  });

  it("fills hsn and the CURRENT rates/taxability on the item (the mirror's empty gst_rate bug)", () => {
    const i = byName("DEMO TONER 85A");
    assert.equal(i.hsnCode, "8443");
    assert.equal(i.integratedTaxRate, 5);
    assert.equal(i.taxability, "Taxable");
    assert.equal(i.gstTypeOfSupply, "Goods");
  });

  it("strips Tally's &#4; control character from flag values", () => {
    assert.equal(byName("DEMO TONER 85A").gstApplicable, "Applicable");
    assert.equal(byName("DEMO NOT GST").gstApplicable, "Not Applicable");
  });
});

describe("resolveEffectiveGst", () => {
  const toner = () => byName("DEMO TONER 85A");

  it("picks the entry effective on the invoice date (rate history)", () => {
    const before = resolveEffectiveGst(toner(), "20250930");
    const after = resolveEffectiveGst(toner(), "20251001");
    assert.equal(before.status, GstResolution.RESOLVED);
    assert.equal(after.status, GstResolution.RESOLVED);
    if (before.status === "RESOLVED" && after.status === "RESOLVED") {
      assert.equal(before.rates.igst, 18);
      assert.deepEqual(before.basisPoints, { cgst: 900, sgst: 900, igst: 1800, cess: 0 });
      assert.equal(after.rates.igst, 5);
      assert.deepEqual(after.basisPoints, { cgst: 250, sgst: 250, igst: 500, cess: 0 });
      assert.equal(after.hsnCode, "8443");
      assert.equal(after.source, "As per Company/Stock Group");
    }
  });

  it("is UNRESOLVED (never guessed) before the first dated entry", () => {
    const r = resolveEffectiveGst(toner(), "20200101");
    assert.deepEqual(r, { status: GstResolution.UNRESOLVED, reason: UnresolvedReason.NO_ENTRY_ON_DATE });
  });

  it("is UNRESOLVED when a taxable item has no rate", () => {
    const r = resolveEffectiveGst(byName("DEMO TAXABLE NO RATE"), "20260101");
    assert.deepEqual(r, { status: GstResolution.UNRESOLVED, reason: UnresolvedReason.NO_RATE });
  });

  it("reports NOT_APPLICABLE for non-GST items", () => {
    assert.deepEqual(resolveEffectiveGst(byName("DEMO NOT GST"), "20260101"), { status: GstResolution.NOT_APPLICABLE });
  });

  it("resolves Exempt items with zero rates", () => {
    const r = resolveEffectiveGst(byName("DEMO EXEMPT"), "20260101");
    assert.equal(r.status, GstResolution.RESOLVED);
    if (r.status === "RESOLVED") { assert.equal(r.taxability, "Exempt"); assert.deepEqual(r.basisPoints, { cgst: 0, sgst: 0, igst: 0, cess: 0 }); }
  });

  it("keeps Goods vs Services and 6-digit SAC", () => {
    const r = resolveEffectiveGst(byName("DEMO SERVICE VISIT"), "20260101");
    assert.equal(r.status, GstResolution.RESOLVED);
    if (r.status === "RESOLVED") { assert.equal(r.typeOfSupply, "Services"); assert.equal(r.hsnCode, "998313"); assert.equal(r.rates.cgst, 9, "CGST derived as half of IGST when only IGST is stored"); }
  });
});

describe("normaliseDutyHead", () => {
  it("maps both export names and import names", () => {
    assert.equal(normaliseDutyHead("SGST/UTGST"), "sgst");
    assert.equal(normaliseDutyHead("Central Tax"), "cgst");
    assert.equal(normaliseDutyHead("Integrated Tax"), "igst");
    assert.equal(normaliseDutyHead("State Cess"), "stateCess");
    assert.equal(normaliseDutyHead("Whatever"), undefined);
  });
});
