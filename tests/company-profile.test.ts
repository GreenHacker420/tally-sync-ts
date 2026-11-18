import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanyProfile, classifyLedger, groupChain, suggestLedgerNames, discoverCompanyProfile, computeFingerprint, LedgerRole, QuestionCode, TaxNamingStatus,
  UnknownTaxLedgerError, TALLY_PRIME_DIALECT as D, buildSalesInvoice, TaxMode, TallyClient, TallyGate, FetchTallyTransport,
  type RawMasters, type RawLedger, type LineGst,
} from "../src/index.js";
import { startFakeTally } from "../src/testing/fakeTally.js";

const G = D.reservedGroups;
const baseGroups = [
  { name: G.sales, parent: "" }, { name: G.purchase, parent: "" }, { name: G.dutiesTaxes, parent: "" }, { name: "Current Assets", parent: "" },
  { name: G.debtors, parent: "Current Assets" }, { name: G.creditors, parent: "Current Assets" }, { name: G.cash, parent: "Current Assets" }, { name: G.bank, parent: "Current Assets" },
  { name: "Indirect Expenses", parent: "" },
];
const L = (name: string, parent: string, extra: Partial<RawLedger> = {}): RawLedger => ({ name, parent, ...extra });
const company = (ledgers: RawLedger[], over: Partial<RawMasters> = {}): RawMasters => ({
  company: { name: "CO-1", guid: "g-co", number: "100001", state: "STATE-X" }, groups: baseGroups, ledgers,
  voucherTypes: [{ name: "Retail Sales", parent: D.voucherTypes.sales, numberingMethod: "Auto Renumber" }], units: [{ name: "PCS", uqc: "NOS-NUMBERS" }], godowns: [], ...over,
});
const commonTax = [L("T-C", G.dutiesTaxes, { dutyHead: "CGST" }), L("T-S", G.dutiesTaxes, { dutyHead: "SGST/UTGST" }), L("T-I", G.dutiesTaxes, { dutyHead: "IGST" })];

describe("classifyLedger — by group ancestry and attributes, never by name", () => {
  const parents = new Map(baseGroups.filter((g) => g.parent).map((g) => [g.name.toLowerCase(), g.parent]));
  it("follows nested sub-groups up to the reserved group", () => {
    const p = new Map([...parents, ["wholesale debtors", G.debtors]]);
    assert.equal(classifyLedger(L("X", "Wholesale Debtors"), p), LedgerRole.DEBTOR);
    assert.deepEqual(groupChain("Wholesale Debtors", p), ["Wholesale Debtors", G.debtors, "Current Assets"]);
  });
  it("a ledger NAMED like a tax ledger but sitting elsewhere is not a tax ledger", () => {
    assert.equal(classifyLedger(L("CGST", "Indirect Expenses", { dutyHead: "CGST" }), parents), LedgerRole.OTHER);
    assert.equal(classifyLedger(L("Anything", G.dutiesTaxes, { dutyHead: "IGST" }), parents), LedgerRole.TAX_IGST);
  });
  it("a Duties & Taxes ledger without a recognised duty head is TAX_UNKNOWN (asks, never guesses)", () => {
    assert.equal(classifyLedger(L("Mystery", G.dutiesTaxes), parents), LedgerRole.TAX_UNKNOWN);
    assert.equal(classifyLedger(L("Mystery", G.dutiesTaxes, { dutyHead: "Whatever" }), parents), LedgerRole.TAX_UNKNOWN);
  });
  it("recognises cash, bank, creditor, purchase and sales roles", () => {
    for (const [group, role] of [[G.cash, "CASH"], [G.bank, "BANK"], [G.creditors, "CREDITOR"], [G.purchase, "PURCHASE"], [G.sales, "SALES"]] as const) assert.equal(classifyLedger(L("x", group), parents), role);
  });
});

describe("buildCompanyProfile", () => {
  const real = company([
    L("S-1", G.sales, { affectsStock: true }), ...commonTax, L("RND", "Indirect Expenses"), L("CASH-1", G.cash),
    L("D-1", G.debtors, { isBillWise: true }), L("D-2", G.debtors, { isBillWise: true }), L("D-3", G.debtors, { isBillWise: false }), L("C-1", G.creditors, { isBillWise: true }),
  ]);
  it("a company shaped like the live one: common tax ledgers, one stock-affecting sales ledger, no questions", () => {
    const p = buildCompanyProfile(real);
    assert.equal(p.taxNaming.status, TaxNamingStatus.COMMON);
    assert.deepEqual(p.taxNaming.naming, { mode: "COMMON", cgst: "T-C", sgst: "T-S", igst: "T-I" });
    assert.deepEqual(p.stockSalesLedgers, ["S-1"]); assert.equal(p.billWiseParties, 3); assert.equal(p.totalLedgers, 10);
    assert.equal(p.company.state, "STATE-X"); assert.equal(p.voucherTypes[0].numberingMethod, "Auto Renumber"); assert.deepEqual(p.godowns, []);
    assert.deepEqual(p.questions, []);
  });
  it("suggestLedgerNames fills sales + tax, leaves round-off to the owner unless chosen", () => {
    const p = buildCompanyProfile(real);
    assert.deepEqual(suggestLedgerNames(p).ledgers, { sales: "S-1", tax: p.taxNaming.naming });
    assert.equal(suggestLedgerNames(p, { roundOff: "RND" }).ledgers?.roundOff, "RND");
  });
  it("per-rate tax ledgers (each with its own rate) resolve by rate; an unknown rate is a typed error", () => {
    const p = buildCompanyProfile(company([L("S-1", G.sales, { affectsStock: true }),
      ...[900, 250].flatMap((bp) => [L(`C${bp}`, G.dutiesTaxes, { dutyHead: "CGST", rate: bp / 100 }), L(`S${bp}`, G.dutiesTaxes, { dutyHead: "SGST/UTGST", rate: bp / 100 })]),
      L("I1800", G.dutiesTaxes, { dutyHead: "IGST", rate: 18 }), L("I500", G.dutiesTaxes, { dutyHead: "IGST", rate: 5 })]));
    assert.equal(p.taxNaming.status, TaxNamingStatus.PER_RATE);
    const naming = p.taxNaming.naming!;
    assert.ok(naming.mode === "PER_RATE"); if (naming.mode === "PER_RATE") { assert.equal(naming.name("cgst", 900), "C900"); assert.equal(naming.name("igst", 500), "I500"); assert.throws(() => naming.name("cgst", 1200), UnknownTaxLedgerError); }
  });
  it("two sales ledgers => asks which; the stock-affecting one is the candidate when only one affects stock", () => {
    const two = buildCompanyProfile(company([L("S-A", G.sales, { affectsStock: true }), L("S-B", G.sales, { affectsStock: true }), ...commonTax]));
    assert.deepEqual(two.questions.map((q) => q.code), [QuestionCode.PICK_SALES_LEDGER]); assert.equal(suggestLedgerNames(two).ledgers, undefined);
    assert.equal(suggestLedgerNames(two, { sales: "S-B" }).ledgers?.sales, "S-B");
    const mixed = buildCompanyProfile(company([L("S-A", G.sales, { affectsStock: true }), L("S-SVC", G.sales, { affectsStock: false }), ...commonTax]));
    assert.deepEqual(mixed.questions, []); assert.equal(suggestLedgerNames(mixed).ledgers?.sales, "S-A");
  });
  it("no sales ledger, incomplete tax set, ambiguous tax ledgers and unknown heads each raise a specific question", () => {
    assert.deepEqual(buildCompanyProfile(company([...commonTax])).questions.map((q) => q.code), [QuestionCode.NO_SALES_LEDGER]);
    const incomplete = buildCompanyProfile(company([L("S-1", G.sales, { affectsStock: true }), commonTax[0], commonTax[1]]));
    assert.equal(incomplete.taxNaming.status, TaxNamingStatus.INCOMPLETE); assert.deepEqual(incomplete.taxNaming.missingHeads, ["igst"]);
    const amb = buildCompanyProfile(company([L("S-1", G.sales, { affectsStock: true }), ...commonTax, L("T-C2", G.dutiesTaxes, { dutyHead: "CGST" })]));
    assert.ok(amb.questions.some((q) => q.code === QuestionCode.TAX_LEDGER_AMBIGUOUS));
    const unk = buildCompanyProfile(company([L("S-1", G.sales, { affectsStock: true }), ...commonTax, L("Odd", G.dutiesTaxes)]));
    assert.ok(unk.questions.some((q) => q.code === QuestionCode.TAX_LEDGER_UNKNOWN_HEAD));
  });
  it("fingerprint is stable, order-independent, and changes when a master changes", () => {
    const a = company([L("S-1", G.sales, { alterId: 1 }), L("D-1", G.debtors, { alterId: 2 })]);
    const reordered = company([L("D-1", G.debtors, { alterId: 2 }), L("S-1", G.sales, { alterId: 1 })]);
    const changed = company([L("S-1", G.sales, { alterId: 9 }), L("D-1", G.debtors, { alterId: 2 })]);
    assert.equal(computeFingerprint(a), computeFingerprint(reordered)); assert.notEqual(computeFingerprint(a), computeFingerprint(changed));
  });
});

// ---- discovery against the fake Tally -----------------------------------------------------------
const coll = (items: string) => `<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION>${items}</COLLECTION></DATA></BODY></ENVELOPE>`;
const t = (tag: string, v: string | number | undefined) => (v === undefined ? "" : `<${tag}>${v}</${tag}>`);
const isType = (x: string, type: string) => x.includes(`<TYPE>${type}</TYPE>`);

describe("discoverCompanyProfile", () => {
  const rules = (companies: Array<{ name: string; guid: string; number: string }>) => [
    { when: (x: string) => isType(x, "Company") && x.includes("StateName"), reply: coll(companies.map((c) => `<COMPANY NAME="${c.name}">${t("NAME", c.name)}${t("GUID", c.guid)}${t("STATENAME", "STATE-X")}${t("BOOKSFROM", "20240401")}</COMPANY>`).join("")) },
    { when: (x: string) => isType(x, "Company"), reply: coll(companies.map((c) => `<COMPANY NAME="${c.name}">${t("NAME", c.name)}${t("GUID", c.guid)}${t("COMPANYNUMBER", ` ${c.number}`)}</COMPANY>`).join("")) },
    { when: (x: string) => isType(x, "Group"), reply: coll(baseGroups.map((g, i) => `<GROUP NAME="${g.name}">${t("NAME", g.name)}${t("PARENT", g.parent)}${t("GUID", `gg${i}`)}${t("ALTERID", i + 1)}</GROUP>`).join("")) },
    { when: (x: string) => isType(x, "Ledger"), reply: coll([L("S-1", G.sales, { affectsStock: true }), ...commonTax, L("D-1", G.debtors, { isBillWise: true })].map((l, i) => `<LEDGER NAME="${l.name}">${t("NAME", l.name)}${t("PARENT", l.parent)}${t("GUID", `lg${i}`)}${t("ALTERID", 10 + i)}${t("AFFECTSSTOCK", l.affectsStock ? "Yes" : undefined)}${t("GSTDUTYHEAD", l.dutyHead)}${t("ISBILLWISEON", l.isBillWise ? "Yes" : undefined)}</LEDGER>`).join("")) },
    { when: (x: string) => isType(x, "VoucherType"), reply: coll(`<VOUCHERTYPE NAME="Retail Sales">${t("NAME", "Retail Sales")}${t("PARENT", "Sales")}${t("NUMBERINGMETHOD", "Auto Renumber")}</VOUCHERTYPE>`) },
    { when: (x: string) => isType(x, "Unit"), reply: coll(`<UNIT NAME="PCS">${t("NAME", "PCS")}${t("GSTREPUOM", "NOS-NUMBERS")}</UNIT>`) },
    { when: (x: string) => isType(x, "Godown"), reply: coll("") },
  ];
  const withTally = async <R,>(companies: Array<{ name: string; guid: string; number: string }>, fn: (client: TallyClient, requests: string[]) => Promise<R>): Promise<R> => {
    const fake = await startFakeTally(rules(companies));
    try { return await fn(new TallyClient({ transport: new TallyGate(new FetchTallyTransport({ baseURL: "http://127.0.0.1", port: fake.port }), { timeoutMs: 5000 }) }), fake.requests); } finally { await fake.close(); }
  };

  it("reads the masters with explicit named fields only and builds the profile", async () => {
    await withTally([{ name: "CO-1", guid: "g-co", number: "100001" }], async (client, requests) => {
      const p = await discoverCompanyProfile(client, { now: () => "T" });
      assert.equal(p.company.number, "100001"); assert.equal(p.company.state, "STATE-X"); assert.equal(p.company.booksFrom, "20240401");
      assert.deepEqual(p.stockSalesLedgers, ["S-1"]); assert.equal(p.taxNaming.status, TaxNamingStatus.COMMON); assert.equal(p.billWiseParties, 1);
      assert.equal(p.voucherTypes[0].numberingMethod, "Auto Renumber"); assert.equal(p.units[0].uqc, "NOS-NUMBERS"); assert.equal(p.discoveredAt, "T");
      assert.ok(requests.length >= 7);
      for (const r of requests) assert.doesNotMatch(r, /<FETCH>\*<\/FETCH>/, "no wildcard fetch is ever sent");
    });
  });
  it("refuses to guess when several companies are loaded, and when none is", async () => {
    await withTally([{ name: "A", guid: "ga", number: "100001" }, { name: "B", guid: "gb", number: "100002" }], async (client) => {
      await assert.rejects(discoverCompanyProfile(client), /Several companies/);
      const p = await discoverCompanyProfile(client, { companyNumber: "100002" });
      assert.equal(p.company.name, "B");
    });
    await withTally([], async (client) => { await assert.rejects(discoverCompanyProfile(client), /No company is loaded/); });
  });
});

// ---- fuzz: random companies must never break the build/post path --------------------------------
describe("company-profile fuzzing: no hidden assumptions about names, layout or state", () => {
  let seed = 424242; const rnd = (n: number) => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed % n; };
  const word = () => Array.from({ length: 3 + rnd(8) }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789 /-&."[rnd(38)]).join("").trim() || "N";
  const uniq = (used: Set<string>): string => { let n = word(); while (used.has(n.toLowerCase())) n = word() + rnd(99); used.add(n.toLowerCase()); return n; };
  const slabs: LineGst[] = [1800, 1200, 500, 2800].map((igst) => ({ taxability: "Taxable", basisPoints: { cgst: igst / 2, sgst: igst / 2, igst, cess: 0 } }));

  it("300 random companies: profile builds, suggestions are consistent, and an invoice from them balances using only profile names", () => {
    let built = 0;
    for (let n = 0; n < 300; n++) {
      const used = new Set<string>(); const nest = rnd(3); const groups = [...baseGroups]; let salesGroup: string = G.sales; let taxGroup: string = G.dutiesTaxes;
      for (let i = 0; i < nest; i++) { const sg = uniq(used); groups.push({ name: sg, parent: salesGroup }); salesGroup = sg; const tg = uniq(used); groups.push({ name: tg, parent: taxGroup }); taxGroup = tg; }
      const perRate = rnd(2) === 1; const ledgers: RawLedger[] = [L(uniq(used), salesGroup, { affectsStock: true })];
      if (rnd(3) === 0) ledgers.push(L(uniq(used), salesGroup, { affectsStock: false }));
      if (perRate) for (const s of slabs) for (const [h, rate] of [["CGST", s.basisPoints.cgst], ["SGST/UTGST", s.basisPoints.sgst], ["IGST", s.basisPoints.igst]] as const) ledgers.push(L(uniq(used), taxGroup, { dutyHead: h, rate: rate / 100 }));
      else for (const h of ["CGST", "SGST/UTGST", "IGST"]) ledgers.push(L(uniq(used), taxGroup, { dutyHead: h }));
      const roundOff = uniq(used); ledgers.push(L(roundOff, "Indirect Expenses"));
      for (let i = 0; i < rnd(5); i++) ledgers.push(L(uniq(used), [G.debtors, G.cash, G.bank, G.creditors][rnd(4)], { isBillWise: rnd(2) === 1 }));
      const profile = buildCompanyProfile(company(ledgers, { groups, company: { name: uniq(used), guid: "g", number: "1" + String(rnd(99999)).padStart(5, "0"), state: uniq(used) } }));
      assert.ok([TaxNamingStatus.COMMON, TaxNamingStatus.PER_RATE].includes(profile.taxNaming.status), `n=${n} status ${profile.taxNaming.status}`);
      const sug = suggestLedgerNames(profile, { sales: profile.stockSalesLedgers[0], roundOff });
      assert.ok(sug.ledgers, `n=${n} no suggestion`); built++;
      const known = new Set(ledgers.map((l) => l.name));
      const party = uniq(used);
      const lines = Array.from({ length: 1 + rnd(5) }, () => ({ itemName: word(), quantity: String(1 + rnd(5)), unit: "U", amountPaise: 100 + rnd(900_000), gst: slabs[rnd(slabs.length)] }));
      const out = buildSalesInvoice({ idempotencyKey: `k${n}`, date: "20261118", party: { name: party }, placeOfSupply: rnd(2) ? profile.company.state! : "OTHER-STATE", companyState: profile.company.state!, lines, taxMode: rnd(2) ? TaxMode.INCLUSIVE : TaxMode.EXCLUSIVE, roundTotalToRupee: rnd(2) === 1, ledgers: sug.ledgers! });
      assert.equal(out.entries.reduce((s, e) => s + e.amountPaise, 0) + out.tax.lines.reduce((s, l) => s + l.taxablePaise, 0), 0, `n=${n} unbalanced`);
      for (const e of out.entries) assert.ok(e.ledger === party || known.has(e.ledger), `n=${n} used a ledger the profile did not provide: ${e.ledger}`);
    }
    assert.equal(built, 300);
  });
});
