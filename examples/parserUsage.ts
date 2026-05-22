import { readFileSync } from "node:fs";
import { parseExportCollection, type Voucher } from "../src/index.js";

const xml = readFileSync("../src/Tests/TallyConnector.XmlTests/Resources/TallyPrime/V6/Voucher/Vouchers_Sales_complete.xml", "utf8");
const vouchers = parseExportCollection<Voucher>(xml, "Voucher");

console.log(`Parsed ${vouchers.length} vouchers`);
console.log(vouchers[0]?.voucherType, vouchers[0]?.ledgerEntries?.[0]?.ledgerName);
