import type { TallySqliteSyncEngine } from "../sqlite/syncEngine.js";

export interface FinancialLine {
  groupName: string;
  amount: number;
}

export interface ProfitAndLossReport {
  tradingRevenue: FinancialLine[];
  costOfGoodsSold: FinancialLine[];
  grossProfit: number;
  indirectIncomes: FinancialLine[];
  indirectExpenses: FinancialLine[];
  netProfit: number;
}

export interface BalanceSheetReport {
  sourcesOfFunds: {
    capitalAccount: number;
    loansAndLiabilities: number;
    currentLiabilities: number;
    total: number;
  };
  applicationOfFunds: {
    fixedAssets: number;
    investments: number;
    currentAssets: number;
    closingStock: number;
    bankAndCash: number;
    total: number;
  };
}

interface GroupBalanceRow {
  name: string;
  parent: string;
  closing_balance: number;
}

export class TallyFinancialAnalytics {
  constructor(private readonly engine: TallySqliteSyncEngine) {}


  getProfitAndLoss(): ProfitAndLossReport {
    const ledgers = this.engine.query<GroupBalanceRow>(`
      SELECT name, parent, closing_balance FROM tally_ledgers
    `);

    let sales = 0;
    let purchases = 0;
    let directExpenses = 0;
    let indirectExpenses = 0;
    let indirectIncomes = 0;

    for (const l of ledgers) {
      const p = l.parent;
      const bal = Math.abs(l.closing_balance || 0);

      // Standard Tally Primary Income & Expense Groups
      if (p === "Sales Accounts" || p === "Direct Incomes") {
        sales += bal;
      } else if (p === "Purchase Accounts") {
        purchases += bal;
      } else if (p === "Direct Expenses") {
        directExpenses += bal;
      } else if (p === "Indirect Expenses") {
        indirectExpenses += bal;
      } else if (p === "Indirect Incomes") {
        indirectIncomes += bal;
      }
    }

    const cogs = purchases + directExpenses;
    const grossProfit = sales - cogs;
    const netProfit = grossProfit + indirectIncomes - indirectExpenses;

    return {
      tradingRevenue: [{ groupName: "Sales Accounts", amount: Math.round(sales * 100) / 100 }],
      costOfGoodsSold: [{ groupName: "Cost of Goods Sold", amount: Math.round(cogs * 100) / 100 }],
      grossProfit: Math.round(grossProfit * 100) / 100,
      indirectIncomes: [{ groupName: "Indirect Incomes", amount: Math.round(indirectIncomes * 100) / 100 }],
      indirectExpenses: [{ groupName: "Indirect Expenses", amount: Math.round(indirectExpenses * 100) / 100 }],
      netProfit: Math.round(netProfit * 100) / 100
    };
  }

  /**
   * Generates Balance Sheet based on Tally's standard Capital, Liability & Asset groups.
   */
  getBalanceSheet(): BalanceSheetReport {
    const ledgers = this.engine.query<GroupBalanceRow>(`
      SELECT name, parent, closing_balance FROM tally_ledgers
    `);

    let capital = 0;
    let loans = 0;
    let currentLiab = 0;
    let fixedAssets = 0;
    let investments = 0;
    let currentAssets = 0;
    let bankCash = 0;

    for (const l of ledgers) {
      const p = l.parent;
      const bal = Math.abs(l.closing_balance || 0);

      if (p === "Capital Account" || p === "Reserves & Surplus") {
        capital += bal;
      } else if (p === "Loans (Liability)" || p === "Bank OD A/c" || p === "Secured Loans" || p === "Unsecured Loans") {
        loans += bal;
      } else if (p === "Current Liabilities" || p === "Sundry Creditors" || p === "Duties & Taxes" || p === "Provisions") {
        currentLiab += bal;
      } else if (p === "Fixed Assets") {
        fixedAssets += bal;
      } else if (p === "Investments") {
        investments += bal;
      } else if (p === "Sundry Debtors" || p === "Current Assets" || p === "Loans & Advances (Asset)") {
        currentAssets += bal;
      } else if (p === "Bank Accounts" || p === "Cash-in-hand") {
        bankCash += bal;
      }
    }

    const stockRow = this.engine.query<{ total: number }>(`
      SELECT SUM(closing_value) as total FROM tally_stock_items
    `);
    const closingStock = stockRow[0]?.total || 0;

    const totalSources = capital + loans + currentLiab;
    const totalApps = fixedAssets + investments + currentAssets + closingStock + bankCash;

    return {
      sourcesOfFunds: {
        capitalAccount: Math.round(capital * 100) / 100,
        loansAndLiabilities: Math.round(loans * 100) / 100,
        currentLiabilities: Math.round(currentLiab * 100) / 100,
        total: Math.round(totalSources * 100) / 100
      },
      applicationOfFunds: {
        fixedAssets: Math.round(fixedAssets * 100) / 100,
        investments: Math.round(investments * 100) / 100,
        currentAssets: Math.round(currentAssets * 100) / 100,
        closingStock: Math.round(closingStock * 100) / 100,
        bankAndCash: Math.round(bankCash * 100) / 100,
        total: Math.round(totalApps * 100) / 100
      }
    };
  }
}
