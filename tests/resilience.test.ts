import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JobQueue, JobState, ensureQueueSchema, CircuitBreaker, CircuitOpenError, backoffMs, SseParser, ResourceGuard, resolvePolicy } from "../src/index.js";

const job = (n: number, extra: object = {}) => ({ id: `j${n}`, direction: "OUTBOUND" as const, entityType: "SALE", idempotencyKey: `k${n}`, payload: "{}", ...extra });
const clock = (start = 1_000_000) => { let t = start; return { now: () => t, advance: (ms: number) => { t += ms; } }; };
const noJitter = () => 0.5;

describe("JobQueue: leases, fencing and crash recovery", () => {
  it("enqueue is idempotent by key", () => {
    const q = new JobQueue(new DatabaseSync(":memory:"));
    assert.equal(q.enqueue(job(1)), "INSERTED");
    assert.equal(q.enqueue({ ...job(2), idempotencyKey: "k1" }), "DUPLICATE");
  });

  it("enqueue joins the caller's transaction: a rollback removes the job too (cursor and jobs commit together)", () => {
    const db = new DatabaseSync(":memory:"); const q = new JobQueue(db);
    db.exec("BEGIN"); q.enqueue(job(1)); db.exec("ROLLBACK");
    assert.equal(q.lease(1).length, 0);
    db.exec("BEGIN"); q.enqueue(job(2)); db.exec("COMMIT");
    assert.equal(q.lease(1).length, 1);
  });

  it("a job is leased to exactly one worker", () => {
    const q = new JobQueue(new DatabaseSync(":memory:")); q.enqueue(job(1));
    assert.equal(q.lease(10).length, 1);
    assert.equal(q.lease(10).length, 0);
  });

  it("CRASH during posting: after restart the job is VERIFYING (outcome unknown), never silently re-queued", () => {
    const dir = mkdtempSync(join(tmpdir(), "q-")); const file = join(dir, "a.db"); const c = clock();
    try {
      let db = new DatabaseSync(file); let q = new JobQueue(db, { now: c.now }); q.enqueue(job(1));
      const [leased] = q.lease(1); assert.equal(leased.mustVerify, false);
      db.close(); // process dies after Tally may have accepted the voucher, before we recorded anything
      c.advance(10 * 60_000);
      db = new DatabaseSync(file); q = new JobQueue(db, { now: c.now });
      const [again] = q.lease(1);
      assert.ok(again, "the job must still exist");
      assert.equal(again.mustVerify, true, "a crash mid-post must force a verify-before-post");
      assert.equal(again.attempts, 2);
      db.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("a stale worker cannot overwrite the new worker's result (fencing)", () => {
    const c = clock(); const q = new JobQueue(new DatabaseSync(":memory:"), { now: c.now }); q.enqueue(job(1));
    const [stale] = q.lease(1);
    c.advance(10 * 60_000);
    const [fresh] = q.lease(1);
    assert.equal(q.complete(fresh, { state: JobState.CONFIRMED }), true);
    assert.equal(q.complete(stale, { state: JobState.FAILED_PERMANENT, error: "late" }), false);
    assert.equal(q.stats().byState.CONFIRMED, 1);
  });

  it("retryable failures back off and end in the dead letter after the attempt budget", () => {
    const c = clock(); const policy = resolvePolicy([{ name: "company", values: { "retry.maxAttempts": 3 } }]);
    const q = new JobQueue(new DatabaseSync(":memory:"), { now: c.now, policy, random: noJitter }); q.enqueue(job(1));
    for (let i = 1; i <= 3; i++) {
      c.advance(24 * 3_600_000);
      const [j] = q.lease(1); assert.ok(j, `attempt ${i}`);
      assert.equal(q.complete(j, { state: JobState.FAILED_RETRYABLE, error: "tally busy" }), true);
      if (i < 3) assert.equal(q.lease(1).length, 0, "must wait for the backoff");
    }
    assert.equal(q.stats().deadLetters, 1);
    c.advance(48 * 3_600_000);
    assert.equal(q.lease(1).length, 0, "dead letters are never retried automatically");
  });

  it("waiting for a master is not a failed attempt and is re-evaluated later", () => {
    const c = clock(); const q = new JobQueue(new DatabaseSync(":memory:"), { now: c.now, random: noJitter }); q.enqueue(job(1));
    for (let i = 0; i < 20; i++) { c.advance(24 * 3_600_000); const [j] = q.lease(1); assert.ok(j); q.complete(j, { state: JobState.WAITING_DEPENDENCY, detail: "customer missing" }); }
    c.advance(24 * 3_600_000);
    const [j] = q.lease(1); assert.ok(j);
    assert.equal(j.attempts, 1, "waiting never consumed the retry budget");
  });

  it("essential jobs are accepted when the queue is full; background jobs are refused", () => {
    const policy = resolvePolicy([{ name: "company", values: { "queue.maxPending": 100 } }]);
    const q = new JobQueue(new DatabaseSync(":memory:"), { policy });
    for (let i = 0; i < 100; i++) assert.equal(q.enqueue(job(i, { essential: false })), "INSERTED");
    assert.equal(q.enqueue(job(500, { essential: false })), "REJECTED_FULL");
    assert.equal(q.enqueue(job(501, { essential: true })), "INSERTED");
  });

  it("higher priority first; shutdown releases unstarted leases", () => {
    const q = new JobQueue(new DatabaseSync(":memory:")); q.enqueue(job(1)); q.enqueue(job(2, { priority: 5 }));
    const leased = q.lease(2);
    assert.deepEqual(leased.map((j) => j.id), ["j2", "j1"]);
    assert.equal(q.releaseLeases(leased.map((j) => j.token)), 2);
    assert.equal(q.lease(2).length, 2);
  });

  it("upgrades an existing table in place without losing pending work", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE sync_jobs (id TEXT PRIMARY KEY, direction TEXT NOT NULL, entityType TEXT NOT NULL, idempotencyKey TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'QUEUED', attempts INTEGER DEFAULT 0, lastError TEXT, dependencyId TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.prepare("INSERT INTO sync_jobs (id, direction, entityType, idempotencyKey, payload) VALUES ('old','OUTBOUND','SALE','ko','{}')").run();
    ensureQueueSchema(db); ensureQueueSchema(db);
    assert.equal(new JobQueue(db).lease(1)[0].id, "old");
  });

  it("prune removes only old finished jobs", () => {
    const c = clock(Date.now()); const q = new JobQueue(new DatabaseSync(":memory:"), { now: c.now });
    q.enqueue(job(1)); q.enqueue(job(2)); const [a] = q.lease(1); q.complete(a, { state: JobState.CONFIRMED });
    c.advance(40 * 86_400_000);
    // updatedAt uses the DB clock; force it old for the finished job only
    (q as any).db.exec("UPDATE sync_jobs SET updatedAt = '2000-01-01 00:00:00' WHERE state = 'CONFIRMED'");
    assert.equal(q.prune(), 1);
    assert.equal(q.stats().byState.QUEUED, 1);
  });
});

describe("CircuitBreaker", () => {
  it("opens on availability failures in the window, probes once after cooldown, closes on success", () => {
    const c = clock(); const b = new CircuitBreaker({ failureThreshold: 3, windowMs: 1000, cooldownMs: 5000, now: c.now });
    b.failure(); b.failure(); assert.equal(b.state, "CLOSED"); b.failure(); assert.equal(b.state, "OPEN");
    assert.throws(() => b.acquire(), CircuitOpenError);
    c.advance(5000); assert.equal(b.state, "HALF_OPEN");
    b.acquire(); assert.throws(() => b.acquire(), CircuitOpenError, "only one probe in flight");
    b.success(); assert.equal(b.state, "CLOSED");
  });
  it("failures outside the rolling window do not accumulate; a failed probe re-opens for a full cooldown", () => {
    const c = clock(); const b = new CircuitBreaker({ failureThreshold: 2, windowMs: 1000, cooldownMs: 5000, now: c.now });
    b.failure(); c.advance(2000); b.failure(); assert.equal(b.state, "CLOSED");
    b.failure(); assert.equal(b.state, "OPEN"); c.advance(5000); b.acquire(); b.failure(); assert.equal(b.state, "OPEN");
  });
  it("business errors do not count as availability failures", async () => {
    const b = new CircuitBreaker({ failureThreshold: 1, windowMs: 1000, cooldownMs: 5000 });
    await assert.rejects(b.run(async () => { throw Object.assign(new Error("bad request"), { status: 400 }); }, (e) => (e as { status: number }).status >= 500), /bad request/);
    assert.equal(b.state, "CLOSED");
    await assert.rejects(b.run(async () => { throw Object.assign(new Error("down"), { status: 503 }); }, (e) => (e as { status: number }).status >= 500));
    assert.equal(b.state, "OPEN");
  });
  it("backoff grows, is capped and jittered within [half, full]", () => {
    assert.equal(backoffMs(1, 1000, 60_000, () => 1), 1000);
    assert.equal(backoffMs(3, 1000, 60_000, () => 1), 4000);
    assert.equal(backoffMs(30, 1000, 60_000, () => 0), 30_000);
  });
});

describe("SseParser", () => {
  it("reassembles an event split across chunks (the old per-chunk parser dropped it)", () => {
    const p = new SseParser(10_000);
    assert.deepEqual(p.push("event: domain:ev"), []);
    assert.deepEqual(p.push("ent\ndata: {\"a\":1}\n"), []);
    assert.deepEqual(p.push("\n"), [{ event: "domain:event", data: "{\"a\":1}" }]);
  });
  it("ignores keepalive comments, handles CRLF and multi-line data, several events per chunk", () => {
    const p = new SseParser(10_000);
    const out = p.push(": keepalive\r\n\r\nevent: a\r\ndata: x\r\ndata: y\r\n\r\ndata: z\n\n");
    assert.deepEqual(out, [{ event: "a", data: "x\ny" }, { event: "message", data: "z" }]);
  });
  it("bounds the buffer when a peer never sends a newline", () => {
    const p = new SseParser(100); p.push("x".repeat(500));
    assert.equal(p.hasOverflowed, true);
    assert.deepEqual(p.push("data: ok\n\n"), [{ event: "message", data: "ok" }]);
  });
});

describe("ResourceGuard", () => {
  const guard = (s: Partial<{ heapMb: number; freeDiskMb: number; eventLoopDelayMs: number }>) => new ResourceGuard({ sample: async () => ({ heapMb: 100, rssMb: 200, freeDiskMb: 10_000, eventLoopDelayMs: 5, sampledAt: 0, ...s }) });
  it("OK, then sheds background work on heap or loop delay, and CRITICAL on low disk", async () => {
    assert.equal((await guard({}).evaluate()).level, "OK");
    assert.equal((await guard({ heapMb: 5000 }).evaluate()).level, "SHED_BACKGROUND");
    assert.equal((await guard({ eventLoopDelayMs: 5000 }).evaluate()).level, "SHED_BACKGROUND");
    const v = await guard({ freeDiskMb: 10 }).evaluate();
    assert.equal(v.level, "CRITICAL"); assert.match(v.reasons[0], /disk/);
  });
});
