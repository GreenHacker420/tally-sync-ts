import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { voucherToXml, parseExportCollection } from "../src/index.js";
import type { Voucher } from "../src/types.js";

describe("Item Invoice & Full Party Details XML Serialization", () => {
  test("Serializes Item Invoice with full party snapshot and inventory entries", () => {
    const vch: Voucher = {
      voucherType: "Sales",
      date: "2026-03-31",
      voucherNumber: "JAC/25-26/100",
      partyName: "CHIRAG ENTERPRISES",
      stateName: "Madhya Pradesh",
      countryOfResidence: "India",
      partyGSTIN: "23ACGPH7875L1Z6",
      placeOfSupply: "Madhya Pradesh",
      partyGSTRegistrationType: "Regular",
      address: ["SHOP NO-5, AMRIT BAZAR COMPLEX", "NARGAR NIGAM ROAD, JABALPUR"],
      isInvoice: true,
      vchEntryMode: "Item Invoice",
      inventoryAllocations: [
        {
          stockItemName: "EVERGREEN CAT6 OUTDOOR CABLE",
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
          ledgerName: "CHIRAG ENTERPRISES",
          amount: -1369,
          isDeemedPositive: true,
          isPartyLedger: true,
          billAllocations: [
            {
              name: "JAC/25-26/100",
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
    assert.match(xml, /<PARTYNAME>CHIRAG ENTERPRISES<\/PARTYNAME>/);
    assert.match(xml, /<STATENAME>Madhya Pradesh<\/STATENAME>/);
    assert.match(xml, /<COUNTRYOFRESIDENCE>India<\/COUNTRYOFRESIDENCE>/);
    assert.match(xml, /<PARTYGSTIN>23ACGPH7875L1Z6<\/PARTYGSTIN>/);
    assert.match(xml, /<PLACEOFSUPPLY>Madhya Pradesh<\/PLACEOFSUPPLY>/);
    assert.match(xml, /<ADDRESS>SHOP NO-5, AMRIT BAZAR COMPLEX<\/ADDRESS>/);

    // Assertions for Stock Item & Batch
    assert.match(xml, /<STOCKITEMNAME>EVERGREEN CAT6 OUTDOOR CABLE<\/STOCKITEMNAME>/);
    assert.match(xml, /<ACTUALQTY> 2 PCS<\/ACTUALQTY>/);
    assert.match(xml, /<BILLEDQTY> 2 PCS<\/BILLEDQTY>/);
    assert.match(xml, /<GODOWNNAME>Main Location<\/GODOWNNAME>/);
    assert.match(xml, /<BATCHNAME>Primary Batch<\/BATCHNAME>/);
    assert.match(xml, /<BATCHRATE>580.00\/PCS<\/BATCHRATE>/);

    // Assertions for Accounting Allocation under Item
    assert.match(xml, /<ACCOUNTINGALLOCATIONS\.LIST>\s*<LEDGERNAME>SALES GST 18%<\/LEDGERNAME>/);

    // Assertions for LEDGERENTRIES.LIST with Tax & Rounding Method Types
    assert.match(xml, /<LEDGERENTRIES\.LIST>/);
    assert.match(xml, /<METHODTYPE>GST<\/METHODTYPE>/);
    assert.match(xml, /<METHODTYPE>As Total Amount Rounding<\/METHODTYPE>/);
  });
});
