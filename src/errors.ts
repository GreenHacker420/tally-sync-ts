/** Typed failures of the Tally transport layer. Callers branch on these, never on message text. */
export class TallyTransportError extends Error {
  constructor(message: string, readonly kind: "TIMEOUT" | "CONNECTION" | "CIRCUIT_OPEN" | "HTTP") {
    super(message);
    this.name = "TallyTransportError";
  }
}

export class TallyTimeoutError extends TallyTransportError {
  constructor(readonly timeoutMs: number, readonly requestType: string) {
    super(`Tally did not answer ${requestType} within ${timeoutMs}ms`, "TIMEOUT");
    this.name = "TallyTimeoutError";
  }
}

export class TallyCircuitOpenError extends TallyTransportError {
  constructor(readonly retryAfterMs: number) {
    super(`Tally circuit is open; not sending for another ${retryAfterMs}ms`, "CIRCUIT_OPEN");
    this.name = "TallyCircuitOpenError";
  }
}
