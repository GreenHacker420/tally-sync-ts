import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard for the dynamic-engine rule: engine code carries no business/company/Tally vocabulary and no bare tunables.
 * Protocol facts live in src/dialects, tunables in src/config. Protocol plumbing directories are exempt.
 */
const ROOT = new URL("../src", import.meta.url).pathname;
const EXEMPT_DIRS = ["dialects", "config", "testing", "schema", "xml", "tdl", "analytics", "sqlite", "rules"];
const EXEMPT_FILES = new Set(["index.ts", "xmlBuilder.ts"]);

const RULES: Array<{ name: string; pattern: RegExp; hint: string }> = [
  { name: "godown/batch literal", pattern: /Main Location|Primary Batch/, hint: "company/item fact: take it from the profile or learned blueprint" },
  { name: "state name", pattern: /Madhya Pradesh|Maharashtra|Gujarat|Karnataka|Tamil Nadu|Uttar Pradesh|Rajasthan/, hint: "company state comes from the CompanyProfile" },
  { name: "company ledger name", pattern: /SALES A\/C|SALES GST|OUTPUT (CGST|SGST|IGST)|ROUND OFF|"Round Off"/i, hint: "ledger names are discovered or configured" },
  { name: "reserved Tally name", pattern: /"(Sales|Receipt|Credit Note|Purchase|Payment|Sundry Debtors|Sundry Creditors|Duties & Taxes|Sales Accounts|Purchase Accounts|Cash-in-Hand|Bank Accounts)"/, hint: "use src/dialects/tally.ts" },
  { name: "duty-head spelling", pattern: /Central Tax|State Tax|Integrated Tax/, hint: "use the dialect's duty-head tables" },
  { name: "host/IP/URL", pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9]|\b(?!127\.0\.0\.1\b)(\d{1,3}\.){3}\d{1,3}\b/, hint: "hosts come from pairing/discovery" },
  { name: "tunable default", pattern: /\?\?\s*[0-9][0-9_]{2,}/, hint: "declare it in src/config/policy.ts and read policyDefault()" },
  { name: "tenant/demo key", pattern: /DEMO-TENANT|tenantKey\s*[:=]\s*['"][A-Z]/, hint: "identity comes from registration" },
];

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (!EXEMPT_DIRS.includes(relative(ROOT, full).split("/")[0])) yield* sourceFiles(full); }
    else if (name.endsWith(".ts") && !EXEMPT_FILES.has(name)) yield full;
  }
}
const stripComments = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

describe("no hardcoded business data in engine code", () => {
  const files = [...sourceFiles(ROOT)];
  it("scans a meaningful set of files", () => assert.ok(files.length >= 15, `only ${files.length} files scanned`));
  for (const rule of RULES) {
    it(`no ${rule.name}`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        const text = stripComments(readFileSync(f, "utf8"));
        const m = text.match(rule.pattern);
        if (m) offenders.push(`${relative(ROOT, f)}: "${m[0]}"`);
      }
      assert.deepEqual(offenders, [], `${rule.hint}`);
    });
  }
  it("the guard itself catches a violation (sanity)", () => {
    assert.ok(RULES[0].pattern.test('const g = "Main Location";'));
    assert.ok(RULES[6].pattern.test("const t = options.timeoutMs ?? 30_000;"));
    assert.ok(!RULES[6].pattern.test("const t = options.timeoutMs ?? policyDefault('gate.timeoutMs');"));
  });
});
