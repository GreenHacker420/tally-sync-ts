import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildExportCollectionXml, TallyClient } from "../src/index.js";
import type { TallyTransport } from "../src/transport.js";

// Live finding (TallyPrime 7.1): `FETCH *` on the Company object made Tally stop answering; named fields are instant.
describe("Company requests never ask Tally for every field", () => {
  it("the default Company fetch list is explicit and has no wildcard", () => {
    const xml = buildExportCollectionXml("Company");
    assert.doesNotMatch(xml, /<FETCH>\*<\/FETCH>/);
    assert.match(xml, /<FETCH>CompanyNumber<\/FETCH>/);
    assert.match(xml, /<FETCH>GUID<\/FETCH>/);
  });
  it("a caller-supplied wildcard is stripped for Company only", () => {
    const company = buildExportCollectionXml("Company", { fetchList: ["Name", "*"] });
    assert.doesNotMatch(company, /<FETCH>\*<\/FETCH>/); assert.match(company, /<FETCH>Name<\/FETCH>/);
    assert.match(buildExportCollectionXml("Ledger", { fetchList: ["Name", "*"] }), /<FETCH>\*<\/FETCH>/, "other types keep their behaviour");
  });
});

describe("TallyClient.getLoadedCompanies()", () => {
  const reply = `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION>
    <COMPANY NAME="DEMO TRADERS - (from 1-Apr-24)" RESERVEDNAME=""><GUID>ee6c3303-0000-0000-0000-e6ab01e5d2db</GUID><NAME TYPE="String">DEMO TRADERS - (from 1-Apr-24)</NAME><COMPANYNUMBER TYPE="String"> 100003</COMPANYNUMBER></COMPANY>
    <COMPANY NAME="SECOND CO"><GUID>aaaa</GUID><COMPANYNUMBER> 010009</COMPANYNUMBER></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>`;
  it("returns name, GUID and the data-folder number (trimmed) for every loaded company", async () => {
    const t: TallyTransport = { async send() { return reply; } };
    const cos = await new TallyClient({ transport: t }).getLoadedCompanies();
    assert.deepEqual(cos, [
      { name: "DEMO TRADERS - (from 1-Apr-24)", guid: "ee6c3303-0000-0000-0000-e6ab01e5d2db", number: "100003" },
      { name: "SECOND CO", guid: "aaaa", number: "010009" },
    ]);
  });
  it("sends a request with only the three named fields", async () => {
    let sent = ""; const t: TallyTransport = { async send(x) { sent = x; return reply; } };
    await new TallyClient({ transport: t }).getLoadedCompanies();
    assert.match(sent, /<FETCH>Name,GUID,CompanyNumber<\/FETCH>|<FETCH>Name<\/FETCH>[\s\S]*<FETCH>CompanyNumber<\/FETCH>/);
    assert.doesNotMatch(sent, /<FETCH>\*<\/FETCH>/);
  });
});
