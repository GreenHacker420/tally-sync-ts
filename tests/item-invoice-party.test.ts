import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { voucherToXml, parseExportCollection } from "../src/index.js";
import type { Voucher } from "../src/types.js";

describe("Item Invoice & Full Party Details XML Serialization", () => {
  test("Serializes Item Invoice with full party snapshot and inventory entries", () => {
    const vch: Voucher = {
      voucherType: "Sales",
      date: "2026-03-31",
      voucherNumber: "INV-2025-100",
      partyName: "DEMO ENTERPRISES",
      stateName: "Maharashtra",
      countryOfResidence: "India",
      partyGSTIN: "27ABCDE1234F1Z5",
      placeOfSupply: "Maharashtra",
      partyGSTRegistrationType: "Regular",
      address: ["101 INDUSTRIAL AREA, PHASE 1", "MAIN ROAD, COMMERCIAL ZONE"],
      isInvoice: true,
      vchEntryMode: "Item Invoice",
      inventoryAllocations: [
        {
          stockItemName: "INDUSTRIAL CABLE",
          quantity: "2 PCS",
          actualQuantity: "2 PCS",
          billedQuantity: "2 PCS",
          rate: "580.00/PCS",
          amount: 1160,
          isDeemedPositive: false,
          batchAllocations: [
            {
              godownName: "Main Location",
              batchName: "Primary Batch",
              actualQuantity: "2 PCS",
              billedQuantity: "2 PCS",
              rate: "580.00/PCS",
              amount: 1160,
            },
          ],
          accountingAllocations: [
            {
              ledgerName: "SALES GST 18%",
              amount: 1160,
              isDeemedPositive: false,
            },
          ],
        },
      ],
      ledgerEntries: [
        {
          ledgerName: "DEMO ENTERPRISES",
          amount: -1369,
          isDeemedPositive: true,
          isPartyLedger: true,
          billAllocations: [
            {
              name: "INV-2025-100",
              billType: "New Ref",
              amount: -1369,
            },
          ],
        },
        {
          ledgerName: "CGST 9%",
          amount: 104.4,
          isDeemedPositive: false,
          methodType: "GST",
          roundType: "Not Applicable",
        },
        {
          ledgerName: "SGST 9%",
          amount: 104.4,
          isDeemedPositive: false,
          methodType: "GST",
          roundType: "Not Applicable",
        },
        {
          ledgerName: "ROUND OFF",
          amount: 0.2,
          isDeemedPositive: false,
          methodType: "As Total Amount Rounding",
          roundType: "Normal Rounding",
        },
      ],
    };

    const xml = voucherToXml(vch);

    // Assertions for Item Invoice & Party Snapshot
    assert.match(xml, /OBJVIEW="Invoice Voucher View"/);
    assert.match(xml, /<VCHENTRYMODE>Item Invoice<\/VCHENTRYMODE>/);
    assert.match(xml, /<PERSISTEDVIEW>Invoice Voucher View<\/PERSISTEDVIEW>/);
    assert.match(xml, /<PARTYNAME>DEMO ENTERPRISES<\/PARTYNAME>/);
    assert.match(xml, /<STATENAME>Maharashtra<\/STATENAME>/);
    assert.match(xml, /<COUNTRYOFRESIDENCE>India<\/COUNTRYOFRESIDENCE>/);
    assert.match(xml, /<PARTYGSTIN>27ABCDE1234F1Z5<\/PARTYGSTIN>/);
    assert.match(xml, /<PLACEOFSUPPLY>Maharashtra<\/PLACEOFSUPPLY>/);
    assert.match(xml, /<ADDRESS>101 INDUSTRIAL AREA, PHASE 1<\/ADDRESS>/);

    // Assertions for Stock Item & Batch
    assert.match(xml, /<STOCKITEMNAME>INDUSTRIAL CABLE<\/STOCKITEMNAME>/);
    assert.match(xml, /<ACTUALQTY>\s*2 PCS<\/ACTUALQTY>/);
    assert.match(xml, /<BILLEDQTY>\s*2 PCS<\/BILLEDQTY>/);
    assert.match(xml, /<BATCHNAME>Primary Batch<\/BATCHNAME>/);
    assert.match(xml, /<GODOWNNAME>Main Location<\/GODOWNNAME>/);
    assert.match(xml, /<AMOUNT>1160\.00<\/AMOUNT>/);
  });
});
