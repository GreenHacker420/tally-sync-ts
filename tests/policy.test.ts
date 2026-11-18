import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePolicy, explainPolicy, policyDefault, policyNumber, POLICY_DEFS, TallyGate, type TallyTransport } from "../src/index.js";

describe("policy registry", () => {
  it("every key declares a unit-bearing default inside its own bounds and a description", () => {
    for (const d of POLICY_DEFS) {
      assert.ok(d.description.length > 10, d.key);
      if (d.kind === "int") { assert.ok(Number.isInteger(d.default), d.key); assert.ok(d.min !== undefined && d.max !== undefined, `${d.key} needs bounds`); assert.ok((d.default as number) >= d.min! && (d.default as number) <= d.max!, d.key); assert.ok(d.unit, `${d.key} needs a unit`); }
    }
  });

  it("resolves defaults with provenance when no layer is given", () => {
    const r = resolvePolicy();
    assert.equal(r.values["gate.timeoutMs"], policyDefault("gate.timeoutMs"));
    assert.deepEqual(r.provenance["gate.timeoutMs"], { layer: "default" });
    assert.deepEqual(r.problems, []);
  });

  it("higher layers win regardless of the order they are passed in, and provenance records who set it", () => {
    const r = resolvePolicy([
      { name: "company", values: { "gate.timeoutMs": 60_000 }, by: "owner-1", at: "2026-11-18" },
      { name: "tenant", values: { "gate.timeoutMs": 45_000, "gate.cooldownMs": 20_000 } },
      { name: "document", values: {} },
    ]);
    assert.equal(r.values["gate.timeoutMs"], 60_000);
    assert.equal(r.values["gate.cooldownMs"], 20_000);
    assert.equal(explainPolicy(r, "gate.timeoutMs"), "gate.timeoutMs = 60000 (company, by owner-1 at 2026-11-18)");
    assert.equal(explainPolicy(r, "gate.cooldownMs"), "gate.cooldownMs = 20000 (tenant)");
  });

  it("an invalid value never breaks the engine: it is reported and the next lower layer wins", () => {
    const r = resolvePolicy([
      { name: "tenant", values: { "gate.timeoutMs": 45_000 } },
      { name: "shop", values: { "gate.timeoutMs": 5, "gate.failureThreshold": "many", "nope.key": 1, "gate.probeTimeoutMs": 1.5 } },
    ]);
    assert.equal(r.values["gate.timeoutMs"], 45_000, "out-of-range shop value is ignored");
    assert.equal(r.values["gate.failureThreshold"], policyDefault("gate.failureThreshold"));
    assert.deepEqual(r.problems.map((p) => [p.key, p.code]).sort(), [["gate.failureThreshold", "WRONG_TYPE"], ["gate.probeTimeoutMs", "WRONG_TYPE"], ["gate.timeoutMs", "OUT_OF_RANGE"], ["nope.key", "UNKNOWN_KEY"]]);
  });

  it("TallyGate.fromPolicy applies the resolved tunables (company layer changes the hang timeout)", async () => {
    const hung: TallyTransport = { send: () => new Promise<string>(() => {}) };
    const policy = resolvePolicy([{ name: "company", values: { "gate.timeoutMs": 1_000, "gate.cooldownMs": 1_000 } }]);
    assert.equal(policyNumber(policy, "gate.timeoutMs"), 1_000);
    const gate = TallyGate.fromPolicy(hung, policy);
    const started = Date.now();
    await assert.rejects(gate.send("<x/>"));
    const waited = Date.now() - started;
    assert.ok(waited >= 900 && waited < 5_000, `waited ${waited}ms, expected ~1000ms not the 30s default`);
  });
});

import { policyRegistryJson } from "../src/index.js";
import { readFileSync } from "node:fs";
describe("policy registry export", () => {
  it("policy-registry.json matches the registry (regenerate with npm run export:policy)", () => {
    const committed = JSON.parse(readFileSync(new URL("../policy-registry.json", import.meta.url), "utf8"));
    assert.deepEqual(committed, policyRegistryJson());
  });
});
