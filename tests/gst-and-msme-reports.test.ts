import test from "node:test";
import assert from "node:assert/strict";
import { TallySqliteSyncEngine } from "../src/sqlite/index.js";
import { TallyGstAnalytics } from "../src/analytics/gstReports.js";
import { TallyMsmeAnalytics } from "../src/analytics/msmeReports.js";
import { TallyFinancialAnalytics } from "../src/analytics/financialReports.js";
import { TallyRegisterAnalytics } from "../src/analytics/registerReports.js";

test("Analytics & Reporting Suite - GST, MSME, Financials & Registers", () => {
  const engine = new TallySqliteSyncEngine(":memory:");

  engine.syncAll({
    ledgers: [
      {
        name: "DEMO CUSTOMER ENTERPRISES",
        parent: "Sundry Debtors",
        group: "Sundry Debtors",
        closingBalance: 164256,
        gstin: "27ABCDE1234F1Z5",
        state: "Madhya Pradesh"
      },
      {
        name: "ANAND MICRO TECH",
        parent: "Sundry Creditors",
        group: "Sundry Creditors",
        closingBalance: 50000,
        msmeRegNumber: "UDYAM-MP-00-9999999",
        msmeEnterpriseType: "Micro"
      }
    ],
    stockItems: [
      {
        name: "CAT6 OUTDOOR CABLE",
        baseUnit: "PCS",
        closingBalance: { value: 100, unit: "PCS" },
        closingValue: { value: 58000, unit: "INR" },
        hsnCode: "8544",
        rateOfDuty: "18"
      }
    ],
    vouchers: [
      // Sales Voucher
      {
        guid: "vch_sale_1",
        voucherType: "Sales",
        voucherNumber: "INV-001",
        date: "20250415",
        partyLedgerName: "DEMO CUSTOMER ENTERPRISES",
        partyGSTIN: "27ABCDE1234F1Z5",
        placeOfSupply: "Madhya Pradesh",
        amount: 118000,
        isInvoice: true,
        inventoryAllocations: [
          {
            stockItemName: "CAT6 OUTDOOR CABLE",
            quantity: 200,
            rate: 500,
            amount: 100000,
            isDeemedPositive: true,
            hsnCode: "8544",
            gstRate: 18
          }
        ]
      },
      // Purchase Voucher with Bill Allocation for MSME test
      {
        guid: "vch_purch_1",
        voucherType: "Purchase",
        voucherNumber: "PUR-001",
        date: "20250101",
        partyLedgerName: "ANAND MICRO TECH",
        amount: 50000,
        ledgerEntries: [
          {
            ledgerName: "ANAND MICRO TECH",
            amount: 50000,
            isDeemedPositive: false,
            billAllocations: [
              {
                name: "BILL-101",
                billType: "New Ref",
                amount: 50000,
                billDate: "20250101",
                dueDate: "20250116"
              }
            ]
          }
        ]
      }
    ]
  });

  // 1. GST Analytics
  const gst = new TallyGstAnalytics(engine);
  const b2b = gst.getGstr1B2B();
  assert.equal(b2b.length, 1);
  assert.equal(b2b[0].partyName, "DEMO CUSTOMER ENTERPRISES");
  assert.equal(b2b[0].taxableValue, 100000);
  assert.equal(b2b[0].cgstAmount, 9000);
  assert.equal(b2b[0].sgstAmount, 9000);

  const hsn = gst.getGstr1HsnSummary();
  assert.equal(hsn.length, 1);
  assert.equal(hsn[0].hsnCode, "8544");
  assert.equal(hsn[0].taxableValue, 100000);

  const gstr3b = gst.getGstr3bSummary();
  assert.equal(gstr3b.outwardTaxableSupplies.taxableValue, 100000);
  assert.equal(gstr3b.outwardTaxableSupplies.cgst, 9000);
  assert.equal(gstr3b.outwardTaxableSupplies.sgst, 9000);

  // 2. MSME Section 43B(h) Analytics
  const msme = new TallyMsmeAnalytics(engine);
  const suppliers = msme.getMsmeSuppliersSummary();
  assert.equal(suppliers.length, 1);
  assert.equal(suppliers[0].name, "ANAND MICRO TECH");
  assert.equal(suppliers[0].enterpriseType, "Micro");

  const overdue = msme.getMsme43bOverdueReport({ asOfDate: "2025-04-01" });
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].supplierName, "ANAND MICRO TECH");
  assert.equal(overdue[0].section43bDisallowanceRisk, true);
  assert.ok(overdue[0].daysOverdue > 40);
  assert.ok(overdue[0].penalInterestLiable > 0);

  // 3. Financial Reports
  const fin = new TallyFinancialAnalytics(engine);
  const pl = fin.getProfitAndLoss();
  assert.ok(typeof pl.grossProfit === "number");

  const bs = fin.getBalanceSheet();
  assert.ok(bs.applicationOfFunds.closingStock >= 58000);

  // 4. Register Reports
  const reg = new TallyRegisterAnalytics(engine);
  const sales = reg.getSalesRegister();
  assert.equal(sales.length, 1);
  assert.equal(sales[0].partyName, "DEMO CUSTOMER ENTERPRISES");

  const ratios = reg.getRatioAnalysis();
  assert.ok(typeof ratios.workingCapital === "number");
});
