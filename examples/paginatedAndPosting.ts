import { TallyClient, type Voucher } from "../src/index.js";

const client = new TallyClient("http://localhost", 9000);
const company = await client.getActiveCompany();

const ledgerPage = await client.getPaginatedObjects("Ledger", {
  company,
  pageNum: 1,
  recordsPerPage: 100,
});

console.log(`Ledgers page ${ledgerPage.pageNum}/${ledgerPage.totalPages}: ${ledgerPage.objects.length}`);

const voucher: Voucher = {
  date: new Date(),
  voucherType: "Sales",
  voucherNumber: "TS-1",
  partyName: "Demo Customer",
  isInvoice: true,
  ledgerEntries: [
    {
      ledgerName: "Demo Customer",
      amount: 1180,
      isDeemedPositive: true,
      billAllocations: [{ name: "TS-1", billType: "New Ref", amount: 1180 }],
    },
  ],
  inventoryAllocations: [
    {
      stockItemName: "Demo Item",
      quantity: "10 pcs",
      rate: "100/pcs",
      amount: 1000,
      isDeemedPositive: false,
      accountingAllocations: [{ ledgerName: "Sales", amount: -1000 }],
    },
  ],
};

const result = await client.postVouchers([voucher], { company });
console.table(result);
