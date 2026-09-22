import test from "node:test";
import assert from "node:assert/strict";
import { TallySqliteSyncEngine } from "../src/sqlite/index.js";

test("TallySqliteSyncEngine - In-Memory SQLite Sync & Queries", () => {
  const engine = new TallySqliteSyncEngine(":memory:");

  const stats = engine.syncAll({
    companies: [
      {
        name: "ACME ENTERPRISES LLP",
        formalName: "Acme Industries",
        gstin: "",
        state: "Madhya Pradesh"
      }
    ],
    groups: [
      { name: "Sundry Debtors", parent: "Current Assets" },
      { name: "Sundry Creditors", parent: "Current Liabilities" }
    ],
    ledgers: [
      {
        name: "DEMO CUSTOMER ENTERPRISES",
        parent: "Sundry Debtors",
        group: "Sundry Debtors",
        openingBalance: 0,
        closingBalance: 125000,
        gstin: "",
        state: "Madhya Pradesh"
      },
      {
        name: "MICRO SUPPLIER CORP",
        parent: "Sundry Creditors",
        group: "Sundry Creditors",
        openingBalance: 0,
        closingBalance: 45000,
        gstin: "",
        state: "Madhya Pradesh",
        msmeRegNumber: "UDYAM-MP-00-1234567",
        msmeEnterpriseType: "Micro"
      }
    ],
    stockItems: [
      {
        name: "CAT6 OUTDOOR CABLE",
        baseUnit: "PCS",
        closingBalance: { value: 240, unit: "PCS" },
        closingRate: { value: 580, unit: "PCS" },
        closingValue: { value: 139200, unit: "INR" },
        hsnCode: "8544",
        rateOfDuty: "18"
      }
    ],
    vouchers: [
      {
        guid: "vch_001",
        voucherType: "Sales",
        voucherNumber: "INV-2025-1",
        date: "20250410",
        partyLedgerName: "DEMO CUSTOMER ENTERPRISES",
        partyGSTIN: "",
        placeOfSupply: "Madhya Pradesh",
        amount: 164256,
        isInvoice: true,
        inventoryAllocations: [
          {
            stockItemName: "CAT6 OUTDOOR CABLE",
            quantity: 240,
            rate: 580,
            amount: 139200,
            isDeemedPositive: true,
            hsnCode: "8544",
            gstRate: 18
          }
        ],
        ledgerEntries: [
          { ledgerName: "DEMO CUSTOMER ENTERPRISES", amount: -164256, isDeemedPositive: true, isPartyLedger: true },
          { ledgerName: "SALES GST 18%", amount: 139200, isDeemedPositive: false },
          { ledgerName: "CGST 9%", amount: 12528, isDeemedPositive: false },
          { ledgerName: "SGST 9%", amount: 12528, isDeemedPositive: false }
        ]
      }
    ]
  });

  assert.equal(stats.companies, 1);
  assert.equal(stats.groups, 2);
  assert.equal(stats.ledgers, 2);
  assert.equal(stats.stockItems, 1);
  assert.equal(stats.vouchers, 1);

  // Query verification
  const debtors = engine.query<any>("SELECT name, closing_balance FROM tally_ledgers WHERE parent = 'Sundry Debtors'");
  assert.equal(debtors.length, 1);
  assert.equal(debtors[0].name, "DEMO CUSTOMER ENTERPRISES");
  assert.equal(debtors[0].closing_balance, 125000);

  const stock = engine.query<any>("SELECT name, closing_balance_qty, closing_value FROM tally_stock_items");
  assert.equal(stock.length, 1);
  assert.equal(stock[0].name, "CAT6 OUTDOOR CABLE");
  assert.equal(stock[0].closing_balance_qty, 240);
  assert.equal(stock[0].closing_value, 139200);
});
