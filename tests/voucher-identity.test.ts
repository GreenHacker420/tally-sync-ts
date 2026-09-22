import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { voucherToXml, Voucher } from "../src/index.js";

describe("Phase 0A: Voucher Identity XML Serialization", () => {
  const sampleVoucher: Voucher = {
    voucherType: "Sales",
    date: "2026-09-22",
    voucherNumber: "VS/26-27/0148",
    partyName: "Mahavir Traders",
    ledgerEntries: [
      {
        ledgerName: "Mahavir Traders",
        amount: 11800,
        isDeemedPositive: true,
      },
      {
        ledgerName: "Sales Account",
        amount: -10000,
        isDeemedPositive: false,
      },
      {
        ledgerName: "Output CGST",
        amount: -900,
        isDeemedPositive: false,
      },
      {
        ledgerName: "Output SGST",
        amount: -900,
        isDeemedPositive: false,
      }
    ],
  };

  it("1. Generates deterministic REMOTEID attribute and tag on CREATE", () => {
    const xml = voucherToXml(sampleVoucher, {
      action: "Create",
      identity: { mode: "CREATE", remoteId: "SC-SAL-c182a9f" },
    });
    assert.ok(xml.includes('REMOTEID="SC-SAL-c182a9f"'), "Should have REMOTEID attribute");
    assert.ok(xml.includes("<REMOTEID>SC-SAL-c182a9f</REMOTEID>"), "Should have REMOTEID element");
    assert.ok(xml.includes('ACTION="Create"'), "Should have ACTION=Create");
  });

  it("2. Emits TAGNAME='MASTER ID' and TAGVALUE on Alter mode", () => {
    const xml = voucherToXml(sampleVoucher, {
      action: "Alter",
      identity: { mode: "MASTER_ID", masterId: 9120 },
    });
    assert.ok(xml.includes('TAGNAME="MASTER ID" TAGVALUE="9120"'), "Should have TAGNAME=MASTER ID");
    assert.ok(xml.includes('ACTION="Alter"'), "Should have ACTION=Alter");
  });

  it("3. Emits ISCANCELLED=Yes on Cancel mode", () => {
    const xml = voucherToXml(sampleVoucher, {
      action: "Cancel",
      identity: { mode: "MASTER_ID", masterId: 9120 },
    });
    assert.ok(xml.includes('ACTION="Cancel"'), "Should have ACTION=Cancel");
    assert.ok(xml.includes("<ISCANCELLED>Yes</ISCANCELLED>"), "Should have ISCANCELLED element");
  });

  it("4. Emits TAGNAME='GUID' on GUID Alter mode", () => {
    const xml = voucherToXml(sampleVoucher, {
      action: "Alter",
      identity: { mode: "GUID", guid: "4e2a8b91-1234-5678-9abc-def012345678" },
    });
    assert.ok(xml.includes('TAGNAME="GUID" TAGVALUE="4e2a8b91-1234-5678-9abc-def012345678"'), "Should have GUID attribute");
  });

  it("5. Preserves backward compatibility when called with string 'Create'", () => {
    const xml = voucherToXml(sampleVoucher, "Create");
    assert.ok(xml.includes('VCHTYPE="Sales" ACTION="Create"'), "Should default to Create without identity");
  });
});
