# Changelog

## 2.1.0
- `CompanyContextLearner`: keeps a company's learned invoice context; re-reads the cheap masters every call and the heavy voucher sample only when the master fingerprint changes or the context is stale. New policy keys `learn.sampleVouchers`, `learn.maxMonths`, `learn.minConfidencePercent`, `learn.refreshHours`.

## 2.0.0 — dynamic engine

### Dynamic engine (nothing company-specific is typed in code)
- **Policy registry** (`resolvePolicy`, `explainPolicy`): every tunable declared once with bounds; layered resolution (default < dialect < discovered < learned < tenant < shop < company < document) with provenance; `policyRegistryJson()` / `npm run export:policy` for consumers that vendor the registry.
- **Dialects** (`TALLY_PRIME_DIALECT`, `WINDOWS_FINDER_ENVIRONMENT`): Tally vocabulary and finder environment as data. The invoice builder no longer invents a godown, batch or country, and looks up tax ledgers only when tax is charged.
- **Company profile** (`discoverCompanyProfile`, `buildCompanyProfile`): ledger roles by group ancestry and GST duty head, never by name; typed owner questions.
- **Blueprint learner** (`learnVoucherBlueprint`) and `learnLedgerNames` / `resolveInvoiceContext` / `buildSalesInvoiceFor`: ledgers, godown and batch come from the company's own vouchers, with provenance. `TallyClient.getRawVoucherWindow`.
- **Rule packs** (`compileRulePack`, `signPack`, `loadSignedPack`, `QuarantineLog`): import-error classification as validated, signed, rollback-proof data.
- **Adaptive control** (`LatencyTracker`, `adaptiveTimeoutMs`, `AimdBatch`, `retryDelayMs`, `DecisionLog`); `TallyGate` accepts `adaptive`.
- **Breaking:** `LedgerNames.roundOff` is optional; builder defaults for godown/batch/country removed; `ImportErrorCode` is open-ended.

## 2.0.0 base (breaking changes allowed)

### Fixed
- `parsePostResponse` now understands Tally's real `<RESPONSE>` import reply (previously every real reply was
  reported as `failure: missing ENVELOPE`, including successful imports). Legacy `ENVELOPE/…/IMPORTRESULT` still parses.
- `masterId` of an import result now uses `LASTVCHID`, falling back to `LASTMID` (which is always 0 for voucher imports).
- `ERRORS > 0` with an empty `<LINEERROR/>` (TallyPrime 3.0+) is reported as a failure with `needsImportLog: true`.
- SQLite mirror: bill allocations of earlier ledger entries were deleted while syncing later entries of the same voucher;
  stale allocations are now removed once per voucher.

### Added (this release train)
- **TallyGate**: one request in flight, priority queue (WRITE > LIGHT_READ > HEAVY_READ), hard timeout, circuit breaker; `RecordingTransport` (redacted flight recorder); `startFakeTally` test server (`tally-sync-ts/testing`); typed transport errors.
- `detectCapabilities()` from the release numbers in the reply header (no TDL); `parseFunctionReply`.
- **GST**: `parseGstDetails` / `resolveEffectiveGst` (dated history, duty-head normalisation, basis points); stock items now carry `gstHistory`, `hsnHistory`, current rates, `taxability`; the default stock-item fetch now requests `GSTDetails.List` / `HSNDetails.List`.
- Masters/vouchers now carry `guid`, `masterId`, `alterId` (codecs previously dropped them).
- Mirror: `tally_stock_item_gst` history table, `guid/master_id/alter_id` columns, `gst_type_of_supply`, in-place migration (`PRAGMA user_version = 2`).
- Change detection: `monthWindows`, `getVoucherIndex[Window]`, `diffVoucherIndex`, `looksRestored`; `includeDeleted` request option [verify per release].
- Posting core: integer-paise `computeInvoiceTax` (INCLUSIVE/EXCLUSIVE x PER_SLAB/PER_LINE), `buildSalesInvoice` (balance invariant), `postSalesInvoice` (idempotent GUID pre-check, import, classified failures, read-back verification), `loadMasterCatalog` + `planSalesInvoiceMasters`.
- `npm run test:live` (read-only checks against a real Tally, skipped unless `TALLY_LIVE_URL` is set).

### Changed
- `TallyGate` half-open now sends a light `$$CurrentSimpleCompany` probe (`TALLY_LIGHT_PROBE_XML`) and only forwards the caller's request once Tally answers it. A real Tally (`Ignore Tcp Timeout=Yes`) keeps working on abandoned requests, so a heavy "probe" would queue behind them.
- `getActiveCompany()` sends a well-formed request and no longer returns Tally's error text as a company name; `tallyText` no longer yields "[object Object]" for empty elements with attributes.
- `getLicenseInfo()` is deprecated/experimental (undefined TDL function hung a live TallyPrime 7.1).
- `npm test` quotes its glob so Node expands it (an unquoted glob silently ran 0 tests once a subfolder existed).

### Added (earlier)
- `classifyImportError` / `classifyImportOutcome` (`ImportErrorCode`, `ImportErrorClass`): TRANSIENT vs PERMANENT import failures.
- `importLogPath`, `importLogMark`, `readImportLogSince`: read the lines Tally appends to `Tally.imp` during an import.
- `TallyClient.check()`; `PostResponse.combined`, `PostResponse.needsImportLog`.
- GitHub Actions CI (typecheck + tests on Node 22 and 24).
