export type SqliteRow = { [column: string]: string | number | null | Uint8Array };
import { DatabaseSync } from "node:sqlite";
import { TALLY_SQLITE_DDL } from "./tables.js";
import type { Company, Group, Ledger, StockItem } from "../schema/masters/types.js";
import type { BaseObject } from "../schema/common/base.js";
import type { Voucher } from "../schema/transactions/types.js";

export interface SyncStats {
  companies: number;
  groups: number;
  ledgers: number;
  stockItems: number;
  vouchers: number;
  durationMs: number;
}

export class TallySqliteSyncEngine {
  public readonly db: DatabaseSync;

  constructor(dbPathOrInstance: string | DatabaseSync) {
    if (typeof dbPathOrInstance === "string") {
      this.db = new DatabaseSync(dbPathOrInstance);
    } else {
      this.db = dbPathOrInstance;
    }
    this.initTables();
  }

  initTables(): void {
    this.db.exec(TALLY_SQLITE_DDL);
  }

  syncAll(data: {
    companies?: Company[];
    groups?: Group[];
    ledgers?: Ledger[];
    stockItems?: StockItem[];
    vouchers?: Voucher[];
  }): SyncStats {
    const startTime = Date.now();
    const stats: SyncStats = {
      companies: 0,
      groups: 0,
      ledgers: 0,
      stockItems: 0,
      vouchers: 0,
      durationMs: 0
    };

    const now = new Date().toISOString();

    this.db.exec("BEGIN TRANSACTION;");
    try {
      // 1. Companies
      if (data.companies && data.companies.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO tally_companies (id, name, formal_name, starting_from, books_from, pan, gstin, state, country, currency, raw_tags, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, formal_name=excluded.formal_name, starting_from=excluded.starting_from,
            books_from=excluded.books_from, pan=excluded.pan, gstin=excluded.gstin, state=excluded.state,
            country=excluded.country, currency=excluded.currency, raw_tags=excluded.raw_tags, synced_at=excluded.synced_at
        `);
        for (const c of data.companies) {
          const id = c.name;
          const rawJson = JSON.stringify(c.tags ?? {});
          stmt.run(id, c.name, c.formalName ?? null, c.startingFrom ?? null, c.booksBeginningFrom ?? null, c.pan ?? null, c.gstin ?? null, c.state ?? null, c.country ?? null, c.currency ?? null, rawJson, now);
          stats.companies++;
        }
      }

      // 2. Groups
      if (data.groups && data.groups.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO tally_groups (name, parent, is_revenue, is_deemed_positive, affects_gross_profit, raw_tags, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            parent=excluded.parent, is_revenue=excluded.is_revenue, is_deemed_positive=excluded.is_deemed_positive,
            affects_gross_profit=excluded.affects_gross_profit, raw_tags=excluded.raw_tags, synced_at=excluded.synced_at
        `);
        for (const g of data.groups) {
          const rawJson = JSON.stringify(g.unknown ?? {});
          stmt.run(g.name, g.parent ?? null, g.isRevenue ? 1 : 0, g.isDeemedPositive ? 1 : 0, g.affectGrossProfit ? 1 : 0, rawJson, now);
          stats.groups++;
        }
      }

      // 3. Ledgers
      if (data.ledgers && data.ledgers.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO tally_ledgers (
            name, parent, opening_balance, closing_balance, is_deemed_positive, is_bill_wise,
            gstin, state, pan, email, phone, mobile, address, pin_code, bank_name,
            account_number, ifsc_code, msme_reg_number, msme_enterprise_type, msme_reg_date,
            credit_limit, credit_period, raw_tags, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            parent=excluded.parent, opening_balance=excluded.opening_balance, closing_balance=excluded.closing_balance,
            is_deemed_positive=excluded.is_deemed_positive, is_bill_wise=excluded.is_bill_wise, gstin=excluded.gstin,
            state=excluded.state, pan=excluded.pan, email=excluded.email, phone=excluded.phone, mobile=excluded.mobile,
            address=excluded.address, pin_code=excluded.pin_code, bank_name=excluded.bank_name,
            account_number=excluded.account_number, ifsc_code=excluded.ifsc_code, msme_reg_number=excluded.msme_reg_number,
            msme_enterprise_type=excluded.msme_enterprise_type, msme_reg_date=excluded.msme_reg_date,
            credit_limit=excluded.credit_limit, credit_period=excluded.credit_period, raw_tags=excluded.raw_tags, synced_at=excluded.synced_at
        `);
        for (const l of data.ledgers) {
          const rawTags = l.tags ?? {};
          const rawJson = JSON.stringify(rawTags);
          const opBal = typeof l.openingBalance === "object" ? l.openingBalance.value : (l.openingBalance ?? 0);
          const clBal = typeof l.closingBalance === "object" ? l.closingBalance.value : (l.closingBalance ?? 0);
          const crLimit = l.creditLimit ? parseFloat(l.creditLimit) || null : null;
          const msmeReg = (l as any).msmeRegNumber ?? rawTags.MSMEREGNUMBER ?? null;
          const msmeType = (l as any).msmeEnterpriseType ?? rawTags.ENTERPRISETYPE ?? null;
          const msmeDate = (l as any).msmeRegDate ?? rawTags.UDYAMREGISTRATIONDATE ?? null;

          stmt.run(
            l.name, l.parent ?? l.group, opBal, clBal, (l as any).isDeemedPositive ? 1 : 0, l.isBillWise ? 1 : 0,
            l.gstin ?? l.partyGstin ?? null, l.state ?? l.stateName ?? null, l.panNumber ?? null, l.email ?? null,
            l.phone ?? null, l.mobile ?? null, l.address ?? null, l.pinCode ?? l.pincode ?? null,
            l.bankName ?? null, l.accountNumber ?? null, l.ifsCode ?? null, msmeReg, msmeType, msmeDate,
            crLimit, l.creditPeriod ?? null, rawJson, now
          );
          stats.ledgers++;
        }
      }

      // 4. Stock Items
      if (data.stockItems && data.stockItems.length > 0) {
        const stmt = this.db.prepare(`
          INSERT INTO tally_stock_items (
            name, parent, category, base_unit, closing_balance_qty, closing_balance_unit,
            closing_rate, closing_value, opening_balance_qty, opening_value, hsn_code,
            hsn_description, gst_rate, taxability, costing_method, valuation_method, raw_tags, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(name) DO UPDATE SET
            parent=excluded.parent, category=excluded.category, base_unit=excluded.base_unit,
            closing_balance_qty=excluded.closing_balance_qty, closing_balance_unit=excluded.closing_balance_unit,
            closing_rate=excluded.closing_rate, closing_value=excluded.closing_value,
            opening_balance_qty=excluded.opening_balance_qty, opening_value=excluded.opening_value,
            hsn_code=excluded.hsn_code, hsn_description=excluded.hsn_description, gst_rate=excluded.gst_rate,
            taxability=excluded.taxability, costing_method=excluded.costing_method,
            valuation_method=excluded.valuation_method, raw_tags=excluded.raw_tags, synced_at=excluded.synced_at
        `);
        for (const s of data.stockItems) {
          const rawTags = s.tags ?? {};
          const rawJson = JSON.stringify(rawTags);
          const clBalQty = typeof (s as any).closingBalance === "object" ? (s as any).closingBalance?.value : ((s as any).closingBalance ?? 0);
          const clBalUnit = typeof (s as any).closingBalance === "object" ? (s as any).closingBalance?.unit : (s.baseUnit ?? null);
          const clRate = typeof (s as any).closingRate === "object" ? (s as any).closingRate?.value : ((s as any).closingRate ?? 0);
          const clVal = typeof (s as any).closingValue === "object" ? (s as any).closingValue?.value : ((s as any).closingValue ?? 0);
          const opQty = typeof (s as any).openingBalance === "object" ? (s as any).openingBalance?.value : ((s as any).openingBalance ?? 0);
          const opVal = typeof (s as any).openingValue === "object" ? (s as any).openingValue?.value : ((s as any).openingValue ?? 0);

          stmt.run(
            s.name, s.stockGroup ?? (s as any).parent ?? null, s.stockCategory ?? (s as any).category ?? null, s.baseUnit,
            clBalQty, clBalUnit, clRate, clVal, opQty, opVal, (s as any).hsnCode ?? null, (s as any).hsnDescription ?? null,
            (s as any).rateOfDuty ? parseFloat((s as any).rateOfDuty) || null : null, (s as any).taxability ?? null,
            s.costingMethod ?? null, s.valuationMethod ?? null, rawJson, now
          );
          stats.stockItems++;
        }
      }

      // 5. Vouchers & Allocations
      if (data.vouchers && data.vouchers.length > 0) {
        const vchStmt = this.db.prepare(`
          INSERT INTO tally_vouchers (
            guid, alter_id, voucher_number, voucher_type, date, effective_date, reference,
            reference_date, party_ledger_name, party_name, party_gstin, place_of_supply,
            buyer_name, buyer_gstin, consignee_name, consignee_gstin, amount, is_invoice,
            is_deemed_positive, narration, dispatch_doc_no, carrier_name, vehicle_no, irn, raw_tags, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(guid) DO UPDATE SET
            alter_id=excluded.alter_id, voucher_number=excluded.voucher_number, voucher_type=excluded.voucher_type,
            date=excluded.date, effective_date=excluded.effective_date, reference=excluded.reference,
            reference_date=excluded.reference_date, party_ledger_name=excluded.party_ledger_name,
            party_name=excluded.party_name, party_gstin=excluded.party_gstin, place_of_supply=excluded.place_of_supply,
            buyer_name=excluded.buyer_name, buyer_gstin=excluded.buyer_gstin, consignee_name=excluded.consignee_name,
            consignee_gstin=excluded.consignee_gstin, amount=excluded.amount, is_invoice=excluded.is_invoice,
            is_deemed_positive=excluded.is_deemed_positive, narration=excluded.narration,
            dispatch_doc_no=excluded.dispatch_doc_no, carrier_name=excluded.carrier_name, vehicle_no=excluded.vehicle_no,
            irn=excluded.irn, raw_tags=excluded.raw_tags, synced_at=excluded.synced_at
        `);

        const delLedStmt = this.db.prepare("DELETE FROM tally_voucher_ledger_entries WHERE voucher_guid = ?");
        const insLedStmt = this.db.prepare(`
          INSERT INTO tally_voucher_ledger_entries (voucher_guid, ledger_name, amount, is_deemed_positive, is_party_ledger, method_type)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        const delInvStmt = this.db.prepare("DELETE FROM tally_voucher_inventory_entries WHERE voucher_guid = ?");
        const insInvStmt = this.db.prepare(`
          INSERT INTO tally_voucher_inventory_entries (voucher_guid, stock_item_name, quantity, unit, rate, amount, is_deemed_positive, discount, discount_amount, hsn_code, gst_rate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const delBillStmt = this.db.prepare("DELETE FROM tally_voucher_bill_allocations WHERE voucher_guid = ?");
        const insBillStmt = this.db.prepare(`
          INSERT INTO tally_voucher_bill_allocations (voucher_guid, ledger_name, name, bill_type, amount, bill_date, due_date)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const v of data.vouchers) {
          const guid = v.guid || (v as any).remoteId || `vch_${v.voucherNumber}_${v.date}`;
          const rawTags = v.tags ?? {};
          const rawJson = JSON.stringify(rawTags);
          const dateStr = typeof v.date === "string" ? v.date : (v.date as Date).toISOString().slice(0, 10).replace(/-/g, "");
          const effDateStr = v.effectiveDate ? (typeof v.effectiveDate === "string" ? v.effectiveDate : (v.effectiveDate as Date).toISOString().slice(0, 10).replace(/-/g, "")) : null;
          const refDateStr = v.referenceDate ? (typeof v.referenceDate === "string" ? v.referenceDate : (v.referenceDate as Date).toISOString().slice(0, 10).replace(/-/g, "")) : null;
          const amtVal = typeof (v as any).amount === "object" ? (v as any).amount?.value : ((v as any).amount ?? 0);

          vchStmt.run(
            guid, v.alterId ?? null, v.voucherNumber ?? null, v.voucherType, dateStr, effDateStr,
            v.reference ?? null, refDateStr, v.partyLedgerName ?? v.partyName ?? null, v.partyName ?? null,
            v.partyGSTIN ?? null, v.placeOfSupply ?? null, v.buyerName ?? null, (v as any).buyerGSTIN ?? null,
            v.consigneeName ?? null, (v as any).consigneeGSTIN ?? null, amtVal, v.isInvoice ? 1 : 0,
            (v as any).isDeemedPositive ? 1 : 0, v.narration ?? null, (v as any).dispatchDocNo ?? null,
            (v as any).carrierName ?? null, (v as any).motorVehicleNo ?? null, (v as any).irn ?? null,
            rawJson, now
          );

          // Ledger entries
          delLedStmt.run(guid);
          if (v.ledgerEntries) {
            for (const le of v.ledgerEntries) {
              const leAmt = typeof le.amount === "object" ? le.amount.value : (le.amount ?? 0);
              insLedStmt.run(guid, le.ledgerName, leAmt, le.isDeemedPositive ? 1 : 0, le.isPartyLedger ? 1 : 0, le.methodType ?? null);

              // Bill allocations
              if (le.billAllocations) {
                delBillStmt.run(guid);
                for (const b of le.billAllocations) {
                  const bAmt = typeof b.amount === "object" ? b.amount.value : (b.amount ?? 0);
                  const bDueDate = b.dueDate ? (typeof b.dueDate === "string" ? b.dueDate : (b.dueDate as Date).toISOString().slice(0, 10)) : null;
                  insBillStmt.run(guid, le.ledgerName, b.name, b.billType ?? null, bAmt, b.billDate ?? null, bDueDate);
                }
              }
            }
          }

          // Inventory entries
          delInvStmt.run(guid);
          const invList = v.inventoryAllocations ?? v.allInventoryEntries;
          if (invList) {
            for (const inv of invList) {
              const invQty = typeof inv.actualQuantity === "object" ? (inv.actualQuantity as any)?.value : (typeof inv.quantity === "number" ? inv.quantity : parseFloat(String(inv.quantity)) || 0);
              const invUnit = typeof inv.actualQuantity === "object" ? (inv.actualQuantity as any)?.unit : (inv.unit ?? null);
              const invRate = typeof inv.rate === "object" ? (inv.rate as any)?.value : (typeof inv.rate === "number" ? inv.rate : parseFloat(String(inv.rate)) || 0);
              const invAmt = typeof inv.amount === "object" ? inv.amount.value : (inv.amount ?? 0);

              insInvStmt.run(
                guid, inv.stockItemName, invQty, invUnit, invRate, invAmt,
                inv.isDeemedPositive ? 1 : 0, inv.discount ?? null, inv.discountAmount ?? null,
                inv.hsnCode ?? null, (inv as any).gstRate ?? null
              );
            }
          }

          stats.vouchers++;
        }
      }

      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }

    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  query<T extends object = SqliteRow>(sql: string, params: (string | number | bigint | Uint8Array | null)[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }
}
