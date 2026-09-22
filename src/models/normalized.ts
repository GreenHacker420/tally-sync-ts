import { Voucher } from "../schema/transactions/types.js";

export interface NormalizedLedgerPosting {
  ledgerName: string;
  amount: number;
  isParty: boolean;
  isDuty: boolean;
}

export interface NormalizedInventoryLine {
  itemName: string;
  quantity: number;
  unit?: string;
  rate: number;
  amount: number;
  hsnCode?: string;
}

export interface NormalizedTaxLine {
  dutyHead: string;
  rate?: number;
  amount: number;
}

export interface NormalizedVoucher {
  id: string;
  date: string;
  type: string;
  number?: string;
  party?: string;
  debits: NormalizedLedgerPosting[];
  credits: NormalizedLedgerPosting[];
  inventory: NormalizedInventoryLine[];
  taxes: NormalizedTaxLine[];
  total: number;
}

export function normalizeVoucher(vch: Voucher): NormalizedVoucher {
  const debits: NormalizedLedgerPosting[] = [];
  const credits: NormalizedLedgerPosting[] = [];
  const taxes: NormalizedTaxLine[] = [];
  const inventory: NormalizedInventoryLine[] = [];

  const ledgers = vch.allLedgerEntries || vch.ledgerEntries || [];
  for (const l of ledgers) {
    const amt = typeof l.amount === "number" ? l.amount : l.amount?.value ?? 0;
    const posting: NormalizedLedgerPosting = {
      ledgerName: l.ledgerName,
      amount: Math.abs(amt),
      isParty: !!l.isPartyLedger,
      isDuty: !!l.isDutyLedger,
    };
    if (l.isDutyLedger || l.methodType === "GST") {
      taxes.push({
        dutyHead: l.gstDutyHead || l.ledgerName,
        rate: l.gstTaxRate,
        amount: Math.abs(amt),
      });
    }
    if (amt < 0 || l.isDeemedPositive) {
      debits.push(posting);
    } else {
      credits.push(posting);
    }
  }

  const items = vch.allInventoryEntries || vch.inventoryAllocations || [];
  for (const it of items) {
    const amt = typeof it.amount === "number" ? it.amount : it.amount?.value ?? 0;
    const rateVal = typeof it.rate === "number" ? it.rate : (typeof it.rate === "object" ? it.rate.value : parseFloat(String(it.rate)) || 0);
    const qtyVal = typeof it.actualQuantity === "object" ? it.actualQuantity.value : parseFloat(String(it.actualQuantity || it.quantity)) || 0;
    inventory.push({
      itemName: it.stockItemName,
      quantity: qtyVal,
      unit: it.unit,
      rate: rateVal,
      amount: Math.abs(amt),
      hsnCode: it.hsnCode,
    });
  }

  const total = typeof vch.amount === "number" ? vch.amount : vch.amount?.value ?? (debits[0]?.amount || 0);

  return {
    id: vch.guid || vch.remoteId || String(vch.masterId || ""),
    date: vch.date,
    type: vch.voucherType,
    number: vch.voucherNumber,
    party: vch.partyName,
    debits,
    credits,
    inventory,
    taxes,
    total,
  };
}
