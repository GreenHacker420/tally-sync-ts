import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePostResponse } from "../src/xmlParser.js";

// Reply shapes are taken from Tally's documented import responses
// (TallyHelp "Sample XML" / "Case Study 1") and field reports:
// the root element is <RESPONSE>, not <ENVELOPE>.

const response = (inner: string) => `<RESPONSE>${inner}</RESPONSE>`;

const counters = (o: Partial<Record<string, number>> = {}) => {
  const c = { CREATED: 0, ALTERED: 0, DELETED: 0, LASTVCHID: 0, LASTMID: 0, COMBINED: 0, IGNORED: 0, ERRORS: 0, CANCELLED: 0, ...o };
  return Object.entries(c).map(([k, v]) => `<${k}>${v}</${k}>`).join("");
};

describe("parsePostResponse - real <RESPONSE> root", () => {
  it("reports success for a created voucher and uses LASTVCHID as the master id", () => {
    const [r] = parsePostResponse(response(counters({ CREATED: 1, LASTVCHID: 119 })));
    assert.equal(r.status, "success");
    assert.equal(r.created, 1);
    assert.equal(r.errors, 0);
    assert.equal(r.lastVchId, 119);
    assert.equal(r.masterId, 119, "LASTMID is always 0 for voucher imports; must not mask LASTVCHID");
  });

  it("reports success for an altered voucher", () => {
    const [r] = parsePostResponse(response(counters({ ALTERED: 1, LASTVCHID: 55 })));
    assert.equal(r.status, "success");
    assert.equal(r.altered, 1);
    assert.equal(r.masterId, 55);
  });

  it("reports success for a cancelled voucher", () => {
    const [r] = parsePostResponse(response(counters({ CANCELLED: 1, LASTVCHID: 55 })));
    assert.equal(r.status, "success");
    assert.equal(r.cancelled, 1);
  });

  it("uses LASTMID for master imports when LASTVCHID is 0", () => {
    const [r] = parsePostResponse(response(counters({ CREATED: 2, LASTMID: 77 })));
    assert.equal(r.status, "success");
    assert.equal(r.masterId, 77);
  });

  it("reports failure with the Tally error text and counters", () => {
    const text = "Voucher totals do not match! Dr: 20,394.00 Dr Cr: 20,395.00 Cr Diff: 1.00 Cr";
    const [r] = parsePostResponse(response(`<LINEERROR>${text}</LINEERROR>` + counters({ ERRORS: 1 })));
    assert.equal(r.status, "failure");
    assert.equal(r.errors, 1);
    assert.equal(r.created, 0);
    assert.deepEqual(r.lineErrors, [text]);
    assert.equal(r.message, text);
    assert.equal(r.needsImportLog, undefined);
  });

  it("collects several LINEERROR entries", () => {
    const [r] = parsePostResponse(
      response(`<LINEERROR>First problem</LINEERROR><LINEERROR>Second problem</LINEERROR>` + counters({ ERRORS: 2 })),
    );
    assert.equal(r.status, "failure");
    assert.deepEqual(r.lineErrors, ["First problem", "Second problem"]);
    assert.equal(r.message, "First problem; Second problem");
  });

  it("treats ERRORS>0 with an EMPTY LINEERROR as a failure that needs the import log (TallyPrime 3.0+)", () => {
    const [r] = parsePostResponse(response(`<LINEERROR/>` + counters({ ERRORS: 1 })));
    assert.equal(r.status, "failure");
    assert.equal(r.errors, 1);
    assert.equal(r.needsImportLog, true);
    assert.equal(r.lineErrors, undefined);
    assert.match(r.message, /Tally\.imp/);
  });

  it("does not report success when nothing was applied and errors are present", () => {
    const [r] = parsePostResponse(response(counters({ IGNORED: 1, ERRORS: 1 })));
    assert.equal(r.status, "failure");
  });

  it("keeps IGNORED and COMBINED counters", () => {
    const [r] = parsePostResponse(response(counters({ IGNORED: 2, COMBINED: 1 })));
    assert.equal(r.status, "success");
    assert.equal(r.ignored, 2);
    assert.equal(r.combined, 1);
  });

  it("handles a RESPONSE wrapped inside an ENVELOPE body", () => {
    const xml = `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DATA>${response(counters({ CREATED: 1, LASTVCHID: 7 }))}</DATA></BODY></ENVELOPE>`;
    const [r] = parsePostResponse(xml);
    assert.equal(r.status, "success");
    assert.equal(r.masterId, 7);
  });

  it("tolerates whitespace and the optional XML declaration", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<RESPONSE>\n  <CREATED>1</CREATED>\n  <ERRORS>0</ERRORS>\n  <LASTVCHID> 12 </LASTVCHID>\n</RESPONSE>`;
    const [r] = parsePostResponse(xml);
    assert.equal(r.status, "success");
    assert.equal(r.masterId, 12);
  });

  it("returns a clear failure for a non-import reply", () => {
    const [r] = parsePostResponse("<HTML>not tally</HTML>");
    assert.equal(r.status, "failure");
    assert.match(r.message, /Unrecognised Tally import response/);
  });

  it("returns a clear failure for an empty reply", () => {
    const [r] = parsePostResponse("");
    assert.equal(r.status, "failure");
  });
});

describe("parsePostResponse - legacy shapes keep working", () => {
  it("ENVELOPE/BODY/DATA/IMPORTRESULT", () => {
    const xml = `<ENVELOPE><BODY><DATA><IMPORTRESULT><CREATED>1</CREATED><LASTVCHID>2045</LASTVCHID></IMPORTRESULT></DATA></BODY></ENVELOPE>`;
    const [r] = parsePostResponse(xml);
    assert.equal(r.status, "success");
    assert.equal(r.masterId, 2045);
    assert.equal(r.message, "Created successfully");
  });

  it("ENVELOPE with a bare LINEERROR", () => {
    const xml = `<ENVELOPE><BODY><DATA><LINEERROR>Ledger 'X' already exists!</LINEERROR></DATA></BODY></ENVELOPE>`;
    const [r] = parsePostResponse(xml);
    assert.equal(r.status, "failure");
    assert.equal(r.message, "Ledger 'X' already exists!");
  });
});
