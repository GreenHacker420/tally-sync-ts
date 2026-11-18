/** LIVE, READ-ONLY: discover the company profile, learn the Sales blueprint, resolve ledger names. Needs TALLY_LIVE_URL. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TallyClient, TallyGate, FetchTallyTransport, discoverCompanyProfile, learnVoucherBlueprint, learnLedgerNames, monthWindows } from "../../src/index.js";

const url = process.env.TALLY_LIVE_URL;
const skip = url ? false : "set TALLY_LIVE_URL to run live read-only checks";

describe("live: profile + blueprint (read-only)", { skip }, () => {
  it("resolves the company's ledger names from its own vouchers", async () => {
    const u = new URL(url!);
    const client = new TallyClient({ transport: new TallyGate(new FetchTallyTransport({ baseURL: `${u.protocol}//${u.hostname}`, port: Number(u.port || 9000), timeoutMinutes: 1 }), { timeoutMs: 90_000 }) });
    const profile = await discoverCompanyProfile(client);
    assert.ok(profile.company.name);
    const end = new Date(); const to = `${end.getFullYear()}${String(end.getMonth() + 1).padStart(2, "0")}31`;
    const from = `${end.getFullYear() - 1}0101`;
    let sample: Record<string, unknown>[] = [];
    for (const w of monthWindows(from, to).reverse()) { sample = sample.concat(await client.getRawVoucherWindow(w, { voucherType: "Sales" })); if (sample.length >= 100) break; }
    assert.ok(sample.length > 0, "no Sales vouchers found to learn from");
    const bp = learnVoucherBlueprint(sample);
    const names = learnLedgerNames(profile, bp);
    console.log("  learned:", JSON.stringify(names.provenance), "questions:", names.questions.map((q) => q.code).join(","));
    assert.ok(names.ledgers, "ledger names should resolve from usage");
    assert.equal(bp.partyFirstFraction, 1);
  });
});
