import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TallyClient, FetchTallyTransport } from "../src/index.js";
import type { TallyTransport } from "../src/transport.js";
import { startFakeTally } from "../src/testing/fakeTally.js";

const transportReturning = (xml: string | Error): TallyTransport => ({
  async send() {
    if (xml instanceof Error) throw xml;
    return xml;
  },
});

// Shapes copied from a live TallyPrime 7.1 (and its error reply for a malformed request).
const LIVE_OK = `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS><PRODMAJORVER>1</PRODMAJORVER><PRODMINORVER>1</PRODMINORVER><PRODMAJORREL>7</PRODMAJORREL><PRODMINORREL>1</PRODMINORREL><PRODTYPE>5</PRODTYPE></HEADER>
<BODY><DESC><CMPINFO><COMPANY>1</COMPANY></CMPINFO></DESC><DATA><RESULT TYPE="String">DEMO TRADERS - (from 1-Apr-24)</RESULT></DATA></BODY></ENVELOPE>`;
const LIVE_DESC_NOT_FOUND = `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>0</STATUS></HEADER><BODY><DATA>DESC not found</DATA></BODY></ENVELOPE>`;
const NO_COMPANY = `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS><PRODMAJORREL>7</PRODMAJORREL><PRODMINORREL>1</PRODMINORREL></HEADER><BODY><DATA><RESULT TYPE="String"></RESULT></DATA></BODY></ENVELOPE>`;

describe("TallyClient.check() / getActiveCompany()", () => {
  it("is true and returns the company when Tally answers with a RESULT", async () => {
    const client = new TallyClient({ transport: transportReturning(LIVE_OK) });
    assert.equal(await client.check(), true);
    assert.equal(await client.getActiveCompany(), "DEMO TRADERS - (from 1-Apr-24)");
  });

  it("does NOT mistake Tally's 'DESC not found' error body for a company name (live bug)", async () => {
    const client = new TallyClient({ transport: transportReturning(LIVE_DESC_NOT_FOUND) });
    assert.equal(await client.getActiveCompany(), "");
    assert.equal(await client.check(), false);
  });

  it("is false when no company is loaded", async () => {
    const client = new TallyClient({ transport: transportReturning(NO_COMPANY) });
    assert.equal(await client.check(), false);
  });

  it("is false (and does not throw) when Tally is unreachable", async () => {
    const client = new TallyClient({ transport: transportReturning(new Error("connect ECONNREFUSED")) });
    assert.equal(await client.check(), false);
  });
});

describe("TallyClient.detectCapabilities()", () => {
  it("reads the release from the reply header (7.1 -> Prime 3+ tag set)", async () => {
    const client = new TallyClient({ transport: transportReturning(LIVE_OK) });
    assert.deepEqual(await client.detectCapabilities(), {
      product: "TALLYPRIME",
      release: { major: 7, minor: 1 },
      companyLoaded: true,
      activeCompany: "DEMO TRADERS - (from 1-Apr-24)",
      gstTagSet: "PRIME_3_PLUS",
      defaultNumbering: "AUTOMATIC_RETAIN",
    });
  });

  it("reports a legacy/unknown product when the header has no release", async () => {
    const legacy = `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DATA><RESULT>OLD CO</RESULT></DATA></BODY></ENVELOPE>`;
    const caps = await new TallyClient({ transport: transportReturning(legacy) }).detectCapabilities();
    assert.equal(caps.product, "UNKNOWN");
    assert.equal(caps.gstTagSet, "LEGACY");
  });

  it("works end to end over HTTP against the fake Tally and sends a well-formed request (BODY/DESC present)", async () => {
    const fake = await startFakeTally([{ when: "$$CurrentSimpleCompany", reply: LIVE_OK }]);
    try {
      const client = new TallyClient({ transport: new FetchTallyTransport({ baseURL: "http://127.0.0.1", port: fake.port }) });
      assert.equal((await client.detectCapabilities()).release?.major, 7);
      assert.match(fake.requests[0], /<BODY>[\s\S]*<DESC>/, "a bare request without BODY/DESC makes Tally answer 'DESC not found'");
      assert.match(fake.requests[0], /<TYPE>FUNCTION<\/TYPE>/);
    } finally { await fake.close(); }
  });
});
