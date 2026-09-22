import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  voucherCodec,
  ledgerCodec,
  stockItemCodec,
  parseRawXml,
  serializeXml,
  TallyReader,
  normalizeVoucher,
} from "../src/index.js";

const fixturesDir = join(process.cwd(), "tests/fixtures");

describe("Comprehensive 57-Point Architecture & Fixture Verification", () => {
  test("1. sales_voucher.xml: Full-fidelity parse of 1600-line invoice", () => {
    const filePath = join(fixturesDir, "sales_voucher.xml");
    if (!existsSync(filePath)) {
      return;
    }
    const xml = readFileSync(filePath, "utf8");
    const parsed = parseRawXml(xml) as any;
    const vchNode = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER ??
      parsed?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE?.VOUCHER ??
      parsed?.ENVELOPE?.BODY?.DATA?.VOUCHER ??
      parsed?.VOUCHER;

    assert.ok(vchNode, "Voucher node must be present in sales_voucher.xml");

    const vch = voucherCodec.parse(vchNode);

    // 1. Voucher Header & Identity
    assert.strictEqual(vch.voucherType, "Sales");
    assert.strictEqual(vch.voucherNumber, "INV-2025-9");
    assert.strictEqual(vch.date, "2025-05-19");
    assert.strictEqual(vch.isInvoice, true);
    assert.strictEqual(vch.vchEntryMode, "Item Invoice");

    // 2. Party & Buyer Snapshot (Never missing)
    assert.strictEqual(vch.partyLedgerName, "DEMO ENTERPRISES");
    assert.strictEqual(vch.partyName, "DEMO ENTERPRISES");
    assert.strictEqual(vch.buyer?.name, "DEMO ENTERPRISES");
    assert.strictEqual(vch.buyer?.gstin, "27ABCDE1234F1Z5");
    assert.strictEqual(vch.buyer?.state, "Madhya Pradesh");
    assert.strictEqual(vch.buyer?.country, "India");
    assert.strictEqual(vch.partyGSTIN, "27ABCDE1234F1Z5");
    assert.strictEqual(vch.placeOfSupply, "Madhya Pradesh");
    assert.strictEqual(vch.stateName, "Madhya Pradesh");
    assert.strictEqual(vch.countryOfResidence, "India");

    // Address verification
    assert.ok(vch.buyer?.address && vch.buyer.address.length > 0, "Buyer address lines must be present");
    assert.ok(vch.buyer.address[0].includes("101 INDUSTRIAL AREA, PHASE 1"));

    // 3. Inventory Allocations with nested Batch & Accounting Allocations
    const items = vch.allInventoryEntries || vch.inventoryAllocations;
    assert.ok(items && items.length > 0, "Must have inventory allocations");
    const item = items[0];
    assert.strictEqual(item.stockItemName, " CAT6 OUTDOOR CABLE");
    assert.strictEqual(item.amount, 1160);
    assert.ok(item.rate.raw.includes("580.00/PCS"));
    assert.ok(item.billedQuantity.raw.includes("2 PCS"));

    // Nested Batch Allocation
    assert.ok(item.batchAllocations && item.batchAllocations.length > 0, "Must have batch allocations");
    assert.strictEqual(item.batchAllocations[0].batchName, "Primary Batch");
    assert.strictEqual(item.batchAllocations[0].godownName, "Main Location");
    assert.strictEqual(item.batchAllocations[0].amount, 1160);

    // Nested Accounting Allocation under Inventory
    assert.ok(item.accountingAllocations && item.accountingAllocations.length > 0, "Must have accounting allocations");
    assert.strictEqual(item.accountingAllocations[0].ledgerName, "SALES GST 18%");
    assert.strictEqual(item.accountingAllocations[0].amount, 1160);

    // 4. Distinct Ledger Allocations (Party, CGST, SGST, ROUND OFF)
    const ledgers = vch.allLedgerEntries || vch.ledgerEntries;
    assert.ok(ledgers && ledgers.length >= 4, "Must have all 4 ledger entries");

    const partyLedger = ledgers.find(l => l.ledgerName === "DEMO ENTERPRISES");
    assert.ok(partyLedger, "Party ledger must be present");
    assert.strictEqual(partyLedger.isPartyLedger, true);
    assert.strictEqual(partyLedger.isDeemedPositive, true);
    assert.strictEqual(partyLedger.amount, -1369);
    assert.ok(partyLedger.billAllocations && partyLedger.billAllocations.length > 0, "Bill allocations must be present");
    assert.strictEqual(partyLedger.billAllocations[0].name, "INV-2025-9");
    assert.strictEqual(partyLedger.billAllocations[0].billType, "New Ref");
    assert.strictEqual(partyLedger.billAllocations[0].amount, -1369);

    const cgst = ledgers.find(l => l.ledgerName === "CGST 9%");
    assert.ok(cgst, "CGST 9% ledger must be present");
    assert.strictEqual(cgst.methodType, "GST");
    assert.strictEqual(cgst.roundType, "Not Applicable");
    assert.strictEqual(cgst.amount, 104.4);

    const sgst = ledgers.find(l => l.ledgerName === "SGST 9%");
    assert.ok(sgst, "SGST 9% ledger must be present");
    assert.strictEqual(sgst.methodType, "GST");
    assert.strictEqual(sgst.amount, 104.4);

    const roundOff = ledgers.find(l => l.ledgerName === "ROUND OFF");
    assert.ok(roundOff, "ROUND OFF ledger must be present");
    assert.strictEqual(roundOff.methodType, "As Total Amount Rounding");
    assert.strictEqual(roundOff.amount, 0.2);

    // 5. Lossless Preservation of Unknown Tags
    assert.ok(vch.unknown, "Lossless unknown dictionary must capture unmapped tags");
    assert.ok(Object.keys(vch.unknown).length > 0, "Unknown tags must be preserved");

    // 6. Round-trip Build & Serialization
    const builtXmlEl = voucherCodec.build(vch);
    const serialized = serializeXml(builtXmlEl, 0);
    assert.ok(serialized.includes('<VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">'));
    assert.ok(serialized.includes("<PARTYNAME>DEMO ENTERPRISES</PARTYNAME>"));
    assert.ok(serialized.includes("<PARTYGSTIN>27ABCDE1234F1Z5</PARTYGSTIN>"));
    assert.ok(serialized.includes("<STOCKITEMNAME>CAT6 OUTDOOR CABLE</STOCKITEMNAME>"));
    assert.ok(serialized.includes("<LEDGERNAME>SALES GST 18%</LEDGERNAME>"));
    assert.ok(serialized.includes("<LEDGERNAME>CGST 9%</LEDGERNAME>"));
    assert.ok(serialized.includes("<LEDGERNAME>ROUND OFF</LEDGERNAME>"));

    // 7. ShopControl Normalized Model
    const normalized = normalizeVoucher(vch);
    assert.strictEqual(normalized.voucherNumber, "INV-2025-9");
    assert.strictEqual(normalized.partyName, "DEMO ENTERPRISES");
    assert.strictEqual(normalized.partyGSTIN, "27ABCDE1234F1Z5");
    assert.strictEqual(normalized.items.length, 1);
    assert.strictEqual(normalized.items[0].itemName, "CAT6 OUTDOOR CABLE");
    assert.strictEqual(normalized.items[0].amount, 1160);
    assert.strictEqual(normalized.taxes.length, 2);
    assert.strictEqual(normalized.totalTaxAmount, 208.8);
    assert.strictEqual(normalized.roundOff, 0.2);
    assert.strictEqual(normalized.totalAmount, 1369);
  });

  test("2. master_ledger.xml: Full-fidelity parse of Party Ledger", () => {
    const filePath = join(fixturesDir, "master_ledger.xml");
    if (!existsSync(filePath)) {
      return;
    }
    const xml = readFileSync(filePath, "utf8");
    const parsed = parseRawXml(xml) as any;
    const ledgerNode = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER ??
      parsed?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE?.LEDGER ??
      parsed?.ENVELOPE?.BODY?.DATA?.LEDGER ??
      parsed?.LEDGER;

    assert.ok(ledgerNode, "Ledger node must be present in master_ledger.xml");
    const ledger = ledgerCodec.parse(ledgerNode);

    assert.strictEqual(ledger.name, "DEMO ENTERPRISES");
    assert.strictEqual(ledger.group, "Sundry Debtors");
    assert.strictEqual(ledger.stateName, "Madhya Pradesh");
    assert.strictEqual(ledger.countryOfResidence, "India");
    assert.strictEqual(ledger.partyGstin, "27ABCDE1234F1Z5");
    assert.strictEqual(ledger.panNumber, "ABCDE1234F");
    assert.strictEqual(ledger.isBillWiseOn, true);
    assert.ok(ledger.mailingDetails && ledger.mailingDetails.length > 0, "Mailing details must be parsed");
    assert.strictEqual(ledger.mailingDetails[0].state, "Madhya Pradesh");
  });

  test("3. master_cat6.xml: Full-fidelity parse of Stock Item", () => {
    const filePath = join(fixturesDir, "master_cat6.xml");
    if (!existsSync(filePath)) {
      return;
    }
    const xml = readFileSync(filePath, "utf8");
    const parsed = parseRawXml(xml) as any;
    const itemNode = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM ??
      parsed?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE?.STOCKITEM ??
      parsed?.ENVELOPE?.BODY?.DATA?.STOCKITEM ??
      parsed?.STOCKITEM;

    assert.ok(itemNode, "StockItem node must be present in master_cat6.xml");
    const item = stockItemCodec.parse(itemNode);

    assert.strictEqual(item.name, " CAT6 OUTDOOR CABLE");
    assert.strictEqual(item.stockGroup, "Primary");
    assert.strictEqual(item.baseUnit, "PCS");
    assert.strictEqual(item.isBatchWiseOn, true);
    assert.strictEqual(item.hsnCode, "85444999");
    assert.strictEqual(item.integratedTaxRate, 18);
  });
});
