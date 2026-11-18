import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { TallySqliteSyncEngine, parseExportCollection } from "../src/index.js";
import type { StockItem } from "../src/index.js";

const items = parseExportCollection<StockItem>(readFileSync(new URL("./fixtures/stock-items-gst.xml", import.meta.url), "utf8"), "StockItem");

describe("SQLite mirror - GST history and identity", () => {
  it("fills gst_rate / taxability / hsn / guid for stock items (was NULL for every item)", () => {
    const e = new TallySqliteSyncEngine(":memory:");
    e.syncAll({ stockItems: items });
    const [row] = e.query<Record<string, unknown>>("SELECT * FROM tally_stock_items WHERE name = 'DEMO TONER 85A'");
    assert.equal(row.hsn_code, "8443");
    assert.equal(row.gst_rate, 5);
    assert.equal(row.taxability, "Taxable");
    assert.equal(row.guid, "demo-guid-0001");
    assert.equal(row.master_id, 101);
    assert.equal(row.alter_id, 777);
    assert.equal(row.gst_type_of_supply, "Goods");
  });

  it("stores the dated GST history, one row per effective date, and replaces it on resync", () => {
    const e = new TallySqliteSyncEngine(":memory:");
    e.syncAll({ stockItems: items });
    e.syncAll({ stockItems: items });
    const rows = e.query<{ applicable_from: string; igst: number; cgst: number; hsn_code: string }>(
      "SELECT applicable_from, igst, cgst, hsn_code FROM tally_stock_item_gst WHERE item_name = 'DEMO TONER 85A' ORDER BY applicable_from",
    );
    assert.deepEqual(rows.map((r) => [r.applicable_from, r.igst, r.cgst, r.hsn_code]), [["20230401", 18, 9, "8443"], ["20251001", 5, 2.5, "8443"]]);
  });

  it("upgrades a mirror file created by the previous version in place, keeping its data", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE tally_stock_items (name TEXT PRIMARY KEY, parent TEXT, category TEXT, base_unit TEXT, closing_balance_qty REAL DEFAULT 0,
      closing_balance_unit TEXT, closing_rate REAL DEFAULT 0, closing_value REAL DEFAULT 0, opening_balance_qty REAL DEFAULT 0, opening_value REAL DEFAULT 0,
      hsn_code TEXT, hsn_description TEXT, gst_rate REAL, taxability TEXT, costing_method TEXT, valuation_method TEXT, raw_tags JSON, synced_at TEXT NOT NULL);
      INSERT INTO tally_stock_items (name, base_unit, synced_at) VALUES ('OLD ITEM', 'PCS', 'x');`);
    const e = new TallySqliteSyncEngine(db);
    const cols = e.query<{ name: string }>("PRAGMA table_info(tally_stock_items)").map((c) => c.name);
    for (const c of ["guid", "master_id", "alter_id", "gst_type_of_supply"]) assert.ok(cols.includes(c), `missing ${c}`);
    assert.equal(e.query("SELECT name FROM tally_stock_items")[0].name, "OLD ITEM");
    assert.equal((e.query<{ user_version: number }>("PRAGMA user_version")[0]).user_version, 2);
    new TallySqliteSyncEngine(db); // idempotent
  });
});
