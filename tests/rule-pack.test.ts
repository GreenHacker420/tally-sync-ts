import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { compileRulePack, RulePackError, signPack, verifyPack, loadSignedPack, canonicalJson, QuarantineLog, messageTemplate, classifyImportError, ImportErrorCode, ImportErrorClass, TALLY_PRIME_IMPORT_RULES } from "../src/index.js";
import type { RulePackData } from "../src/index.js";

const keys = () => { const { publicKey, privateKey } = generateKeyPairSync("ed25519"); return { pub: publicKey.export({ type: "spki", format: "pem" }).toString(), priv: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }; };
const pack = (over: Partial<RulePackData> = {}): RulePackData => ({ family: "t", version: 2, rules: [{ id: "a", code: "STOCK_NEGATIVE", class: "PERMANENT", pattern: "negative stock", flags: "i" }], ...over });

describe("rule packs are validated data", () => {
  it("the built-in pack compiles", () => assert.ok(compileRulePack(TALLY_PRIME_IMPORT_RULES).rules.length >= 6));

  it("reports every problem at once", () => {
    const bad = pack({ rules: [
      { id: "x", code: "C", class: "PERMANENT", pattern: "(" },
      { id: "x", code: "C", class: "WHENEVER" as never, pattern: "ok" },
      { id: "y", code: "C", class: "PERMANENT", pattern: "ok", flags: "g" },
      { id: "z", code: "C", class: "PERMANENT", pattern: "(a)", detail: { kind: "master", kindGroup: 1, nameGroup: 2 } },
      { id: "w", code: "C", class: "PERMANENT", pattern: "a".repeat(601) },
    ] });
    assert.throws(() => compileRulePack(bad), (e: unknown) => e instanceof RulePackError && e.problems.length >= 5);
  });

  it("a new error class needs only a data change", () => {
    const compiled = compileRulePack(pack());
    const info = classifyImportError("Negative stock is not allowed for 'ITEM'", "LINEERROR", { pack: compiled });
    assert.equal(info.code, "STOCK_NEGATIVE");
    assert.equal(classifyImportError("Negative stock", "LINEERROR").code, ImportErrorCode.UNKNOWN);
  });

  it("reads detail by group index", () => {
    const info = classifyImportError("Ledger 'ACME' does not exist!");
    assert.deepEqual(info.detail, { masterKind: "Ledger", masterName: "ACME" });
    assert.equal(info.class, ImportErrorClass.PERMANENT);
  });
});

describe("signed delivery", () => {
  it("accepts a good signature and rejects tampering, wrong key, and rollback", () => {
    const k = keys(), other = keys(); const signed = signPack(pack(), k.priv);
    assert.equal(verifyPack(signed, k.pub), true);
    assert.equal(verifyPack(signed, other.pub), false);
    assert.equal(verifyPack({ ...signed, data: pack({ version: 3 }) }, k.pub), false);
    assert.equal(loadSignedPack(signed, k.pub, 1).version, 2);
    assert.throws(() => loadSignedPack(signed, k.pub, 2), /not newer/);
    assert.throws(() => loadSignedPack({ ...signed, signature: "AAAA" }, k.pub), /signature/);
  });
  it("signature does not depend on key order", () => assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), canonicalJson({ a: [{ c: 2, d: 1 }], b: 1 })));
});

describe("quarantine", () => {
  it("groups one unknown message across names and numbers, bounded", () => {
    assert.equal(messageTemplate("Item 'A' qty 5,000.50 is bad"), messageTemplate("Item 'B' qty 7 is bad"));
    const q = new QuarantineLog(2);
    classifyImportError("Weird thing 'A' 1", "LINEERROR", { quarantine: q });
    classifyImportError("Weird thing 'B' 2", "LINEERROR", { quarantine: q });
    assert.equal(q.list().length, 1);
    assert.equal(q.list()[0].count, 2);
    for (const t of ["one", "two", "three"]) q.record(t);
    assert.ok(q.list().length <= 2);
  });
  it("known messages are not quarantined", () => {
    const q = new QuarantineLog();
    classifyImportError("Ledger 'X' does not exist!", "LINEERROR", { quarantine: q });
    assert.equal(q.list().length, 0);
  });
});
