import type { DatabaseSync } from "node:sqlite";
import { policyDefault, type ResolvedPolicy } from "../config/policy.js";
import { retryDelayMs } from "../adaptive/control.js";

/**
 * Durable job queue on SQLite with leases and fencing. Invariants:
 *  - a job is never lost: every state is on disk before any external call is made;
 *  - a job is held by at most one worker; a stale worker (lease expired, another worker took over) cannot overwrite
 *    newer state because every completion is conditional on the fencing token it was given;
 *  - a job found mid-flight after a crash (lease expired in POSTING) is an AMBIGUOUS outcome: it goes to VERIFYING,
 *    never straight back to QUEUED, so the worker must check the original identity in the target system before posting;
 *  - retries are bounded (dead letter) and scheduled with backoff; waiting for a missing master is not a failed attempt.
 */
export const JobState = {
  QUEUED: "QUEUED",
  POSTING: "POSTING",
  VERIFYING: "VERIFYING",
  WAITING_DEPENDENCY: "WAITING_DEPENDENCY",
  FAILED_RETRYABLE: "FAILED_RETRYABLE",
  FAILED_PERMANENT: "FAILED_PERMANENT",
  CONFLICT: "CONFLICT",
  CONFIRMED: "CONFIRMED",
  DEAD_LETTER: "DEAD_LETTER",
} as const;
export type JobState = (typeof JobState)[keyof typeof JobState];

const DUE_STATES: JobState[] = [JobState.QUEUED, JobState.FAILED_RETRYABLE, JobState.WAITING_DEPENDENCY, JobState.VERIFYING];
const FINISHED: JobState[] = [JobState.CONFIRMED, JobState.FAILED_PERMANENT, JobState.DEAD_LETTER];

export interface NewJob { id: string; direction: "OUTBOUND" | "INBOUND"; entityType: string; idempotencyKey: string; payload: string; /** Higher runs first (payments before reports). */ priority?: number; /** Essential jobs (financial) are accepted even when the queue is full. */ essential?: boolean }
export interface LeasedJob { id: string; direction: string; entityType: string; idempotencyKey: string; payload: string; attempts: number; token: string; /** True when a previous worker may already have posted: verify before posting. */ mustVerify: boolean }

export type EnqueueResult = "INSERTED" | "DUPLICATE" | "REJECTED_FULL";

export type JobOutcome =
  | { state: typeof JobState.CONFIRMED }
  | { state: typeof JobState.VERIFYING; reason: string; retryAfterMs?: number }
  | { state: typeof JobState.WAITING_DEPENDENCY; detail: string; retryAfterMs?: number }
  | { state: typeof JobState.FAILED_RETRYABLE; error: string }
  | { state: typeof JobState.FAILED_PERMANENT | typeof JobState.CONFLICT; error: string };

const COLUMNS: Array<[string, string]> = [
  ["nextAttemptAt", "INTEGER"], ["leaseToken", "TEXT"], ["leaseUntil", "INTEGER"], ["lastAttemptAt", "INTEGER"],
  ["priority", "INTEGER DEFAULT 0"], ["essential", "INTEGER DEFAULT 1"], ["mustVerify", "INTEGER DEFAULT 0"],
];

/** Create or upgrade the table in place; pending work is preserved. */
export function ensureQueueSchema(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS sync_jobs (
    id TEXT PRIMARY KEY, direction TEXT NOT NULL, entityType TEXT NOT NULL, idempotencyKey TEXT UNIQUE NOT NULL, payload TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'QUEUED', attempts INTEGER DEFAULT 0, lastError TEXT, dependencyId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  const have = new Set((db.prepare("PRAGMA table_info(sync_jobs)").all() as Array<{ name: string }>).map((c) => c.name));
  for (const [name, type] of COLUMNS) if (!have.has(name)) db.exec(`ALTER TABLE sync_jobs ADD COLUMN ${name} ${type}`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sync_jobs_due ON sync_jobs(state, nextAttemptAt, priority)");
}

export interface QueueOptions { policy?: ResolvedPolicy; now?: () => number; newToken?: () => string; random?: () => number }

export class JobQueue {
  private readonly now: () => number;
  constructor(private readonly db: DatabaseSync, private readonly options: QueueOptions = {}) {
    ensureQueueSchema(db);
    this.now = options.now ?? Date.now;
  }

  private num(key: "retry.maxAttempts" | "queue.maxPending" | "queue.retentionDays" | "queue.leaseSeconds"): number {
    return (this.options.policy?.values[key] as number | undefined) ?? policyDefault(key);
  }
  private token(): string { return this.options.newToken?.() ?? `${this.now()}-${Math.random().toString(36).slice(2)}`; }

  /** Runs in its own immediate transaction, or joins the caller's: a caller can store events and advance its cursor atomically with the enqueue. */
  private tx<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    try { const r = fn(); this.db.exec("COMMIT"); return r; } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }

  enqueue(job: NewJob): EnqueueResult {
    return this.tx(() => {
      const dup = this.db.prepare("SELECT 1 FROM sync_jobs WHERE idempotencyKey = ?").get(job.idempotencyKey);
      if (dup) return "DUPLICATE";
      const essential = job.essential ?? true;
      if (!essential) {
        const pending = (this.db.prepare(`SELECT COUNT(*) AS n FROM sync_jobs WHERE state NOT IN (${FINISHED.map(() => "?").join(",")})`).get(...FINISHED) as { n: number }).n;
        if (pending >= this.num("queue.maxPending")) return "REJECTED_FULL";
      }
      this.db.prepare("INSERT INTO sync_jobs (id, direction, entityType, idempotencyKey, payload, state, priority, essential, nextAttemptAt) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(job.id, job.direction, job.entityType, job.idempotencyKey, job.payload, JobState.QUEUED, job.priority ?? 0, essential ? 1 : 0, this.now());
      return "INSERTED";
    });
  }

  /** Jobs whose lease ran out while POSTING: outcome unknown, so they must be verified, not blindly retried. */
  recoverExpiredLeases(): number {
    return this.tx(() => {
      const r = this.db.prepare("UPDATE sync_jobs SET state = ?, mustVerify = 1, leaseToken = NULL, leaseUntil = NULL, nextAttemptAt = ?, lastError = 'lease expired while posting; outcome unknown', updatedAt = CURRENT_TIMESTAMP WHERE state = ? AND leaseUntil IS NOT NULL AND leaseUntil < ?")
        .run(JobState.VERIFYING, this.now(), JobState.POSTING, this.now());
      return Number(r.changes);
    });
  }

  lease(limit: number, direction: "OUTBOUND" | "INBOUND" = "OUTBOUND"): LeasedJob[] {
    this.recoverExpiredLeases();
    return this.tx(() => {
      const t = this.now();
      const rows = this.db.prepare(`SELECT id, direction, entityType, idempotencyKey, payload, attempts, state, mustVerify FROM sync_jobs
        WHERE direction = ? AND state IN (${DUE_STATES.map(() => "?").join(",")}) AND COALESCE(nextAttemptAt, 0) <= ?
        ORDER BY priority DESC, createdAt ASC, id ASC LIMIT ?`).all(direction, ...DUE_STATES, t, limit) as Array<{ id: string; direction: string; entityType: string; idempotencyKey: string; payload: string; attempts: number; state: string; mustVerify: number }>;
      const claim = this.db.prepare("UPDATE sync_jobs SET state = ?, leaseToken = ?, leaseUntil = ?, attempts = attempts + 1, lastAttemptAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?");
      return rows.map((r) => {
        const token = this.token();
        claim.run(JobState.POSTING, token, t + this.num("queue.leaseSeconds") * 1000, t, r.id);
        return { id: r.id, direction: r.direction, entityType: r.entityType, idempotencyKey: r.idempotencyKey, payload: r.payload, attempts: r.attempts + 1, token, mustVerify: r.mustVerify === 1 || r.state === JobState.VERIFYING };
      });
    });
  }

  /** Record a result. Returns false (and changes nothing) if the lease is no longer this worker's: a stale worker must not overwrite newer state. */
  complete(job: Pick<LeasedJob, "id" | "token" | "attempts">, outcome: JobOutcome): boolean {
    return this.tx(() => {
      const t = this.now();
      let state: JobState = outcome.state, error: string | null = null, next: number | null = null, mustVerify = 0, attemptsDelta = 0;
      switch (outcome.state) {
        case JobState.CONFIRMED: break;
        case JobState.VERIFYING: error = outcome.reason; mustVerify = 1; next = t + (outcome.retryAfterMs ?? retryDelayMs("TRANSIENT", job.attempts, this.options.policy, { random: this.options.random }) ?? 0); break;
        case JobState.WAITING_DEPENDENCY: error = outcome.detail; attemptsDelta = -1; next = t + (outcome.retryAfterMs ?? retryDelayMs("TRANSIENT", Math.max(1, job.attempts), this.options.policy, { random: this.options.random }) ?? 0); break;
        case JobState.FAILED_RETRYABLE:
          error = outcome.error;
          if (job.attempts >= this.num("retry.maxAttempts")) { state = JobState.DEAD_LETTER; error = `gave up after ${job.attempts} attempts: ${outcome.error}`; }
          else next = t + (retryDelayMs("TRANSIENT", job.attempts, this.options.policy, { random: this.options.random }) ?? 0);
          break;
        default: error = outcome.error;
      }
      const r = this.db.prepare("UPDATE sync_jobs SET state = ?, lastError = ?, nextAttemptAt = ?, mustVerify = ?, attempts = attempts + ?, leaseToken = NULL, leaseUntil = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND leaseToken = ?")
        .run(state, error, next, mustVerify, attemptsDelta, job.id, job.token);
      return Number(r.changes) === 1;
    });
  }

  /** Graceful shutdown: give back jobs this process leased but has not started, so nothing waits for a lease to expire. */
  releaseLeases(tokens: readonly string[]): number {
    if (tokens.length === 0) return 0;
    return this.tx(() => Number(this.db.prepare(`UPDATE sync_jobs SET state = ?, leaseToken = NULL, leaseUntil = NULL, attempts = MAX(attempts - 1, 0), updatedAt = CURRENT_TIMESTAMP WHERE state = ? AND leaseToken IN (${tokens.map(() => "?").join(",")})`).run(JobState.QUEUED, JobState.POSTING, ...tokens).changes));
  }

  /** Finished jobs older than the retention window, so the local database stays bounded. Pending and dead-letter jobs are never pruned. */
  prune(): number {
    const cutoff = new Date(this.now() - this.num("queue.retentionDays") * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
    return Number(this.db.prepare("DELETE FROM sync_jobs WHERE state IN (?, ?) AND updatedAt < ?").run(JobState.CONFIRMED, JobState.FAILED_PERMANENT, cutoff).changes);
  }

  stats(): { byState: Record<string, number>; oldestPendingAgeMs: number | null; deadLetters: number; unknownOutcomes: number } {
    const byState: Record<string, number> = {};
    for (const r of this.db.prepare("SELECT state, COUNT(*) AS n FROM sync_jobs GROUP BY state").all() as Array<{ state: string; n: number }>) byState[r.state] = r.n;
    const oldest = this.db.prepare(`SELECT MIN(createdAt) AS t FROM sync_jobs WHERE state NOT IN (${FINISHED.map(() => "?").join(",")})`).get(...FINISHED) as { t: string | null };
    return { byState, oldestPendingAgeMs: oldest.t ? this.now() - Date.parse(oldest.t.replace(" ", "T") + "Z") : null, deadLetters: byState[JobState.DEAD_LETTER] ?? 0, unknownOutcomes: byState[JobState.VERIFYING] ?? 0 };
  }
}
