# tally-sync-ts 🚀

[![NPM Version](https://img.shields.io/badge/npm-1.0.0-blue.svg?style=flat-square)](https://www.npmjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

**tally-sync-ts** is a high-performance, strictly typed TypeScript connector for the **Tally XML API** (Tally Prime & Tally ERP 9). 

This library serves as a fully optimized port of the popular C# `TallyConnector` library, abstracting the complexities of raw XML construction, escaping, and response mapping. Instead of manipulating XML files, you work directly with fully autocompleted and type-safe TypeScript interfaces!

---

## ✨ Features

- **🎯 Universal Version Parity**: Out-of-the-box compatibility with all major Tally versions, including **Tally Prime (V3, V4, V5, V6, and V7)** as well as **Tally ERP 9**.
- **🔒 Strong Typing**: Fully comprehensive, high-fidelity TypeScript models for all Tally master records (Ledger, Group, Company, Unit, StockGroup, StockCategory, Godown, Employee, EmployeeGroup) and vouchers.
- **⚡ High-Performance Architecture**: Uses highly optimized template-based ES6 string builders and the ultra-fast `fast-xml-parser` parsing engine.
- **🌐 Native Implementation**: Zero external runtime network dependencies—built using native Node.js `fetch` with robust timeout limits via `AbortController`.
- **🛡️ Multilingual & Alias Parity**: Built-in support for multiple names and aliases (`LANGUAGENAME.LIST` / `NAME.LIST`), robustly handling Tally’s complex array configurations.
- **🔢 Numeric Normalization**: Built-in format-clearing regex parsers to cleanly convert negative/formatted Tally values (e.g. `2,500.00 Cr` or `-12.50`) into standard JS floats.

---

## 📦 Installation

To add the library to your Node.js or TypeScript application:

```bash
npm install tally-sync-ts
```

Ensure your `package.json` specifies `"type": "module"` or that your TypeScript configuration resolves ES modules correctly.

---

## 🚀 Getting Started

### 1. Initialize the Client
Initialize the connection to your local or remote Tally server (default port is `9000`).

```typescript
import { TallyClient } from "tally-sync-ts";

const client = new TallyClient("http://localhost", 9000);

// Check if Tally Prime is online
const isOnline = await client.check();
if (isOnline) {
  console.log("✅ Tally server is online!");
}
```

### 2. Fetch Active Company
Query Tally to find out which company is currently active.

```typescript
const company = await client.getActiveCompany();
console.log(`Active Company: "${company}"`);
```

### 3. Fetch Master Records with Filtering & Pagination
Fetch records cleanly using pagination, custom fields retrieval, or custom filters.

```typescript
// Fetch first 10 Ledgers
const ledgers = await client.getLedgers({
  company: company,
  fetchList: ["MasterId", "Name", "Parent", "OpeningBalance"],
  pageNum: 1,
  recordsPerPage: 10
});

console.table(ledgers.map(l => ({
  ID: l.masterId,
  Name: l.name,
  ParentGroup: l.group,
  OpeningBal: l.openingBalance || 0
})));
```

### 4. Fetch Stock Items & Units of Measure
Retrieve stock information containing structural properties, groups, and base units.

```typescript
// Get Stock Items
const items = await client.getStockItems({ company });
console.log(`Found ${items.length} Stock Items.`);

// Get Units
const units = await client.getUnits({ company });
console.log(`Found ${units.length} Units of Measure.`);
```

### 5. Create or Alter Masters (Posting)
Post new ledgers, groups, units, or stock items directly to Tally.

```typescript
const result = await client.postLedgers([
  {
    name: "TC_Demo Customer Ledger",
    group: "Sundry Debtors",
    openingBalance: 25000
  }
], { company });

console.log("Status:", result[0].status); // "success" or "failure"
console.log("Message:", result[0].message);
```

---

## 🛠️ C# Parity Mapping

### Architecture Comparison
In the C# `TallyConnector` library, model methods are dynamically compiled at build time using Source Generators (`[GenerateHelperMethod]`). In **tally-sync-ts**, we explicitly implement and type all retrieval and post methods inside the `TallyClient` class, offering optimal IDE autocomplete, easy debugging, and zero compile-time magic dependencies.

### Type/Field Mapping
All fields undergo standard uppercase-to-camelCase conversion during XML parsing and vice-versa during serialization. Below is the mapping:

| Tally XML Tag | C# Property | TypeScript Field | Type |
|---|---|---|---|
| `MASTERID` | `MasterId` | `masterId` | `number` |
| `ALTERID` | `AlterId` | `alterId` | `number` |
| `GUID` | `GUID` | `guid` | `string` |
| `REMOTEALTGUID` | `RemoteId` | `remoteId` | `string` |
| `LANGUAGENAME.LIST` | `LanguageNameList` | `languageNameList` | `LanguageName[]` |

---

## 🧪 Testing

The library includes a native Node.js test runner suite (`node:test`) that requires zero heavy testing frameworks.

To run offline mock unit tests:
```bash
npm test
```

To run a live integration script (queries your running Tally port `9000` and displays real company records in formatted tables):
```bash
npm run example
```

---

## 📄 License

This project is licensed under the MIT License.
