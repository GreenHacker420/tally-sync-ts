import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyImportError,
  classifyImportOutcome,
  ImportErrorCode,
  ImportErrorClass,
  importLogPath,
  importLogMark,
  readImportLogSince,
  parsePostResponse,
} from "../src/index.js";

describe("classifyImportError", () => {
  const cases: Array<[string, string, string]> = [
    ["Voucher totals do not match! Dr: 20,394.00 Dr Cr: 20,395.00 Cr Diff: 1.00 Cr", ImportErrorCode.TOTALS_MISMATCH, ImportErrorClass.PERMANENT],
    ["Ledger 'CHIRAG ENTERPRISES' does not exist!", ImportErrorCode.MASTER_MISSING, ImportErrorClass.PERMANENT],
    ["Stock Item 'CAT6' does not exist!", ImportErrorCode.MASTER_MISSING, ImportErrorClass.PERMANENT],
    ["Unit 'PCS' does not exist!", ImportErrorCode.MASTER_MISSING, ImportErrorClass.PERMANENT],
    ["Godown 'Main Location' does not exist!", ImportErrorCode.MASTER_MISSING, ImportErrorClass.PERMANENT],
    ["Voucher Type 'Local Purchase [GST]' does not exist!", ImportErrorCode.VOUCHER_TYPE_MISSING, ImportErrorClass.PERMANENT],
    ["The date is out of Range! Can't import! Check Tally.imp for details", ImportErrorCode.DATE_OUT_OF_RANGE, ImportErrorClass.PERMANENT],
    ["Ledger 'TC_Test Ledger' already exists!", ImportErrorCode.ALREADY_EXISTS, ImportErrorClass.PERMANENT],
    ["Could not set 'SVCurrentCompany' to 'ACME LTD'", ImportErrorCode.COMPANY_NOT_LOADED, ImportErrorClass.TRANSIENT],
    ["something nobody has seen before", ImportErrorCode.UNKNOWN, ImportErrorClass.PERMANENT],
  ];
  for (const [text, code, cls] of cases) {
    it(`${code}: ${text.slice(0, 48)}`, () => {
      const info = classifyImportError(text);
      assert.equal(info.code, code);
      assert.equal(info.class, cls);
      assert.equal(info.text, text);
    });
  }

  it("extracts the missing master name and kind", () => {
    const info = classifyImportError("Stock Item 'CAT6 OUTDOOR' does not exist!");
    assert.deepEqual(info.detail, { masterKind: "Stock Item", masterName: "CAT6 OUTDOOR" });
  });

  it("extracts the Dr/Cr difference for a totals mismatch", () => {
    const info = classifyImportError("Voucher totals do not match! Dr: 20,394.00 Dr Cr: 20,395.00 Cr Diff: 1.00 Cr");
    assert.deepEqual(info.detail, { debit: 20394, credit: 20395, difference: 1 });
  });
});

describe("classifyImportOutcome", () => {
  it("returns undefined for a successful import", () => {
    const [r] = parsePostResponse("<RESPONSE><CREATED>1</CREATED><ERRORS>0</ERRORS><LASTVCHID>9</LASTVCHID></RESPONSE>");
    assert.equal(classifyImportOutcome(r), undefined);
  });

  it("classifies from LINEERROR and tags the source", () => {
    const [r] = parsePostResponse("<RESPONSE><LINEERROR>Ledger 'A' does not exist!</LINEERROR><ERRORS>1</ERRORS></RESPONSE>");
    const info = classifyImportOutcome(r);
    assert.equal(info?.code, ImportErrorCode.MASTER_MISSING);
    assert.equal(info?.source, "LINEERROR");
  });

  it("falls back to the import log text when LINEERROR is empty", () => {
    const [r] = parsePostResponse("<RESPONSE><LINEERROR/><ERRORS>1</ERRORS></RESPONSE>");
    const info = classifyImportOutcome(r, "Voucher totals do not match! Dr: 10.00 Dr Cr: 12.00 Cr Diff: 2.00 Cr");
    assert.equal(info?.code, ImportErrorCode.TOTALS_MISMATCH);
    assert.equal(info?.source, "IMPORT_LOG");
  });

  it("reports UNKNOWN with source NONE when neither LINEERROR nor a log is available", () => {
    const [r] = parsePostResponse("<RESPONSE><LINEERROR/><ERRORS>1</ERRORS></RESPONSE>");
    const info = classifyImportOutcome(r);
    assert.equal(info?.code, ImportErrorCode.UNKNOWN);
    assert.equal(info?.source, "NONE");
  });
});

describe("Tally.imp reader", () => {
  it("builds the log path for Windows and POSIX install folders", () => {
    assert.equal(importLogPath("C:\\Program Files\\TallyPrime"), "C:\\Program Files\\TallyPrime\\Tally.imp");
    assert.equal(importLogPath("/opt/tally"), join("/opt/tally", "Tally.imp"));
  });

  it("reads only what was appended after the mark", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tally-imp-"));
    const file = join(dir, "Tally.imp");
    try {
      writeFileSync(file, "old line 1\nold line 2\n");
      const mark = await importLogMark(file);
      assert.equal(mark, Buffer.byteLength("old line 1\nold line 2\n"));
      appendFileSync(file, "new error A\nnew error B\n");
      const text = await readImportLogSince(file, mark);
      assert.equal(text, "new error A\nnew error B\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns mark 0 and empty text when the file does not exist", async () => {
    const missing = join(tmpdir(), "definitely-not-there", "Tally.imp");
    assert.equal(await importLogMark(missing), 0);
    assert.equal(await readImportLogSince(missing, 0), "");
  });

  it("starts from the beginning when the file was truncated/rotated", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tally-imp-"));
    const file = join(dir, "Tally.imp");
    try {
      writeFileSync(file, "x".repeat(100));
      const mark = await importLogMark(file);
      writeFileSync(file, "fresh\n"); // Tally recreated the log, now smaller than the mark
      assert.equal(await readImportLogSince(file, mark), "fresh\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
