import { parseExportCollection, type Voucher } from "../src/index.js";

const xml = `
<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION>
        <VOUCHER>
          <DATE>20260813</DATE>
          <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
          <VOUCHERNUMBER>INV-1001</VOUCHERNUMBER>
          <PARTYLEDGERNAME>Demo Customer</PARTYLEDGERNAME>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>Demo Customer</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>1180</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
        </VOUCHER>
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;

const vouchers = parseExportCollection<Voucher>(xml, "Voucher");

console.log(`Parsed ${vouchers.length} voucher(s)`);
console.log(vouchers[0]?.voucherType, vouchers[0]?.ledgerEntries?.[0]?.ledgerName);
