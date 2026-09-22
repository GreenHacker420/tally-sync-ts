import test from "node:test";
import assert from "node:assert/strict";
import {
  tallyNumericSchema,
  tallyNumericCodec,
  tallyBooleanSchema,
  tallyBooleanCodec,
  tallyLogicalSchema,
  tallyTextSchema,
  tallyQuantitySchema,
  tallyRateSchema,
  tallyDateSchema,
  parseTallyNumeric,
} from "../src/xmlParser.js";

test("Zod - tallyNumericSchema & parseTallyNumeric", () => {
  assert.strictEqual(tallyNumericSchema.parse(100), 100);
  assert.strictEqual(tallyNumericSchema.parse("100"), 100);
  assert.strictEqual(tallyNumericSchema.parse("1,250.50 Dr"), 1250.5);
  assert.strictEqual(tallyNumericSchema.parse("1,250.50 Cr"), -1250.5);
  assert.strictEqual(tallyNumericSchema.parse("500Cr"), -500);
  assert.strictEqual(tallyNumericSchema.parse("-75.25"), -75.25);
  assert.strictEqual(tallyNumericSchema.parse(null), 0);
  assert.strictEqual(tallyNumericSchema.parse(undefined), 0);
  assert.strictEqual(tallyNumericSchema.parse(""), 0);

  // parseTallyNumeric wrapper
  assert.strictEqual(parseTallyNumeric("1,250.50 Dr"), 1250.5);
  assert.strictEqual(parseTallyNumeric("1,250.50 Cr"), -1250.5);
  assert.strictEqual(parseTallyNumeric(null), 0);
});

test("Zod - tallyNumericCodec bidirectional", () => {
  assert.strictEqual(tallyNumericCodec.parse("100 Cr"), -100);
  assert.strictEqual(tallyNumericCodec.encode(-100), "-100");
});

test("Zod - tallyBooleanSchema & tallyBooleanCodec", () => {
  assert.strictEqual(tallyBooleanSchema.parse("Yes"), true);
  assert.strictEqual(tallyBooleanSchema.parse("true"), true);
  assert.strictEqual(tallyBooleanSchema.parse("1"), true);
  assert.strictEqual(tallyBooleanSchema.parse("No"), false);
  assert.strictEqual(tallyBooleanSchema.parse("false"), false);
  assert.strictEqual(tallyBooleanSchema.parse("0"), false);
  assert.strictEqual(tallyBooleanSchema.parse(undefined), undefined);

  assert.strictEqual(tallyBooleanCodec.parse("Yes"), true);
  assert.strictEqual(tallyBooleanCodec.encode(true), "Yes");
  assert.strictEqual(tallyBooleanCodec.encode(false), "No");
});

test("Zod - tallyLogicalSchema", () => {
  assert.strictEqual(tallyLogicalSchema.parse("Yes"), true);
  assert.strictEqual(tallyLogicalSchema.parse("No"), false);
  assert.strictEqual(tallyLogicalSchema.parse("Not Applicable"), "Not Applicable");
  assert.strictEqual(tallyLogicalSchema.parse("not applicable"), "Not Applicable");
  assert.strictEqual(tallyLogicalSchema.parse(undefined), undefined);
});

test("Zod - tallyTextSchema", () => {
  assert.strictEqual(tallyTextSchema.parse("  Item Name \u0004 "), "Item Name");
  assert.strictEqual(tallyTextSchema.parse({ "#text": "Nested Value" }), "Nested Value");
  assert.strictEqual(tallyTextSchema.parse(""), undefined);
  assert.strictEqual(tallyTextSchema.parse(undefined), undefined);
});

test("Zod - tallyQuantitySchema & tallyRateSchema", () => {
  const qty = tallyQuantitySchema.parse("100 Nos");
  assert.deepEqual(qty, { value: 100, unit: "Nos", raw: "100 Nos" });

  const rate = tallyRateSchema.parse("50/box");
  assert.deepEqual(rate, { value: 50, unit: "box", raw: "50/box" });
});

test("Zod - tallyDateSchema", () => {
  assert.strictEqual(tallyDateSchema.parse("2024-03-15"), "20240315");
  assert.strictEqual(tallyDateSchema.parse("2024/03/15"), "20240315");
  assert.strictEqual(tallyDateSchema.parse("20240315"), "20240315");
  assert.strictEqual(tallyDateSchema.parse(new Date(2024, 2, 15)), "20240315");
});

test("Zod - Domain Schemas (Ledger, StockItem, Voucher)", async () => {
  const { LedgerSchema, StockItemSchema, VoucherSchema } = await import("../src/schema/zod.js");

  // Ledger with Tally string values
  const ledger = LedgerSchema.parse({
    name: "Customer A",
    parent: "Sundry Debtors",
    openingBalance: "10,500.50 Dr",
    isBillwise: "Yes",
    isDeemedPositive: "Yes",
  });
  assert.strictEqual(ledger.name, "Customer A");
  assert.strictEqual(ledger.openingBalance, 10500.5);
  assert.strictEqual(ledger.isBillwise, true);
  assert.strictEqual(ledger.isDeemedPositive, true);

  // StockItem with rates and units
  const item = StockItemSchema.parse({
    name: "Widget Pro",
    openingBalance: "50",
    openingRate: "120.00/pcs",
    isBatchWise: "No",
  });
  assert.strictEqual(item.name, "Widget Pro");
  assert.strictEqual(item.openingBalance, 50);
  assert.strictEqual(item.openingRate, 120);
  assert.strictEqual(item.isBatchWise, false);

  // Voucher with nested allocations
  const voucher = VoucherSchema.parse({
    date: "20260401",
    voucherType: "Sales",
    amount: "25,000.00 Cr",
    isInvoice: "Yes",
    ledgerEntries: [
      {
        ledgerName: "Customer A",
        amount: "25,000.00 Dr",
        isPartyLedger: "Yes",
        billAllocations: [
          { billType: "New Ref", billName: "INV-001", amount: "25,000.00 Dr" },
        ],
      },
    ],
  });
  assert.strictEqual(voucher.amount, -25000);
  assert.strictEqual(voucher.isInvoice, true);
  assert.strictEqual(voucher.ledgerEntries[0].amount, 25000);
  assert.strictEqual(voucher.ledgerEntries[0].billAllocations[0].amount, 25000);
});

