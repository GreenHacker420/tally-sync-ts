import type { TallyClient } from "../client.js";
import type { SalesInvoiceInput } from "./salesInvoice.js";
import { TALLY_PRIME_DIALECT } from "../dialects/tally.js";

export interface LedgerFacts {
  name: string;
  parent: string;
  /** Primary group reached by walking the group chain (e.g. "Sundry Debtors", "Duties & Taxes", "Sales Accounts"). */
  rootGroup: string;
  isBillWise: boolean;
  gstin?: string;
  state?: string;
}

export interface MasterCatalog {
  ledgers: ReadonlyMap<string, LedgerFacts>;
  stockItems: ReadonlySet<string>;
  /** The company's own state, used for the inter/intra-state decision. */
  companyState?: string;
}

const key = (n: string): string => n.trim().toLowerCase();

/** Group name -> parent, to resolve a ledger's primary group (Tally nests e.g. "Sundry Debtors" under "Current Assets"). */
export function rootGroupOf(group: string, parents: ReadonlyMap<string, string>, primary: ReadonlySet<string>): string {
  let current = group;
  const seen = new Set<string>();
  while (!seen.has(key(current))) {
    seen.add(key(current));
    const parent = parents.get(key(current));
    if (!parent || primary.has(key(parent))) return current;
    current = parent;
  }
  return current;
}

/** One-time (then refreshed by sync) read of the masters an invoice depends on. Standard collections only. */
export async function loadMasterCatalog(client: TallyClient, companyState?: string): Promise<MasterCatalog> {
  const [groups, ledgers, items] = await Promise.all([
    client.getObjects("Group"), client.getObjects("Ledger"), client.getObjects("StockItem", { fetchList: ["Name", "GUID"] }),
  ]).then(([g, l, i]) => [g, l, i] as const);
  const parents = new Map<string, string>();
  for (const g of groups) if (g.parent) parents.set(key(g.name), g.parent);
  const reserved = new Set(["primary", ""]);
  const map = new Map<string, LedgerFacts>();
  for (const l of ledgers) {
    const parent = l.parent ?? l.group ?? "";
    map.set(key(l.name), { name: l.name, parent, rootGroup: rootGroupOf(parent, parents, reserved), isBillWise: !!l.isBillWise, gstin: l.gstin ?? l.partyGstin, state: l.state ?? l.stateName });
  }
  return { ledgers: map, stockItems: new Set(items.map((i) => key(i.name))), companyState };
}

export const MissingKind = { PARTY_LEDGER: "PARTY_LEDGER", SALES_LEDGER: "SALES_LEDGER", TAX_LEDGER: "TAX_LEDGER", ROUND_OFF_LEDGER: "ROUND_OFF_LEDGER", STOCK_ITEM: "STOCK_ITEM", WRONG_GROUP: "WRONG_GROUP" } as const;
export type MissingKind = (typeof MissingKind)[keyof typeof MissingKind];

export interface MissingMaster { kind: MissingKind; name: string; detail?: string }

export interface MasterPlan {
  ready: boolean;
  missing: MissingMaster[];
  /** Facts the builder should use (e.g. whether the party takes bill allocations). */
  partyIsBillWise?: boolean;
  warnings: string[];
}

export interface PlanExpectations {
  salesGroup: string;
  taxGroup: string;
  partyGroups: readonly string[];
}

export const DEFAULT_GROUPS: PlanExpectations = {
  salesGroup: TALLY_PRIME_DIALECT.reservedGroups.sales,
  taxGroup: TALLY_PRIME_DIALECT.reservedGroups.dutiesTaxes,
  partyGroups: [TALLY_PRIME_DIALECT.reservedGroups.debtors, TALLY_PRIME_DIALECT.reservedGroups.cash, TALLY_PRIME_DIALECT.reservedGroups.bank],
};

/** Pure pre-flight: what is missing or in the wrong group in the target Tally for this invoice. */
export function planSalesInvoiceMasters(input: SalesInvoiceInput, catalog: MasterCatalog, expect: PlanExpectations = DEFAULT_GROUPS, taxLedgerNames: readonly string[] = []): MasterPlan {
  const missing: MissingMaster[] = [];
  const warnings: string[] = [];
  const need = (name: string, kind: MissingKind, groupOk: (g: string) => boolean, expected: string) => {
    const l = catalog.ledgers.get(key(name));
    if (!l) { missing.push({ kind, name }); return undefined; }
    if (!groupOk(l.rootGroup) && !groupOk(l.parent)) missing.push({ kind: MissingKind.WRONG_GROUP, name, detail: `is under "${l.parent}" (root "${l.rootGroup}"), expected ${expected}` });
    return l;
  };

  const party = need(input.party.name, MissingKind.PARTY_LEDGER, (g) => expect.partyGroups.some((p) => key(p) === key(g)), expect.partyGroups.join(" / "));
  need(input.ledgers.sales, MissingKind.SALES_LEDGER, (g) => key(g) === key(expect.salesGroup), expect.salesGroup);
  if (input.ledgers.roundOff) need(input.ledgers.roundOff, MissingKind.ROUND_OFF_LEDGER, () => true, "any");
  for (const name of taxLedgerNames) need(name, MissingKind.TAX_LEDGER, (g) => key(g) === key(expect.taxGroup), expect.taxGroup);
  for (const line of input.lines) if (!catalog.stockItems.has(key(line.itemName))) missing.push({ kind: MissingKind.STOCK_ITEM, name: line.itemName });

  if (party && input.party.gstin && party.gstin && party.gstin.toUpperCase() !== input.party.gstin.toUpperCase()) warnings.push(`GSTIN differs from Tally ledger (${party.gstin})`);
  if (catalog.companyState && input.companyState && key(catalog.companyState) !== key(input.companyState)) warnings.push(`companyState "${input.companyState}" differs from Tally's "${catalog.companyState}"`);
  return { ready: missing.length === 0, missing, partyIsBillWise: party?.isBillWise, warnings };
}
