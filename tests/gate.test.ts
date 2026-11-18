import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TallyGate, GatePriority, TallyCircuitOpenError, TallyTimeoutError, RecordingTransport, FetchTallyTransport, TallyClient } from "../src/index.js";
import type { TallyTransport } from "../src/transport.js";
import { startFakeTally } from "../src/testing/fakeTally.js";

const deferred = <T>() => {
  let resolve!: (v: T) => void; let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("TallyGate", () => {
  it("allows only ONE request in flight and answers in priority order (write > light > heavy)", async () => {
    const order: string[] = []; let inFlight = 0; let maxInFlight = 0;
    const gates = [deferred<string>()];
    const inner: TallyTransport = {
      async send(xml) {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        order.push(xml);
        if (xml === "first") await gates[0].promise;
        inFlight--; return `ok:${xml}`;
      },
    };
    const gate = new TallyGate(inner, { timeoutMs: 1000 });
    const first = gate.sendWithPriority("first", "t", GatePriority.HEAVY_READ);
    const heavy = gate.sendWithPriority("heavy", "t", GatePriority.HEAVY_READ);
    const write = gate.sendWithPriority("write", "t", GatePriority.WRITE);
    const light = gate.sendWithPriority("light", "t", GatePriority.LIGHT_READ);
    gates[0].resolve("go");
    await Promise.all([first, heavy, write, light]);
    assert.deepEqual(order, ["first", "write", "light", "heavy"]);
    assert.equal(maxInFlight, 1);
  });

  it("times out a hung Tally, opens the circuit, and then fails fast instead of piling up requests", async () => {
    let calls = 0;
    const inner: TallyTransport = { send: () => { calls++; return new Promise<string>(() => {}); } };
    let t = 0;
    const gate = new TallyGate(inner, { timeoutMs: 20, cooldownMs: 1000, now: () => t });
    await assert.rejects(gate.send("a"), TallyTimeoutError);
    assert.equal(gate.state, "OPEN");
    await assert.rejects(gate.send("b"), TallyCircuitOpenError);
    assert.equal(calls, 1, "the hung Tally must not receive a second request");
  });

  it("half-opens after the cooldown, lets one probe through, and closes again on success", async () => {
    let healthy = false; let t = 0;
    const inner: TallyTransport = { send: () => (healthy ? Promise.resolve("<ok/>") : new Promise<string>(() => {})) };
    const gate = new TallyGate(inner, { timeoutMs: 10, cooldownMs: 100, now: () => t });
    await assert.rejects(gate.send("x"), TallyTimeoutError);
    t = 150; healthy = true;
    assert.equal(gate.state, "HALF_OPEN");
    assert.equal(await gate.send("probe"), "<ok/>");
    assert.equal(gate.state, "CLOSED");
  });

  it("half-open sends ONLY a light probe; a still-busy Tally never receives the caller's heavy request", async () => {
    const sent: string[] = []; let t = 0;
    const busyInner: TallyTransport = { send: (xml) => { sent.push(xml); return new Promise<string>(() => {}); } };
    const gate = new TallyGate(busyInner, { timeoutMs: 10, probeTimeoutMs: 10, cooldownMs: 100, now: () => t });
    await assert.rejects(gate.send("<seed/>"), TallyTimeoutError); // Tally is now busy / hung
    sent.length = 0; t = 1000;                                       // cooldown elapsed -> HALF_OPEN
    await assert.rejects(gate.send("<HEAVY-REPORT/>"), TallyCircuitOpenError);
    assert.ok(sent.every((x) => !x.includes("HEAVY-REPORT")), "the heavy request must never reach a busy Tally");
    assert.equal(sent.length, 1, "exactly one light probe");
    assert.match(sent[0], /\$\$CurrentSimpleCompany/);
    assert.equal(gate.state, "OPEN", "a failed probe re-opens the circuit");
  });

  it("half-open: once the probe answers, the caller's request is forwarded and the circuit closes", async () => {
    const sent: string[] = []; let healthy = false; let t = 0;
    const inner: TallyTransport = { send: (xml) => { sent.push(xml); return healthy ? Promise.resolve("<ok/>") : new Promise<string>(() => {}); } };
    const gate = new TallyGate(inner, { timeoutMs: 10, probeTimeoutMs: 10, cooldownMs: 100, now: () => t });
    await assert.rejects(gate.send("<seed/>"), TallyTimeoutError);
    t = 500; healthy = true; sent.length = 0;
    assert.equal(await gate.send("<real/>"), "<ok/>");
    assert.equal(sent.length, 2); assert.match(sent[0], /CurrentSimpleCompany/); assert.equal(sent[1], "<real/>");
    assert.equal(gate.state, "CLOSED");
  });

  it("opens the circuit after repeated connection failures", async () => {
    const inner: TallyTransport = { send: async () => { throw new Error("Failed to connect to Tally on x"); } };
    const gate = new TallyGate(inner, { failureThreshold: 2, cooldownMs: 1000, now: () => 0 });
    await assert.rejects(gate.send("1"));
    assert.equal(gate.state, "CLOSED");
    await assert.rejects(gate.send("2"));
    assert.equal(gate.state, "OPEN");
  });
});

describe("RecordingTransport", () => {
  it("keeps a bounded ring buffer and redacts GSTIN, PAN, email, phone and passwords", async () => {
    const inner: TallyTransport = { send: async () => "<R><PARTYGSTIN>23ACGPH7875L1Z6</PARTYGSTIN><EMAIL>a.b@shop.in</EMAIL></R>" };
    const rec = new RecordingTransport(inner, { capacity: 2 });
    await rec.send("<PASSWORD>secret</PASSWORD><LEDGERMOBILE>+91 9876543210</LEDGERMOBILE> ABCDE1234F", "a");
    await rec.send("b", "b"); await rec.send("c", "c");
    const dump = rec.dump();
    assert.equal(dump.length, 2);
    assert.deepEqual(dump.map((d) => d.requestType), ["b", "c"]);
    const first = new RecordingTransport(inner);
    await first.send("<PASSWORD>secret</PASSWORD><LEDGERMOBILE>+91 9876543210</LEDGERMOBILE> ABCDE1234F", "a");
    const [e] = first.dump();
    assert.doesNotMatch(e.request, /secret|9876543210|ABCDE1234F/);
    assert.doesNotMatch(e.response ?? "", /23ACGPH7875L1Z6|a\.b@shop\.in/);
    assert.match(e.response ?? "", /\{GSTIN\}/);
  });
});

describe("fake Tally server + gate over real HTTP", () => {
  it("answers banner, scripted rules and Tally's DESC-not-found for unknown requests", async () => {
    const fake = await startFakeTally([{ when: "$$CurrentSimpleCompany", reply: "<RESULT>ACME</RESULT>" }]);
    try {
      const transport = new FetchTallyTransport({ baseURL: "http://127.0.0.1", port: fake.port });
      assert.equal(await transport.send("<x>$$CurrentSimpleCompany</x>"), "<RESULT>ACME</RESULT>");
      assert.match(await transport.send("<unknown/>"), /DESC not found/);
      assert.equal(fake.requests.length, 2);
    } finally { await fake.close(); }
  });

  it("reproduces the live hang: Tally accepts the connection but never answers; the gate protects us", async () => {
    const fake = await startFakeTally([{ when: "Licence", reply: "", hang: true }]);
    try {
      const gate = new TallyGate(new FetchTallyTransport({ baseURL: "http://127.0.0.1", port: fake.port, timeoutMinutes: 1 }), { timeoutMs: 150, cooldownMs: 5000 });
      await assert.rejects(gate.send("<Licence/>"), TallyTimeoutError);
      await assert.rejects(gate.send("<anything/>"), TallyCircuitOpenError);
      assert.equal(fake.requests.length, 1, "only the first request ever reached Tally");
    } finally { await fake.close(); }
  });
});
