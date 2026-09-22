import type { TallySqliteSyncEngine } from "../sqlite/syncEngine.js";

export interface MsmeSupplierSummary {
  name: string;
  enterpriseType: "Micro" | "Small" | "Medium" | "Non-MSME";
  udyamNumber: string | null;
  registrationDate: string | null;
  closingBalance: number;
}

export interface MsmeOverdueBill {
  supplierName: string;
  enterpriseType: "Micro" | "Small" | "Medium";
  udyamNumber: string | null;
  billNumber: string;
  billDate: string;
  dueDate: string;
  statutoryLimitDays: number;
  statutoryDueDate: string;
  daysOverdue: number;
  outstandingAmount: number;
  section43bDisallowanceRisk: boolean;
  penalInterestLiable: number;
}

export class TallyMsmeAnalytics {
  constructor(private readonly engine: TallySqliteSyncEngine) {}

  /**
   * Returns all Sundry Creditors categorized by MSME status
   */
  getMsmeSuppliersSummary(): MsmeSupplierSummary[] {
    const sql = `
      SELECT 
        name,
        COALESCE(msme_enterprise_type, 'Non-MSME') as enterpriseType,
        msme_reg_number as udyamNumber,
        msme_reg_date as registrationDate,
        closing_balance as closingBalance
      FROM tally_ledgers
      WHERE parent LIKE '%Creditor%' OR parent LIKE '%Supplier%'
      ORDER BY closing_balance DESC
    `;
    return this.engine.query<MsmeSupplierSummary>(sql);
  }

  /**
   * Computes Section 43B(h) overdue bills from Micro & Small suppliers.
   * Statutory rule: Max 15 days without agreement, max 45 days with written agreement.
   * RBI compound interest rate: 3x RBI Bank Rate (Bank Rate ~6.75% -> 20.25% p.a. compounded monthly).
   */
  getMsme43bOverdueReport(options?: { asOfDate?: string; customAgreementDays?: number }): MsmeOverdueBill[] {
    const asOf = options?.asOfDate ? new Date(options.asOfDate) : new Date();
    const agreementDays = options?.customAgreementDays ?? 45;

    const sql = `
      SELECT 
        l.name as supplierName,
        l.msme_enterprise_type as enterpriseType,
        l.msme_reg_number as udyamNumber,
        b.name as billNumber,
        COALESCE(b.bill_date, v.date) as billDate,
        COALESCE(b.due_date, v.date) as dueDate,
        b.amount as outstandingAmount
      FROM tally_voucher_bill_allocations b
      JOIN tally_vouchers v ON b.voucher_guid = v.guid
      JOIN tally_ledgers l ON b.ledger_name = l.name
      WHERE l.msme_enterprise_type IN ('Micro', 'Small')
        AND b.amount > 0
    `;
    const rows = this.engine.query<any>(sql);
    const results: MsmeOverdueBill[] = [];

    for (const r of rows) {
      // Parse bill date (YYYYMMDD or ISO)
      const bDateStr = String(r.billDate);
      let bDate: Date;
      if (bDateStr.length === 8) {
        bDate = new Date(parseInt(bDateStr.slice(0, 4)), parseInt(bDateStr.slice(4, 6)) - 1, parseInt(bDateStr.slice(6, 8)));
      } else {
        bDate = new Date(bDateStr);
      }

      // Calculate statutory deadline date
      const statDate = new Date(bDate.getTime() + agreementDays * 24 * 60 * 60 * 1000);
      const diffMs = asOf.getTime() - statDate.getTime();
      const daysOverdue = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

      // Interest rate: 20.25% annual compounded monthly = (1 + 0.2025/12)^(months) - 1
      let interest = 0;
      if (daysOverdue > 0) {
        const months = daysOverdue / 30.0;
        const compoundFactor = Math.pow(1 + (0.2025 / 12), months) - 1;
        interest = Math.round(r.outstandingAmount * compoundFactor * 100) / 100;
      }

      results.push({
        supplierName: r.supplierName,
        enterpriseType: r.enterpriseType,
        udyamNumber: r.udyamNumber,
        billNumber: r.billNumber,
        billDate: bDate.toISOString().slice(0, 10),
        dueDate: r.dueDate,
        statutoryLimitDays: agreementDays,
        statutoryDueDate: statDate.toISOString().slice(0, 10),
        daysOverdue,
        outstandingAmount: r.outstandingAmount,
        section43bDisallowanceRisk: daysOverdue > 0,
        penalInterestLiable: interest
      });
    }

    return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }
}
