# tally-sync-ts

`tally-sync-ts` is a typed TypeScript parser and client for the Tally XML API used by Tally Prime and Tally ERP 9.

The C# `TallyConnector` project is used as a behavioral reference for XML tags, request envelopes, and model coverage. This package is intentionally idiomatic TypeScript: explicit typed APIs, reusable parser/build helpers, and generic escape hatches instead of C# source-generator or analyzer internals.

## Features

- Typed client methods for common masters, vouchers, statistics, counts, pagination, and GST registrations.
- Raw parser helpers for saved Tally XML responses and fixture files.
- XML builders for export, import/post, count, pagination, master stats, voucher stats, and periodic voucher stats.
- Deep voucher support for ledger entries, bill allocations, cost-centre allocations, inventory entries, batch allocations, accounting allocations, GST rate details, and e-way details.
- Normalization helpers for XML escaping, arrays, dates, booleans, numeric values with `Dr`/`Cr`, and control-character cleanup.

## Install

```bash
npm install tally-sync-ts
```

Use ESM-compatible TypeScript settings, or set `"type": "module"` in your application.

## Client Usage

```typescript
import { TallyClient } from "tally-sync-ts";

const client = new TallyClient("http://localhost", 9000);

const isOnline = await client.check();
const company = await client.getActiveCompany();
const ledgers = await client.getLedgers({ company });
```

## Parse Raw XML

```typescript
import { parseExportCollection, type Voucher } from "tally-sync-ts";

const vouchers = parseExportCollection<Voucher>(xmlString, "Voucher");
console.log(vouchers[0].ledgerEntries?.[0].billAllocations);
```

## Paginated Fetching

```typescript
const page = await client.getPaginatedObjects("Ledger", {
  company,
  pageNum: 1,
  recordsPerPage: 100
});

console.log(page.totalCount, page.totalPages, page.objects.length);
```

## Deep Voucher Posting

```typescript
await client.postVouchers([{
  date: "2026-05-21",
  voucherType: "Sales",
  voucherNumber: "S-1",
  partyName: "Acme Customer",
  partyGSTIN: "27ABCDE1234F1Z5",
  isInvoice: true,
  ledgerEntries: [{
    ledgerName: "Acme Customer",
    amount: 1180,
    isDeemedPositive: true,
    billAllocations: [{ name: "S-1", billType: "New Ref", amount: 1180 }]
  }],
  inventoryAllocations: [{
    stockItemName: "Widget",
    quantity: "10 pcs",
    rate: "100/pcs",
    amount: 1000,
    isDeemedPositive: false,
    batchAllocations: [{ godownName: "Main Location", batchName: "B1", amount: 1000 }],
    accountingAllocations: [{ ledgerName: "Sales", amount: -1000 }]
  }]
}], { company });
```

## GST Registrations

```typescript
const registrations = await client.getGSTRegistrations({ company });

await client.postGSTRegistrations([{
  name: "Maharashtra GST",
  stateName: "Maharashtra",
  gstin: "27ABCDE1234F1Z5",
  registrationDetails: [{
    applicableFrom: "2026-04-01",
    gstRegistrationType: "Regular",
    state: "Maharashtra",
    placeOfSupply: "Maharashtra"
  }]
}], { company });
```

## Generic APIs

```typescript
const groups = await client.getObjects("Group", { company });
const result = await client.postObjects("Ledger", [{ name: "Demo", group: "Sundry Debtors" }], { company });
const count = await client.getObjectsCount("Ledger", { company });
```

## Tests

```bash
npm test
npm run build
```

The test suite includes mock unit tests and parser checks against C# reference XML fixtures. A live Tally server is not required for the automated tests.
