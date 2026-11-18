/**
 * LIVE, READ-ONLY checks against a real TallyPrime. Skipped unless TALLY_LIVE_URL is set, e.g.
 *   TALLY_LIVE_URL=http://192.168.29.37:9000 npm test
 * Everything goes through TallyGate (single request, hard timeout, circuit breaker) and only standard
 * collection / function requests are sent - no custom TDL reports. Nothing is written to Tally.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { TallyClient, TallyGate, RecordingTransport, FetchTallyTransport, resolveEffectiveGst, GstResolution, diffVoucherIndex, monthWindows, loadMasterCatalog, planSalesInvoiceMasters, TaxMode } from "../../src/index.js";
import type { StockItem, VoucherIndexRow } from "../../src/index.js";

const url = process.env.TALLY_LIVE_URL;
const skip = url ? false : "set TALLY_LIVE_URL to run live read-only checks";
const today = (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`; })();

describe("live TallyPrime (read-only)", { skip }, () => {
  let client: TallyClient;
  let recorder: RecordingTransport;
  let gate: TallyGate;

  before(() => {
    const u = new URL(url!);
    recorder = new RecordingTransport(new FetchTallyTransport({ baseURL: `${u.protocol}//${u.hostname}`, port: Number(u.port || 9000), timeoutMinutes: 1 }));
    gate = new TallyGate(recorder, { timeoutMs: 60_000 });
    client = new TallyClient({ transport: gate });
  });

  it("detects the release and the loaded company without any TDL", async () => {
    const caps = await client.detectCapabilities();
    console.log("  capabilities:", JSON.stringify(caps));
    assert.equal(caps.product, "TALLYPRIME");
    assert.ok(caps.companyLoaded, "a company must be loaded in Tally");
    assert.ok((caps.release?.major ?? 0) >= 3);
    assert.equal(await client.check(), true);
  });

  it("reads stock items with identity and resolves GST for every item on today's date", async () => {
    const items: StockItem[] = await client.getStockItems();
    assert.ok(items.length > 0, "no stock items returned");
    const noIdentity = items.filter((i) => !i.guid || i.masterId === undefined || i.alterId === undefined);
    assert.equal(noIdentity.length, 0, `${noIdentity.length} items without guid/masterId/alterId`);

    const tally = { resolved: 0, notApplicable: 0, unresolved: [] as string[] };
    const slabs = new Map<number, number>();
    let withHistory = 0;
    for (const item of items) {
      if ((item.gstHistory?.length ?? 0) > 1) withHistory++;
      const r = resolveEffectiveGst(item, today);
      if (r.status === GstResolution.RESOLVED) { tally.resolved++; slabs.set(r.rates.igst ?? 0, (slabs.get(r.rates.igst ?? 0) ?? 0) + 1); }
      else if (r.status === GstResolution.NOT_APPLICABLE) tally.notApplicable++;
      else tally.unresolved.push(`${item.name} (${r.reason})`);
    }
    console.log(`  stock items: ${items.length} | resolved ${tally.resolved} | not-GST ${tally.notApplicable} | unresolved ${tally.unresolved.length} | with rate history ${withHistory}`);
    console.log("  effective IGST slabs today:", JSON.stringify([...slabs.entries()].sort((a, b) => b[1] - a[1])));
    if (tally.unresolved.length) console.log("  unresolved sample:", tally.unresolved.slice(0, 5));
    assert.ok(tally.resolved / items.length >= 0.95, "fewer than 95% of items resolved a GST rate");
  });

  it("reads a month-chunked voucher index through the gate and diffs it against an empty mirror", async () => {
    const windows = monthWindows("20260901", today);
    const rows: VoucherIndexRow[] = [];
    const timings: string[] = [];
    for (const w of windows) {
      const t0 = Date.now();
      const got = await client.getVoucherIndexWindow(w);
      timings.push(`${w.from.slice(0, 6)}:${got.length}v/${Date.now() - t0}ms`);
      rows.push(...got);
    }
    console.log("  voucher index windows:", timings.join("  "));
    assert.ok(rows.length > 0);
    assert.equal(new Set(rows.map((r) => r.guid)).size, rows.length, "duplicate GUIDs in the index");
    assert.ok(rows.every((r) => r.alterId > 0 && r.date.length === 8));
    const diff = diffVoucherIndex(new Map(), rows);
    assert.equal(diff.added.length, rows.length);
    const again = diffVoucherIndex(new Map(rows.map((r) => [r.guid, { alterId: r.alterId, date: r.date }])), rows);
    assert.equal(again.added.length + again.changed.length + again.missing.length, 0, "an unchanged Tally must diff to nothing");
    const types = new Map<string, number>(); for (const r of rows) types.set(r.voucherType, (types.get(r.voucherType) ?? 0) + 1);
    console.log("  voucher types:", JSON.stringify([...types.entries()]));
  });

  it("the gate stayed closed and the flight recorder holds redacted exchanges", () => {
    assert.equal(gate.state, "CLOSED");
    const dump = recorder.dump();
    assert.ok(dump.length >= 3);
    assert.ok(dump.every((d) => !d.error), "a request failed");
    assert.ok(dump.every((d) => !/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/.test(d.response ?? "")), "GSTIN leaked into the recording");
  });
});

describe("live master catalog + pre-flight (read-only)", { skip }, () => {
  it("loads ledgers/groups/items, resolves root groups and plans a real invoice", async () => {
    const u = new URL(url!);
    const gate = new TallyGate(new FetchTallyTransport({ baseURL: `${u.protocol}//${u.hostname}`, port: Number(u.port || 9000), timeoutMinutes: 1 }), { timeoutMs: 60_000 });
    const client = new TallyClient({ transport: gate });
    const t0 = Date.now();
    const catalog = await loadMasterCatalog(client);
    console.log(`  catalog: ${catalog.ledgers.size} ledgers, ${catalog.stockItems.size} stock items in ${Date.now() - t0}ms`);
    const byRoot = new Map<string, number>();
    for (const l of catalog.ledgers.values()) byRoot.set(l.parent, (byRoot.get(l.parent) ?? 0) + 1);
    console.log("  ledgers by group:", JSON.stringify([...byRoot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)));
    const debtors = [...catalog.ledgers.values()].filter((l) => /sundry debtors/i.test(l.parent));
    console.log(`  debtors: ${debtors.length} | bill-wise: ${debtors.filter((d) => d.isBillWise).length} | with GSTIN: ${debtors.filter((d) => d.gstin).length}`);
    const tax = [...catalog.ledgers.values()].filter((l) => /duties/i.test(l.parent)).map((l) => l.name);
    console.log("  Duties & Taxes ledgers:", JSON.stringify(tax));
    assert.ok(catalog.ledgers.size > 0 && catalog.stockItems.size > 0);

    const item = [...catalog.stockItems][0];
    const party = debtors[0];
    const plan = planSalesInvoiceMasters({
      idempotencyKey: "live-plan", date: today, party: { name: party.name }, placeOfSupply: "Maharashtra", companyState: "Maharashtra", taxMode: TaxMode.EXCLUSIVE,
      lines: [{ itemName: catalog.stockItems.has(item) ? [...catalog.stockItems][0] : item, quantity: "1", unit: "PCS", amountPaise: 10000, gst: { taxability: "Taxable", basisPoints: { cgst: 900, sgst: 900, igst: 1800, cess: 0 } } }],
      ledgers: { sales: "SALES A/C", roundOff: "ROUND OFF", tax: { mode: "COMMON", cgst: "CGST", sgst: "SGST", igst: "IGST" } },
    }, catalog, undefined, ["CGST", "SGST", "IGST"]);
    console.log("  plan for a hypothetical invoice (lowercased item name from catalog):", JSON.stringify({ ready: plan.ready, missing: plan.missing, partyIsBillWise: plan.partyIsBillWise, warnings: plan.warnings }));
    assert.equal(gate.state, "CLOSED");
  });
});
