import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TallySqliteSyncEngine } from "../src/sqlite/index.js";

describe("TallySqliteSyncEngine - bill allocations", () => {
  const voucher = (guid: string) => ({
    guid,
    voucherType: "Sales",
    voucherNumber: "INV-1",
    date: "20260410",
    partyLedgerName: "PARTY A",
    amount: 1180,
    isInvoice: true,
    ledgerEntries: [
      {
        ledgerName: "PARTY A",
        amount: -1180,
        isDeemedPositive: true,
        isPartyLedger: true,
        billAllocations: [{ name: "INV-1", billType: "New Ref", amount: -1180 }],
      },
      {
        ledgerName: "ADVANCE PARTY B",
        amount: 100,
        isDeemedPositive: false,
        billAllocations: [{ name: "ADV-7", billType: "Advance", amount: 100 }],
      },
    ],
  });

  it("keeps allocations of EVERY ledger entry of a voucher", () => {
    const engine = new TallySqliteSyncEngine(":memory:");
    engine.syncAll({ vouchers: [voucher("g1") as never] });
    const rows = engine.query<{ ledger_name: string; name: string }>(
      "SELECT ledger_name, name FROM tally_voucher_bill_allocations WHERE voucher_guid = 'g1' ORDER BY ledger_name",
    );
    assert.deepEqual(rows.map((r) => `${r.ledger_name}:${r.name}`), ["ADVANCE PARTY B:ADV-7", "PARTY A:INV-1"]);
  });

  it("replaces (does not duplicate) allocations when the same voucher is synced again", () => {
    const engine = new TallySqliteSyncEngine(":memory:");
    engine.syncAll({ vouchers: [voucher("g1") as never] });
    engine.syncAll({ vouchers: [voucher("g1") as never] });
    const [{ n }] = engine.query<{ n: number }>("SELECT COUNT(*) AS n FROM tally_voucher_bill_allocations WHERE voucher_guid = 'g1'");
    assert.equal(n, 2);
  });

  it("removes stale allocations when a voucher no longer has them", () => {
    const engine = new TallySqliteSyncEngine(":memory:");
    engine.syncAll({ vouchers: [voucher("g1") as never] });
    const edited = voucher("g1");
    edited.ledgerEntries = [{ ...edited.ledgerEntries[0], billAllocations: undefined } as never, { ...edited.ledgerEntries[1], billAllocations: undefined } as never];
    engine.syncAll({ vouchers: [edited as never] });
    const [{ n }] = engine.query<{ n: number }>("SELECT COUNT(*) AS n FROM tally_voucher_bill_allocations WHERE voucher_guid = 'g1'");
    assert.equal(n, 0);
  });
});
