import type { TallySqliteSyncEngine } from "../sqlite/syncEngine.js";

export interface RegisterEntry {
  date: string;
  voucherNumber: string;
  partyName: string;
  gstin?: string;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
}

export interface RatioAnalysisResult {
  workingCapital: number;
  currentRatio: number;
  quickRatio: number;
  debtorsTurnoverDays: number;
}

export interface AgingBucket {
  partyName: string;
  totalPending: number;
  bucket0To30: number;
  bucket31To60: number;
  bucket61To90: number;
  bucket90Plus: number;
}

interface SqlRegisterRow {
  date: string;
  voucherNumber: string | null;
  partyName: string | null;
  gstin: string | null;
  taxableAmount: number | null;
  taxLedgerAmount: number | null;
  netAmount: number;
}

export class TallyRegisterAnalytics {
  constructor(private readonly engine: TallySqliteSyncEngine) {}


  getSalesRegister(options?: { fromDate?: string; toDate?: string }): RegisterEntry[] {
    let sql = `
      SELECT 
        v.date,
        v.voucher_number AS voucherNumber,
        v.party_ledger_name AS partyName,
        v.party_gstin AS gstin,
        (
          SELECT SUM(ABS(amount)) FROM tally_voucher_inventory_entries 
          WHERE voucher_guid = v.guid
        ) AS taxableAmount,
        (
          SELECT SUM(ABS(amount)) FROM tally_voucher_ledger_entries 
          WHERE voucher_guid = v.guid AND (ledger_name LIKE '%GST%' OR ledger_name LIKE '%TAX%')
        ) AS taxLedgerAmount,
        ABS(v.amount) AS netAmount
      FROM tally_vouchers v
      WHERE v.voucher_type = 'Sales' OR v.is_invoice = 1
    `;
    const params: (string | number | bigint | Uint8Array | null)[] = [];
    if (options?.fromDate) {
      sql += " AND v.date >= ?";
      params.push(options.fromDate);
    }
    if (options?.toDate) {
      sql += " AND v.date <= ?";
      params.push(options.toDate);
    }
    sql += " ORDER BY v.date DESC, v.voucher_number ASC";

    const rows = this.engine.query<SqlRegisterRow>(sql, params);
    return rows.map(r => {
      const net = r.netAmount || 0;
      const tax = r.taxLedgerAmount !== null ? r.taxLedgerAmount : 0;
      const gross = r.taxableAmount !== null ? r.taxableAmount : (net - tax);

      return {
        date: r.date,
        voucherNumber: r.voucherNumber || "",
        partyName: r.partyName || "",
        gstin: r.gstin || undefined,
        grossAmount: Math.round(gross * 100) / 100,
        taxAmount: Math.round(tax * 100) / 100,
        netAmount: Math.round(net * 100) / 100
      };
    });
  }

  /**
   * Computes Ratio Analysis from actual balance sheet and sales figures.
   */
  getRatioAnalysis(): RatioAnalysisResult {
    const ledgers = this.engine.query<{ name: string; parent: string; closing_balance: number }>(`
      SELECT name, parent, closing_balance FROM tally_ledgers
    `);

    let currentAssets = 0;
    let currentLiab = 0;
    let debtors = 0;

    const inventoryRow = this.engine.query<{ total: number }>(`SELECT SUM(closing_value) as total FROM tally_stock_items`);
    const inventory = inventoryRow[0]?.total || 0;

    for (const l of ledgers) {
      const p = l.parent.toLowerCase();
      const bal = Math.abs(l.closing_balance || 0);
      if (p.includes("debtor")) { debtors += bal; currentAssets += bal; }
      else if (p.includes("bank") || p.includes("cash") || p.includes("current asset")) { currentAssets += bal; }
      else if (p.includes("creditor") || p.includes("current liabilit") || p.includes("duties & taxes")) { currentLiab += bal; }
    }

    currentAssets += inventory;
    const workingCapital = currentAssets - currentLiab;
    const currentRatio = currentLiab > 0 ? Math.round((currentAssets / currentLiab) * 100) / 100 : 0;
    const quickRatio = currentLiab > 0 ? Math.round(((currentAssets - inventory) / currentLiab) * 100) / 100 : 0;

    // Calculate real Days Sales Outstanding (DSO) = (Debtors / Annual Sales) * 365
    const salesRow = this.engine.query<{ total: number }>(`
      SELECT SUM(ABS(amount)) as total FROM tally_vouchers WHERE voucher_type = 'Sales' OR is_invoice = 1
    `);
    const totalSales = salesRow[0]?.total || 0;
    const debtorsTurnoverDays = totalSales > 0 ? Math.round((debtors / totalSales) * 365) : 0;

    return {
      workingCapital: Math.round(workingCapital * 100) / 100,
      currentRatio,
      quickRatio,
      debtorsTurnoverDays
    };
  }

  getAgingAnalysis(type: "receivables" | "payables" = "receivables", asOfDate?: string): AgingBucket[] {
    const parentFilter = type === "receivables" ? "%Debtor%" : "%Creditor%";
    const asOf = asOfDate ? new Date(asOfDate) : new Date();

    const sql = `
      SELECT 
        l.name AS partyName,
        l.closing_balance AS closingBalance,
        b.name AS billNumber,
        COALESCE(b.bill_date, v.date) AS billDate,
        b.amount AS billAmount
      FROM tally_ledgers l
      LEFT JOIN tally_voucher_bill_allocations b ON l.name = b.ledger_name
      LEFT JOIN tally_vouchers v ON b.voucher_guid = v.guid
      WHERE l.parent LIKE ?
      ORDER BY l.name ASC
    `;

    interface SqlAgingRow {
      partyName: string;
      closingBalance: number;
      billNumber: string | null;
      billDate: string | null;
      billAmount: number | null;
    }

    const rows = this.engine.query<SqlAgingRow>(sql, [parentFilter]);
    const map = new Map<string, AgingBucket>();

    for (const r of rows) {
      if (!map.has(r.partyName)) {
        map.set(r.partyName, {
          partyName: r.partyName,
          totalPending: Math.abs(r.closingBalance || 0),
          bucket0To30: 0,
          bucket31To60: 0,
          bucket61To90: 0,
          bucket90Plus: 0
        });
      }
      const entry = map.get(r.partyName)!;
      if (r.billAmount) {
        const amt = Math.abs(r.billAmount);
        const bDateStr = String(r.billDate);
        let bDate = new Date();
        if (bDateStr.length === 8) {
          bDate = new Date(parseInt(bDateStr.slice(0, 4)), parseInt(bDateStr.slice(4, 6)) - 1, parseInt(bDateStr.slice(6, 8)));
        }
        const days = Math.max(0, Math.floor((asOf.getTime() - bDate.getTime()) / (24 * 60 * 60 * 1000)));

        if (days <= 30) entry.bucket0To30 += amt;
        else if (days <= 60) entry.bucket31To60 += amt;
        else if (days <= 90) entry.bucket61To90 += amt;
        else entry.bucket90Plus += amt;
      }
    }

    return Array.from(map.values()).filter(e => e.totalPending > 0);
  }
}
