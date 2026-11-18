import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LatencyTracker, DecisionLog, adaptiveTimeoutMs, windowVouchers, AimdBatch, retryDelayMs, parseSchedule, resolvePolicy, fromPolicy, policyDefault } from "../src/index.js";

describe("latency + adaptive timeout", () => {
  it("percentiles over the retained window", () => {
    const t = new LatencyTracker(5); [10, 20, 30, 40, 50, 999].forEach((x) => t.add(x));
    assert.equal(t.count, 5);
    assert.equal(t.percentile(50), 40);
    assert.equal(t.percentile(100), 999);
    assert.equal(new LatencyTracker().percentile(95), undefined);
    t.add(NaN); t.add(-1); assert.equal(t.count, 5);
  });
  it("uses the ceiling until enough samples, then p95 x factor within [floor, ceiling]", () => {
    const t = new LatencyTracker(); const log = new DecisionLog();
    for (let i = 0; i < 19; i++) t.add(1000);
    assert.equal(adaptiveTimeoutMs(t, 30_000), 30_000);
    t.add(1000);
    assert.equal(adaptiveTimeoutMs(t, 30_000, fromPolicy(), log, 30_000), 3000);
    assert.equal(log.list().length, 1);
    const fast = new LatencyTracker(); for (let i = 0; i < 30; i++) fast.add(10);
    assert.equal(adaptiveTimeoutMs(fast, 30_000), policyDefault("adaptive.timeoutFloorMs"));
    const slow = new LatencyTracker(); for (let i = 0; i < 30; i++) slow.add(40_000);
    assert.equal(adaptiveTimeoutMs(slow, 30_000), 30_000);
  });
  it("honours a company policy override", () => {
    const p = resolvePolicy([{ name: "company", values: { "adaptive.timeoutFactor": 5 } }]);
    const t = new LatencyTracker(); for (let i = 0; i < 30; i++) t.add(1000);
    assert.equal(adaptiveTimeoutMs(t, 60_000, fromPolicy(p)), 5000);
  });
});

describe("window sizing", () => {
  it("fits the target from measured cost, falls back to the estimate", () => {
    assert.equal(windowVouchers(undefined), Math.floor(policyDefault("sync.windowTargetMs") / policyDefault("sync.msPerVoucherEstimate")));
    assert.equal(windowVouchers(20), 100);
    assert.equal(windowVouchers(1e9), 1);
  });
});

describe("AIMD batch under a simulated Tally", () => {
  const simulate = (perVoucherMs: number, baseMs: number, rounds: number, failAbove = Infinity) => {
    const log = new DecisionLog(1000); const aimd = new AimdBatch(fromPolicy(), log); const sizes: number[] = []; const elapsedAll: number[] = [];
    for (let i = 0; i < rounds; i++) {
      const n = aimd.current; const elapsed = baseMs + n * perVoucherMs; sizes.push(n); elapsedAll.push(elapsed);
      aimd.report({ ok: n <= failAbove, elapsedMs: elapsed });
    }
    return { sizes, elapsedAll, aimd, log };
  };
  it("grows on a fast Tally up to the maximum", () => {
    const { aimd } = simulate(1, 50, 100);
    assert.equal(aimd.current, policyDefault("batch.max"));
  });
  it("on a slow Tally settles where an import stays near the window target, never below the minimum", () => {
    const target = policyDefault("sync.windowTargetMs");
    const { sizes, elapsedAll, aimd } = simulate(100, 200, 200);
    assert.ok(aimd.current >= policyDefault("batch.min"));
    const tail = elapsedAll.slice(-50);
    const worst = Math.max(...tail);
    assert.ok(worst <= target * 2 + 100 * policyDefault("batch.growBy"), `worst import ${worst} ms against target ${target}`);
    assert.ok(Math.max(...sizes.slice(-50)) > 1, "should not collapse to the minimum");
  });
  it("backs off on failure and records why", () => {
    const { aimd, log } = simulate(5, 10, 60, 40);
    assert.ok(aimd.current <= 45);
    assert.ok(log.list().some((d) => d.reason === "import failed"));
  });
});

describe("retry schedule", () => {
  it("PERMANENT never retries; TRANSIENT follows the schedule, repeating the last, with bounded jitter", () => {
    assert.equal(retryDelayMs("PERMANENT", 1), undefined);
    const mid = () => 0.5;
    assert.equal(retryDelayMs("TRANSIENT", 1, undefined, { random: mid }), 5000);
    assert.equal(retryDelayMs("TRANSIENT", 3, undefined, { random: mid }), 45_000);
    assert.equal(retryDelayMs("TRANSIENT", 99, undefined, { random: mid }), 900_000);
    assert.equal(retryDelayMs("TRANSIENT", 1, undefined, { random: () => 0 }), 4000);
    assert.equal(retryDelayMs("TRANSIENT", 1, undefined, { random: () => 1 }), 6000);
  });
  it("takes the schedule from company policy and rejects a malformed one", () => {
    const p = resolvePolicy([{ name: "company", values: { "retry.transientScheduleSec": "1,2" } }]);
    assert.equal(retryDelayMs("TRANSIENT", 5, p, { random: () => 0.5 }), 2000);
    assert.throws(() => parseSchedule("5,abc"), RangeError);
    assert.throws(() => parseSchedule(""), RangeError);
  });
});

import { TallyGate, TallyTimeoutError, type TallyTransport } from "../src/index.js";
describe("gate with adaptive timeout", () => {
  it("tightens the timeout to measured latency so a hung request fails sooner than the ceiling", async () => {
    let delay = 5;
    const inner: TallyTransport = { send: () => new Promise((r) => setTimeout(() => r("<ENVELOPE/>"), delay)) } as never;
    const latency = new LatencyTracker(); const log = new DecisionLog();
    const gate = new TallyGate(inner, { timeoutMs: 60_000, adaptive: { latency, log } });
    for (let i = 0; i < 25; i++) await gate.send("<x/>", "t");
    assert.ok(latency.count >= 25);
    delay = 4000; // hang: floor is 2000 ms, far below the 60 s ceiling
    const t0 = Date.now();
    await assert.rejects(gate.send("<x/>", "t"), TallyTimeoutError);
    assert.ok(Date.now() - t0 < 5000, "should time out at the adaptive floor, not the ceiling");
    assert.ok(log.list().length >= 1);
  });
});
