import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { monthWindows, parseVoucherIndex, diffVoucherIndex, looksRestored, TallyClient, TallyGate, FetchTallyTransport, buildExportCollectionXml } from "../src/index.js";
import { startFakeTally } from "../src/testing/fakeTally.js";

const vch = (guid: string, alter: number, date: string, extra = "") =>
  `<VOUCHER REMOTEID="r-${guid}" VCHTYPE="Sales"><GUID>${guid}</GUID><MASTERID> ${alter + 1000}</MASTERID><ALTERID> ${alter}</ALTERID><DATE>${date}</DATE>` +
  `<VOUCHERTYPENAME>&#4; Sales</VOUCHERTYPENAME><VOUCHERNUMBER>VS/${alter}</VOUCHERNUMBER><PARTYLEDGERNAME>Cash</PARTYLEDGERNAME><ISCANCELLED>No</ISCANCELLED><ISOPTIONAL>No</ISOPTIONAL>${extra}</VOUCHER>`;
const reply = (...v: string[]) => `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION>${v.join("")}</COLLECTION></DATA></BODY></ENVELOPE>`;

describe("monthWindows", () => {
  it("splits a range into calendar months, clamped at both ends", () => {
    assert.deepEqual(monthWindows("20240315", "20240510"), [
      { from: "20240315", to: "20240331" }, { from: "20240401", to: "20240430" }, { from: "20240501", to: "20240510" },
    ]);
  });
  it("handles leap-year February and year rollover", () => {
    const w = monthWindows("20240201", "20250131");
    assert.equal(w.length, 12);
    assert.deepEqual(w[0], { from: "20240201", to: "20240229" });
    assert.deepEqual(w[11], { from: "20250101", to: "20250131" });
  });
  it("a single day is one window", () => assert.deepEqual(monthWindows("20260101", "20260101"), [{ from: "20260101", to: "20260101" }]));
});

describe("parseVoucherIndex", () => {
  it("reads identity, flags and strips Tally's control characters", () => {
    const rows = parseVoucherIndex(reply(vch("g1", 10, "20260105"), vch("g2", 11, "20260106", "<ISDELETED>Yes</ISDELETED>")));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { guid: "g1", masterId: 1010, alterId: 10, date: "20260105", voucherType: "Sales", voucherNumber: "VS/10", partyLedgerName: "Cash", isCancelled: false, isOptional: false, isDeleted: false });
    assert.equal(rows[1].isDeleted, true);
  });
  it("skips rows it could not track (no GUID or AlterID) and handles an empty month", () => {
    assert.equal(parseVoucherIndex(reply("<VOUCHER><DATE>20260101</DATE></VOUCHER>")).length, 0);
    assert.equal(parseVoucherIndex(`<ENVELOPE><BODY><DATA><COLLECTION/></DATA></BODY></ENVELOPE>`).length, 0);
  });
});

describe("diffVoucherIndex", () => {
  const rows = parseVoucherIndex(reply(vch("a", 1, "20260105"), vch("b", 22, "20260106"), vch("n", 5, "20260107")));
  const known = new Map([["a", { alterId: 1, date: "20260105" }], ["b", { alterId: 2, date: "20260106" }], ["gone", { alterId: 3, date: "20260108" }], ["other-month", { alterId: 4, date: "20250601" }]]);

  it("finds added, changed (AlterID moved), missing and unchanged", () => {
    const d = diffVoucherIndex(known, rows);
    assert.deepEqual(d.added.map((r) => r.guid), ["n"]);
    assert.deepEqual(d.changed.map((r) => r.guid), ["b"]);
    assert.equal(d.unchanged, 1);
    assert.deepEqual(d.missing.sort(), ["gone", "other-month"]);
  });

  it("a partial scan never reports unscanned months as deleted", () => {
    const d = diffVoucherIndex(known, rows, [{ from: "20260101", to: "20260131" }]);
    assert.deepEqual(d.missing, ["gone"]);
  });

  it("detects a restored backup when the AlterID counter goes backwards", () => {
    assert.equal(looksRestored(9642, 9000), true);
    assert.equal(looksRestored(9642, 9642), false);
    assert.equal(looksRestored(9642, 9700), false);
  });
});

describe("TallyClient.getVoucherIndex (month-chunked, gated, over HTTP)", () => {
  it("requests one window per month with explicit SVFROMDATE/SVTODATE and concatenates the rows", async () => {
    const fake = await startFakeTally([
      { when: (x) => x.includes("20260101") && x.includes("20260131"), reply: reply(vch("j1", 1, "20260102")) },
      { when: (x) => x.includes("20260201") && x.includes("20260228"), reply: reply(vch("f1", 2, "20260203"), vch("f2", 3, "20260204")) },
    ]);
    try {
      const gate = new TallyGate(new FetchTallyTransport({ baseURL: "http://127.0.0.1", port: fake.port }), { timeoutMs: 3000 });
      const client = new TallyClient({ transport: gate });
      const seen: string[] = [];
      const rows = await client.getVoucherIndex("20260101", "20260228", { onWindow: (w, n) => seen.push(`${w.from}:${n}`) });
      assert.deepEqual(rows.map((r) => r.guid), ["j1", "f1", "f2"]);
      assert.deepEqual(seen, ["20260101:1", "20260201:2"]);
      assert.equal(fake.requests.length, 2);
      assert.match(fake.requests[0], /<SVFROMDATE TYPE="Date">20260101<\/SVFROMDATE>/);
      assert.match(fake.requests[0], /<FETCH>GUID<\/FETCH>/);
    } finally { await fake.close(); }
  });

  it("emits Include Deleted only when asked", () => {
    assert.doesNotMatch(buildExportCollectionXml("Voucher", { fetchList: ["GUID"] }), /INCLUDEDELETED/);
    assert.match(buildExportCollectionXml("Voucher", { fetchList: ["GUID"], includeDeleted: true }), /<INCLUDEDELETED>Yes<\/INCLUDEDELETED>/);
  });
});
