import type { TallyClient } from "../client.js";
import type { Voucher } from "../schema/transactions/types.js";
import { classifyImportOutcome, ImportErrorClass, type ImportErrorInfo } from "../importOutcome.js";
import { importLogMark, readImportLogSince } from "../importLog.js";
import { TallyTransportError } from "../errors.js";
import { monthWindows } from "../voucherIndex.js";
import { tallyToPaise, paiseToTally, type Paise } from "./money.js";
import { buildSalesInvoice, wrapVoucherImport, UnbalancedVoucherError, type SalesInvoiceInput, type BuiltSalesInvoice } from "./salesInvoice.js";

export const PostState = {
  CONFIRMED: "CONFIRMED",
  /** Posted and read back, but the party amount differs from what we sent: never auto-adjusted. */
  MISMATCH: "MISMATCH",
  /** Tally accepted the import but the read-back was not possible. */
  POSTED_UNVERIFIED: "POSTED_UNVERIFIED",
  FAILED_RETRYABLE: "FAILED_RETRYABLE",
  FAILED_PERMANENT: "FAILED_PERMANENT",
} as const;
export type PostState = (typeof PostState)[keyof typeof PostState];

export interface PostedVoucherIdentity {
  guid: string;
  remoteId: string;
  masterId?: number;
  alterId?: number;
}

export type PostFailure =
  | { kind: "IMPORT"; info: ImportErrorInfo }
  | { kind: "TRANSPORT"; code: "TIMEOUT" | "CONNECTION" | "CIRCUIT_OPEN" | "HTTP"; message: string }
  | { kind: "UNBALANCED"; differencePaise: Paise };

export type PostOutcome =
  | { state: typeof PostState.CONFIRMED; identity: PostedVoucherIdentity; voucherNumber?: string; partyAmountPaise: Paise; alreadyPosted: boolean; built: BuiltSalesInvoice }
  | { state: typeof PostState.MISMATCH; identity: PostedVoucherIdentity; voucherNumber?: string; expectedPaise: Paise; actualPaise: Paise; diffPaise: Paise; built: BuiltSalesInvoice }
  | { state: typeof PostState.POSTED_UNVERIFIED; identity: PostedVoucherIdentity; reason: string; built: BuiltSalesInvoice }
  | { state: typeof PostState.FAILED_RETRYABLE | typeof PostState.FAILED_PERMANENT; failure: PostFailure };

export interface PostOptions {
  company?: string;
  /** Path of Tally.imp (see importLogPath) so an empty LINEERROR can still be explained. */
  importLogFile?: string;
  verify?: boolean;
  /** For a Tally company that has security enabled; sent only on the import. */
  credentials?: { username: string; password: string };
}

const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "object" && v && "value" in v ? Number((v as { value: unknown }).value) : Number(v));
const paiseOf = (v: unknown): Paise => tallyToPaise(paiseToTallyLike(num(v)));
/** Tally amounts are exported as decimals; convert via a 2dp string so no float arithmetic leaks into money. */
function paiseToTallyLike(n: number): string { return n.toFixed(2); }

function transportFailure(err: unknown): PostFailure | undefined {
  if (err instanceof TallyTransportError) return { kind: "TRANSPORT", code: err.kind, message: err.message };
  if (err instanceof Error && /Failed to connect|ECONNREFUSED|fetch failed/i.test(err.message)) return { kind: "TRANSPORT", code: "CONNECTION", message: err.message };
  return undefined;
}

/**
 * Template Method: build -> (idempotency check) -> import -> parse/classify -> verify. Expected failures are
 * returned as values (PostOutcome), only programming errors throw.
 */
export async function postSalesInvoice(client: TallyClient, input: SalesInvoiceInput, options: PostOptions = {}): Promise<PostOutcome> {
  let built: BuiltSalesInvoice;
  try {
    built = buildSalesInvoice(input);
  } catch (err) {
    if (err instanceof UnbalancedVoucherError) return { state: PostState.FAILED_PERMANENT, failure: { kind: "UNBALANCED", differencePaise: err.differencePaise } };
    throw err;
  }
  const { guid, remoteId } = built.identity;
  const window = monthWindows(input.date, input.date)[0];

  try {
    // 1. Idempotency: if this GUID already exists in Tally (e.g. we crashed after the import), do not post again.
    const existing = await client.findVoucherByGuid(guid, window, { company: options.company });
    if (existing) return verifyOrConfirm(existing, built, { guid, remoteId }, true);

    // 2. Import (capture only this import's lines of Tally.imp).
    const mark = options.importLogFile ? await importLogMark(options.importLogFile) : 0;
    const [reply] = await client.sendImport(wrapVoucherImport(built.xml, options.company ?? undefined, options.credentials));
    if (reply.status !== "success") {
      const logText = options.importLogFile ? await readImportLogSince(options.importLogFile, mark) : undefined;
      const info = classifyImportOutcome(reply, logText)!;
      return { state: info.class === ImportErrorClass.TRANSIENT ? PostState.FAILED_RETRYABLE : PostState.FAILED_PERMANENT, failure: { kind: "IMPORT", info } };
    }
    const identity: PostedVoucherIdentity = { guid, remoteId, masterId: reply.masterId };

    // 3. Read back what Tally actually stored.
    if (options.verify === false) return { state: PostState.POSTED_UNVERIFIED, identity, reason: "verification disabled", built };
    const stored = await client.findVoucherByGuid(guid, window, { company: options.company });
    if (!stored) return { state: PostState.POSTED_UNVERIFIED, identity, reason: "voucher not found on read-back", built };
    return verifyOrConfirm(stored, built, identity, false);
  } catch (err) {
    const failure = transportFailure(err);
    if (failure) return { state: PostState.FAILED_RETRYABLE, failure };
    throw err;
  }
}

function verifyOrConfirm(stored: Voucher, built: BuiltSalesInvoice, base: { guid: string; remoteId: string }, alreadyPosted: boolean): PostOutcome {
  const identity: PostedVoucherIdentity = { ...base, masterId: stored.masterId, alterId: stored.alterId };
  const partyName = built.entries[0].ledger;
  const party = (stored.ledgerEntries ?? []).find((e) => e.isPartyLedger || e.ledgerName === partyName);
  const expectedPaise = -built.entries[0].amountPaise;
  if (!party) return { state: PostState.POSTED_UNVERIFIED, identity, reason: "party ledger entry not found on read-back", built };
  const actualPaise = Math.abs(paiseOf(party.amount));
  if (actualPaise !== expectedPaise) {
    return { state: PostState.MISMATCH, identity, voucherNumber: stored.voucherNumber, expectedPaise, actualPaise, diffPaise: actualPaise - expectedPaise, built };
  }
  return { state: PostState.CONFIRMED, identity, voucherNumber: stored.voucherNumber, partyAmountPaise: actualPaise, alreadyPosted, built };
}
