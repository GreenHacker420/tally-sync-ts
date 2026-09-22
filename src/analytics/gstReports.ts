import type { TallySqliteSyncEngine } from "../sqlite/syncEngine.js";

export interface Gstr1B2BInvoice {
  gstin: string;
  partyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  placeOfSupply: string;
  isReverseCharge: boolean;
  rate: number;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
}

export interface Gstr1HsnItem {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQuantity: number;
  totalValue: number;
  taxableValue: number;
  integratedTax: number;
  centralTax: number;
  stateTax: number;
  cessAmount: number;
}

export interface Gstr3bSummary {
  outwardTaxableSupplies: {
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
  };
  ineligibleItc: {
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
  };
  eligibleItc: {
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
  };
}

interface SqlB2BRow {
  gstin: string;
  partyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceValue: number;
  placeOfSupply: string;
  rate: number;
  taxableValue: number;
  realCgst: number;
  realSgst: number;
  realIgst: number;
  realCess: number;
}

export class TallyGstAnalytics {
  constructor(private readonly engine: TallySqliteSyncEngine) {}

  /**
   * Generates GSTR-1 Table 4: B2B Invoices using REAL accounting entries from Tally.
   * Extracts exact CGST, SGST, IGST, and Cess ledger entries directly from the voucher!
   */
  getGstr1B2B(options?: { fromDate?: string; toDate?: string }): Gstr1B2BInvoice[] {
    let sql = `
      SELECT 
        v.party_gstin AS gstin,
        v.party_ledger_name AS partyName,
        v.voucher_number AS invoiceNumber,
        v.date AS invoiceDate,
        v.amount AS invoiceValue,
        COALESCE(v.place_of_supply, l.state, '') AS placeOfSupply,
        COALESCE(inv.gst_rate, 18.0) AS rate,
        COALESCE(SUM(ABS(inv.amount)), ABS(v.amount)) AS taxableValue,
        COALESCE((
          SELECT SUM(ABS(amount)) FROM tally_voucher_ledger_entries 
          WHERE voucher_guid = v.guid AND (ledger_name LIKE '%CGST%' OR ledger_name LIKE '%CENTRAL TAX%')
        ), 0) AS realCgst,
        COALESCE((
          SELECT SUM(ABS(amount)) FROM tally_voucher_ledger_entries 
          WHERE voucher_guid = v.guid AND (ledger_name LIKE '%SGST%' OR ledger_name LIKE '%UTGST%' OR ledger_name LIKE '%STATE TAX%')
        ), 0) AS realSgst,
        COALESCE((
          SELECT SUM(ABS(amount)) FROM tally_voucher_ledger_entries 
          WHERE voucher_guid = v.guid AND (ledger_name LIKE '%IGST%' OR ledger_name LIKE '%INTEGRATED TAX%')
        ), 0) AS realIgst,
        COALESCE((
          SELECT SUM(ABS(amount)) FROM tally_voucher_ledger_entries 
          WHERE voucher_guid = v.guid AND (ledger_name LIKE '%CESS%')
        ), 0) AS realCess
      FROM tally_vouchers v
      JOIN tally_ledgers l ON v.party_ledger_name = l.name
      LEFT JOIN tally_voucher_inventory_entries inv ON v.guid = inv.voucher_guid
      WHERE (v.voucher_type = 'Sales' OR v.is_invoice = 1)
        AND v.party_gstin IS NOT NULL AND LENGTH(TRIM(v.party_gstin)) >= 15
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
    sql += " GROUP BY v.guid ORDER BY v.date DESC, v.voucher_number ASC";

    const rows = this.engine.query<SqlB2BRow>(sql, params);
    return rows.map(r => {
      // If ledger entries exist, use exact real tax. If no tax ledgers attached, compute from line items.
      const hasRealTax = (r.realCgst > 0 || r.realSgst > 0 || r.realIgst > 0);
      const computedTax = Math.round(r.taxableValue * (r.rate / 100.0) * 100) / 100;
      const isInterState = r.realIgst > 0;

      return {
        gstin: r.gstin,
        partyName: r.partyName,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        invoiceValue: r.invoiceValue,
        placeOfSupply: r.placeOfSupply,
        isReverseCharge: false,
        rate: r.rate,
        taxableValue: Math.round(r.taxableValue * 100) / 100,
        igstAmount: hasRealTax ? r.realIgst : (isInterState ? computedTax : 0),
        cgstAmount: hasRealTax ? r.realCgst : (isInterState ? 0 : Math.round((computedTax / 2) * 100) / 100),
        sgstAmount: hasRealTax ? r.realSgst : (isInterState ? 0 : Math.round((computedTax / 2) * 100) / 100),
        cessAmount: r.realCess
      };
    });
  }

  /**
   * Generates GSTR-1 Table 12: HSN Summary using actual invoice inventory entries.
   */
  getGstr1HsnSummary(options?: { fromDate?: string; toDate?: string }): Gstr1HsnItem[] {
    let sql = `
      SELECT 
        COALESCE(inv.hsn_code, s.hsn_code, '9999') AS hsnCode,
        COALESCE(s.hsn_description, inv.stock_item_name) AS description,
        COALESCE(inv.unit, s.base_unit, 'NOS') AS uqc,
        SUM(ABS(inv.quantity)) AS totalQuantity,
        SUM(ABS(inv.amount)) AS taxableValue,
        COALESCE(inv.gst_rate, s.gst_rate, 18.0) AS gstRate
      FROM tally_voucher_inventory_entries inv
      JOIN tally_vouchers v ON inv.voucher_guid = v.guid
      LEFT JOIN tally_stock_items s ON inv.stock_item_name = s.name
      WHERE (v.voucher_type = 'Sales' OR v.is_invoice = 1)
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
    sql += " GROUP BY hsnCode, uqc ORDER BY taxableValue DESC";

    interface SqlHsnRow {
      hsnCode: string;
      description: string;
      uqc: string;
      totalQuantity: number;
      taxableValue: number;
      gstRate: number;
    }

    const rows = this.engine.query<SqlHsnRow>(sql, params);
    return rows.map(r => {
      const rate = r.gstRate || 18.0;
      const taxAmt = Math.round(r.taxableValue * (rate / 100.0) * 100) / 100;
      return {
        hsnCode: r.hsnCode,
        description: r.description,
        uqc: r.uqc,
        totalQuantity: r.totalQuantity,
        totalValue: Math.round((r.taxableValue + taxAmt) * 100) / 100,
        taxableValue: Math.round(r.taxableValue * 100) / 100,
        integratedTax: 0,
        centralTax: Math.round((taxAmt / 2) * 100) / 100,
        stateTax: Math.round((taxAmt / 2) * 100) / 100,
        cessAmount: 0
      };
    });
  }

  /**
   * Generates GSTR-3B Summary figures derived from actual outward taxable supplies.
   */
  getGstr3bSummary(options?: { fromDate?: string; toDate?: string }): Gstr3bSummary {
    const b2b = this.getGstr1B2B(options);
    let totalTaxable = 0;
    let totalIgst = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalCess = 0;

    for (const item of b2b) {
      totalTaxable += item.taxableValue;
      totalIgst += item.igstAmount;
      totalCgst += item.cgstAmount;
      totalSgst += item.sgstAmount;
      totalCess += item.cessAmount;
    }

    return {
      outwardTaxableSupplies: {
        taxableValue: Math.round(totalTaxable * 100) / 100,
        igst: Math.round(totalIgst * 100) / 100,
        cgst: Math.round(totalCgst * 100) / 100,
        sgst: Math.round(totalSgst * 100) / 100,
        cess: Math.round(totalCess * 100) / 100
      },
      ineligibleItc: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
      eligibleItc: { igst: 0, cgst: 0, sgst: 0, cess: 0 }
    };
  }
}
