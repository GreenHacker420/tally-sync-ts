import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { escapeXml, formatDateForTally, buildExportCollectionXml, buildPostXml, buildMasterStatisticsXml, buildVoucherStatisticsXml, buildCountRequestXml, buildPeriodicVoucherStatisticsXml } from "../src/xmlBuilder.js";
import { parseActiveCompany, parseLicenseInfo, parseLastAlterIds, parseExportCollection, parsePostResponse, checkTallyError, parseMasterStatistics, parseVoucherStatistics, parseCountResponse, parsePeriodicVoucherStatistics, parseTallyBoolean, parseTallyNumeric, asArray } from "../src/xmlParser.js";
import { TallyClient } from "../src/client.js";
import { TallyTransport } from "../src/transport.js";
import { Ledger, Group, Voucher, Currency, GSTRegistration, AttendanceType, Budget } from "../src/types.js";

test("XML Builder - escapeXml", () => {
  assert.strictEqual(escapeXml("Sales & Services"), "Sales &amp; Services");
  assert.strictEqual(escapeXml("<test>"), "&lt;test&gt;");
  assert.strictEqual(escapeXml(123), "123");
  assert.strictEqual(escapeXml(undefined), "");
});

test("XML Builder - formatDateForTally", () => {
  assert.strictEqual(formatDateForTally(new Date("2026-05-21")), "20260521");
  assert.strictEqual(formatDateForTally("2026-04-01T12:00:00Z"), "20260401");
  assert.strictEqual(formatDateForTally(""), "");
});

test("XML Builder - Export Collection XML", () => {
  const xml = buildExportCollectionXml("Ledger", {
    company: "My Company",
    fetchList: ["Name", "Parent"],
    filters: [{ name: "MyFilter", formula: "$Name = \"Cash\"" }],
  });

  assert.ok(xml.includes("<SVCURRENTCOMPANY>My Company</SVCURRENTCOMPANY>"));
  assert.ok(xml.includes("<TYPE>Ledger</TYPE>"));
  assert.ok(xml.includes("<NATIVEMETHOD>Name</NATIVEMETHOD>"));
  assert.ok(xml.includes("<FILTERS>MyFilter</FILTERS>"));
  assert.ok(xml.includes('NAME="MyFilter"'));
});

test("XML Builder - Post Ledgers XML", () => {
  const ledgers: Ledger[] = [
    { name: "TC_Test Ledger", group: "Sundry Debtors", openingBalance: 5000 },
  ];
  const xml = buildPostXml("Ledger", ledgers, { company: "Test Comp", stopAtFirstError: true });

  assert.ok(xml.includes("<SVCURRENTCOMPANY>Test Comp</SVCURRENTCOMPANY>"));
  assert.ok(xml.includes('<LEDGER NAME="TC_Test Ledger" ACTION="Create">'));
  assert.ok(xml.includes("<PARENT>Sundry Debtors</PARENT>"));
  assert.ok(xml.includes("<OPENINGBALANCE>5000</OPENINGBALANCE>"));
  assert.ok(xml.includes("<SVIMPBEHAVIOUREXCP>Stop Import at First Exception</SVIMPBEHAVIOUREXCP>"));
});

test("XML Builder - Post Voucher XML", () => {
  const vouchers: Voucher[] = [
    {
      date: "2026-05-21",
      voucherType: "Sales",
      partyName: "Cust1",
      narration: "Test Narration",
      ledgerEntries: [
        { ledgerName: "Cust1", amount: 1000, isDeemedPositive: true },
        { ledgerName: "Sales", amount: -1000, isDeemedPositive: false },
      ],
    },
  ];
  const xml = buildPostXml("Voucher", vouchers);

  assert.ok(xml.includes('<VOUCHER VCHTYPE="Sales" ACTION="Create">'));
  assert.ok(xml.includes("<DATE>20260521</DATE>"));
  assert.ok(xml.includes("<PARTYLEDGERNAME>Cust1</PARTYLEDGERNAME>"));
  assert.ok(xml.includes("<NARRATION>Test Narration</NARRATION>"));
  assert.ok(xml.includes("<LEDGERNAME>Sales</LEDGERNAME>"));
  assert.ok(xml.includes("<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>"));
  assert.ok(xml.includes("<AMOUNT>-1000</AMOUNT>"));
});

test("XML Parser - Active Company", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <RESULT>Test Active Company</RESULT>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const name = parseActiveCompany(xml);
  assert.strictEqual(name, "Test Active Company");
});

test("XML Parser - License Info", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <OBJECT NAME="TC_LicenseInfoObject">
              <SERIALNUMBER>123456789</SERIALNUMBER>
              <ACCOUNTID>admin@test.com</ACCOUNTID>
              <ADMINMAILID>admin@test.com</ADMINMAILID>
              <ISADMIN>true</ISADMIN>
              <ISEDUCATIONALMODE>false</ISEDUCATIONALMODE>
              <PLANNAME>Gold Edition</PLANNAME>
              <TALLYVERSION>Tally Prime 6.0</TALLYVERSION>
              <IsTallyPrime>true</IsTallyPrime>
            </OBJECT>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const license = parseLicenseInfo(xml);
  assert.strictEqual(license.serialNumber, "123456789");
  assert.strictEqual(license.accountId, "admin@test.com");
  assert.strictEqual(license.isAdmin, true);
  assert.strictEqual(license.isEducationalMode, false);
  assert.strictEqual(license.isTallyPrime, true);
});

test("XML Parser - Last Alter IDs", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <TC_ALTERIDSREPORT>
            <MastersLastId>1502</MastersLastId>
            <VouchersLastId>489</VouchersLastId>
          </TC_ALTERIDSREPORT>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const ids = parseLastAlterIds(xml);
  assert.strictEqual(ids.mastersLastId, 1502);
  assert.strictEqual(ids.vouchersLastId, 489);
});

test("XML Parser - Export Collection Ledgers", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <LEDGER>
              <NAME>Cash</NAME>
              <PARENT>Cash-in-hand</PARENT>
              <OPENINGBALANCE>12500</OPENINGBALANCE>
              <MASTERID>12</MASTERID>
              <ALTERID>34</ALTERID>
            </LEDGER>
            <LEDGER>
              <NAME>Bank Account</NAME>
              <PARENT>Bank Accounts</PARENT>
              <OPENINGBALANCE>450000</OPENINGBALANCE>
              <MASTERID>13</MASTERID>
              <ALTERID>35</ALTERID>
            </LEDGER>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const ledgers = parseExportCollection<Ledger>(xml, "Ledger");
  assert.strictEqual(ledgers.length, 2);
  assert.strictEqual(ledgers[0].name, "Cash");
  assert.strictEqual(ledgers[0].group, "Cash-in-hand");
  assert.strictEqual(ledgers[0].openingBalance, 12500);
  assert.strictEqual(ledgers[0].masterId, 12);

  assert.strictEqual(ledgers[1].name, "Bank Account");
  assert.strictEqual(ledgers[1].group, "Bank Accounts");
  assert.strictEqual(ledgers[1].openingBalance, 450000);
  assert.strictEqual(ledgers[1].masterId, 13);
});

test("XML Parser - Post Success Response", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <IMPORTRESULT>
            <CREATED>1</CREATED>
            <ALTERED>0</ALTERED>
            <DELETED>0</DELETED>
            <LASTVCHID>2045</LASTVCHID>
          </IMPORTRESULT>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const resp = parsePostResponse(xml);
  assert.strictEqual(resp.length, 1);
  assert.strictEqual(resp[0].status, "success");
  assert.strictEqual(resp[0].message, "Created successfully");
  assert.strictEqual(resp[0].masterId, 2045);
});

test("XML Parser - Post Failure Response", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <LINEERROR>Ledger 'TC_Test Ledger' already exists!</LINEERROR>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const resp = parsePostResponse(xml);
  assert.strictEqual(resp.length, 1);
  assert.strictEqual(resp[0].status, "failure");
  assert.strictEqual(resp[0].message, "Ledger 'TC_Test Ledger' already exists!");
});

test("XML Builder - Post Company, Unit, StockItem, Employee XML", () => {
  const companies = [
    {
      name: "Acme Corp Ltd",
      formalName: "Acme Corporation Limited",
      state: "Maharashtra",
      country: "India",
      pinCode: "400001",
      email: "info@acme.com",
      pan: "ABCDE1234F",
      isInventoryOn: true,
      isGSTOn: true,
      isPayrollOn: true
    }
  ];
  const companyXml = buildPostXml("Company", companies);
  assert.ok(companyXml.includes('<COMPANY NAME="Acme Corp Ltd" ACTION="Create">'));
  assert.ok(companyXml.includes("<BASICCOMPANYFORMALNAME>Acme Corporation Limited</BASICCOMPANYFORMALNAME>"));
  assert.ok(companyXml.includes("<STATENAME>Maharashtra</STATENAME>"));
  assert.ok(companyXml.includes("<INCOMETAXNUMBER>ABCDE1234F</INCOMETAXNUMBER>"));
  assert.ok(companyXml.includes("<ISINVENTORYON>Yes</ISINVENTORYON>"));
  assert.ok(companyXml.includes("<ISGSTON>Yes</ISGSTON>"));
  assert.ok(companyXml.includes("<ISPAYROLLON>Yes</ISPAYROLLON>"));

  const units = [
    {
      name: "dzn",
      formalName: "Dozens",
      isSimpleUnit: true,
      decimalPlaces: 2
    }
  ];
  const unitXml = buildPostXml("Unit", units);
  assert.ok(unitXml.includes('<UNIT NAME="dzn" ACTION="Create">'));
  assert.ok(unitXml.includes("<ORIGINALNAME>Dozens</ORIGINALNAME>"));
  assert.ok(unitXml.includes("<DECIMALPLACES>2</DECIMALPLACES>"));

  const stockItems = [
    {
      name: "Premium Widget",
      baseUnit: "pcs",
      stockGroup: "Widgets Group",
      openingBalance: 100,
      openingRate: 25,
      openingValue: 2500,
      mailingNames: ["Premium Widget", "PW-99"],
      openingBatchAllocations: [
        {
          batchName: "B1",
          godownName: "Main Store",
          quantity: 100,
          rate: 25,
          value: 2500
        }
      ],
      components: [
        {
          name: "Widget BOM",
          baseQuantity: 1,
          componentListItems: [
            {
              natureOfComponent: "Standard",
              itemName: "Raw Part A",
              actualQuantity: 2
            }
          ]
        }
      ]
    }
  ];
  const itemXml = buildPostXml("StockItem", stockItems);
  assert.ok(itemXml.includes('<STOCKITEM NAME="Premium Widget" ACTION="Create">'));
  assert.ok(itemXml.includes("<BASEUNITS>pcs</BASEUNITS>"));
  assert.ok(itemXml.includes("<PARENT>Widgets Group</PARENT>"));
  assert.ok(itemXml.includes("<OPENINGBALANCE>100</OPENINGBALANCE>"));
  assert.ok(itemXml.includes("<BATCHNAME>B1</BATCHNAME>"));
  assert.ok(itemXml.includes("<GODOWNNAME>Main Store</GODOWNNAME>"));
  assert.ok(itemXml.includes("<COMPONENTLISTNAME>Widget BOM</COMPONENTLISTNAME>"));
  assert.ok(itemXml.includes("<COMPONENTBASICQTY>1</COMPONENTBASICQTY>"));
  assert.ok(itemXml.includes("<STOCKITEMNAME>Raw Part A</STOCKITEMNAME>"));
  assert.ok(itemXml.includes("<ACTUALQTY>2</ACTUALQTY>"));
});

test("XML Parser - Export Collection Unit, StockGroup, StockItem, Employee", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <UNIT>
              <NAME>dzn</NAME>
              <ORIGINALNAME>Dozens</ORIGINALNAME>
              <DECIMALPLACES>2</DECIMALPLACES>
              <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>
            </UNIT>
            <STOCKGROUP>
              <NAME>Electronics</NAME>
              <PARENT>Products</PARENT>
              <ISADDABLE>Yes</ISADDABLE>
            </STOCKGROUP>
            <STOCKITEM>
              <NAME>Smart TV</NAME>
              <BASEUNITS>pcs</BASEUNITS>
              <PARENT>Electronics</PARENT>
              <OPENINGBALANCE>10</OPENINGBALANCE>
              <OPENINGRATE>500</OPENINGRATE>
              <OPENINGVALUE>5000</OPENINGVALUE>
              <MAILINGNAME.LIST>
                <MAILINGNAME>Smart TV</MAILINGNAME>
                <MAILINGNAME>TV-123</MAILINGNAME>
              </MAILINGNAME.LIST>
              <BATCHALLOCATIONS.LIST>
                <BATCHNAME>B2</BATCHNAME>
                <GODOWNNAME>Warehouse</GODOWNNAME>
                <OPENINGBALANCE>10</OPENINGBALANCE>
                <OPENINGRATE>500</OPENINGRATE>
                <OPENINGVALUE>5000</OPENINGVALUE>
              </BATCHALLOCATIONS.LIST>
              <MULTICOMPONENTLIST.LIST>
                <COMPONENTLISTNAME>TV BOM</COMPONENTLISTNAME>
                <COMPONENTBASICQTY>1</COMPONENTBASICQTY>
                <MULTICOMPONENTITEMLIST.LIST>
                  <NATUREOFITEM>Standard</NATUREOFITEM>
                  <STOCKITEMNAME>LED Panel</STOCKITEMNAME>
                  <ACTUALQTY>1</ACTUALQTY>
                </MULTICOMPONENTITEMLIST.LIST>
              </MULTICOMPONENTLIST.LIST>
            </STOCKITEM>
            <COSTCENTRE>
              <NAME>John Doe</NAME>
              <CATEGORY>Employees</CATEGORY>
              <PARENT>Sales Dept</PARENT>
              <EMAILID>john@acme.com</EMAILID>
              <REVENUELEDFOROPBAL>Yes</REVENUELEDFOROPBAL>
            </COSTCENTRE>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const units = parseExportCollection<any>(xml, "Unit");
  assert.strictEqual(units.length, 1);
  assert.strictEqual(units[0].name, "dzn");
  assert.strictEqual(units[0].formalName, "Dozens");
  assert.strictEqual(units[0].decimalPlaces, 2);
  assert.strictEqual(units[0].isSimpleUnit, true);

  const stockGroups = parseExportCollection<any>(xml, "StockGroup");
  assert.strictEqual(stockGroups.length, 1);
  assert.strictEqual(stockGroups[0].name, "Electronics");
  assert.strictEqual(stockGroups[0].parent, "Products");
  assert.strictEqual(stockGroups[0].isAddable, true);

  const stockItems = parseExportCollection<any>(xml, "StockItem");
  assert.strictEqual(stockItems.length, 1);
  assert.strictEqual(stockItems[0].name, "Smart TV");
  assert.strictEqual(stockItems[0].baseUnit, "pcs");
  assert.strictEqual(stockItems[0].stockGroup, "Electronics");
  assert.strictEqual(stockItems[0].openingBalance, 10);
  assert.strictEqual(stockItems[0].openingRate, 500);
  assert.strictEqual(stockItems[0].openingValue, 5000);
  assert.deepEqual(stockItems[0].mailingNames, ["Smart TV", "TV-123"]);

  assert.strictEqual(stockItems[0].openingBatchAllocations?.length, 1);
  assert.strictEqual(stockItems[0].openingBatchAllocations[0].batchName, "B2");
  assert.strictEqual(stockItems[0].openingBatchAllocations[0].godownName, "Warehouse");
  assert.strictEqual(stockItems[0].openingBatchAllocations[0].quantity, 10);

  assert.strictEqual(stockItems[0].components?.length, 1);
  assert.strictEqual(stockItems[0].components[0].name, "TV BOM");
  assert.strictEqual(stockItems[0].components[0].baseQuantity, 1);
  assert.strictEqual(stockItems[0].components[0].componentListItems?.length, 1);
  assert.strictEqual(stockItems[0].components[0].componentListItems[0].itemName, "LED Panel");
  assert.strictEqual(stockItems[0].components[0].componentListItems[0].actualQuantity, 1);

  const employees = parseExportCollection<any>(xml, "Employee");
  assert.strictEqual(employees.length, 1);
  assert.strictEqual(employees[0].name, "John Doe");
  assert.strictEqual(employees[0].category, "Employees");
  assert.strictEqual(employees[0].parent, "Sales Dept");
  assert.strictEqual(employees[0].emailId, "john@acme.com");
  assert.strictEqual(employees[0].showOpeningBal, true);
});

test("XML Builder - Master Statistics uses TDL Report", () => {
  const masterXml = buildMasterStatisticsXml();
  assert.ok(masterXml.includes("<TYPE>DATA</TYPE>"));
  assert.ok(masterXml.includes("<ID>TC_MasterStatisticsReport</ID>"));
  assert.ok(masterXml.includes('<REPORT NAME="TC_MasterStatisticsReport">'));
  assert.ok(masterXml.includes('<PART NAME="TC_MasterStatisticsReport">'));
  assert.ok(masterXml.includes("<REPEAT>TC_MasterStatisticsReport : STATObjects</REPEAT>"));
  assert.ok(masterXml.includes('<FIELD NAME="TC_MSCount">'));
  assert.ok(masterXml.includes("<SET>if $$ISEMPTY:$StatVal then 0 else $StatVal</SET>"));
  assert.ok(!masterXml.includes("TC_STATObjectsCollection"));
});

test("XML Builder - Voucher Statistics uses TDL Report", () => {
  const voucherXml = buildVoucherStatisticsXml();
  assert.ok(voucherXml.includes("<TYPE>DATA</TYPE>"));
  assert.ok(voucherXml.includes("<ID>TC_VoucherStatisticsReport</ID>"));
  assert.ok(voucherXml.includes('<REPORT NAME="TC_VoucherStatisticsReport">'));
  assert.ok(voucherXml.includes("<REPEAT>TC_VoucherStatisticsReport : STATVchType</REPEAT>"));
  assert.ok(voucherXml.includes('<FIELD NAME="TC_VSCount">'));
  assert.ok(voucherXml.includes('<FIELD NAME="TC_VSCancelledCount">'));
  assert.ok(voucherXml.includes('<FIELD NAME="TC_VSTotalCount">'));
  assert.ok(voucherXml.includes('<FIELD NAME="TC_VSOptionalCount">'));
  assert.ok(!voucherXml.includes("TC_STATVchTypeCollection"));
});


test("XML Parser - Master Statistics from TDL Report", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <TC_MASTERSTATISTICSREPORT>
            <NAME>Ledgers</NAME>
            <COUNT>120</COUNT>
          </TC_MASTERSTATISTICSREPORT>
          <TC_MASTERSTATISTICSREPORT>
            <NAME>Groups</NAME>
            <COUNT>28</COUNT>
          </TC_MASTERSTATISTICSREPORT>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const masterStats = parseMasterStatistics(xml);
  assert.strictEqual(masterStats.length, 2);
  assert.strictEqual(masterStats[0].name, "Ledgers");
  assert.strictEqual(masterStats[0].count, 120);
  assert.strictEqual(masterStats[1].name, "Groups");
  assert.strictEqual(masterStats[1].count, 28);
});

test("XML Parser - Master Statistics from TDL Report (Direct Envelope)", () => {
  const xml = `
    <ENVELOPE>
      <TC_MASTERSTATISTICSREPORT>
        <NAME>Ledgers</NAME>
        <COUNT>120</COUNT>
      </TC_MASTERSTATISTICSREPORT>
      <TC_MASTERSTATISTICSREPORT>
        <NAME>Groups</NAME>
        <COUNT>28</COUNT>
      </TC_MASTERSTATISTICSREPORT>
    </ENVELOPE>
  `;

  const masterStats = parseMasterStatistics(xml);
  assert.strictEqual(masterStats.length, 2);
  assert.strictEqual(masterStats[0].name, "Ledgers");
  assert.strictEqual(masterStats[0].count, 120);
  assert.strictEqual(masterStats[1].name, "Groups");
  assert.strictEqual(masterStats[1].count, 28);
});

test("XML Parser - Voucher Statistics from TDL Report", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <TC_VOUCHERSTATISTICSREPORT>
            <NAME>Sales</NAME>
            <COUNT>450</COUNT>
            <CANCELLEDCOUNT>5</CANCELLEDCOUNT>
            <TOTALCOUNT>455</TOTALCOUNT>
            <OPTIONALCOUNT>2</OPTIONALCOUNT>
          </TC_VOUCHERSTATISTICSREPORT>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const voucherStats = parseVoucherStatistics(xml);
  assert.strictEqual(voucherStats.length, 1);
  assert.strictEqual(voucherStats[0].name, "Sales");
  assert.strictEqual(voucherStats[0].count, 450);
  assert.strictEqual(voucherStats[0].cancelledCount, 5);
  assert.strictEqual(voucherStats[0].totalCount, 455);
  assert.strictEqual(voucherStats[0].optionalCount, 2);
});

test("XML Parser - Voucher Statistics from TDL Report (Direct Envelope)", () => {
  const xml = `
    <ENVELOPE>
      <TC_VOUCHERSTATISTICSREPORT>
        <NAME>Sales</NAME>
        <COUNT>450</COUNT>
        <CANCELLEDCOUNT>5</CANCELLEDCOUNT>
        <TOTALCOUNT>455</TOTALCOUNT>
        <OPTIONALCOUNT>2</OPTIONALCOUNT>
      </TC_VOUCHERSTATISTICSREPORT>
    </ENVELOPE>
  `;

  const voucherStats = parseVoucherStatistics(xml);
  assert.strictEqual(voucherStats.length, 1);
  assert.strictEqual(voucherStats[0].name, "Sales");
  assert.strictEqual(voucherStats[0].count, 450);
  assert.strictEqual(voucherStats[0].cancelledCount, 5);
  assert.strictEqual(voucherStats[0].totalCount, 455);
  assert.strictEqual(voucherStats[0].optionalCount, 2);
});

test("XML Builder & Parser - Currency Master", () => {
  const currencies: Currency[] = [
    { name: "$", formalName: "US Dollars" },
  ];
  const postXml = buildPostXml("Currency", currencies);
  assert.ok(postXml.includes('<CURRENCY NAME="$" ACTION="Create">'));
  assert.ok(postXml.includes("<ORIGINALNAME>$</ORIGINALNAME>"));
  assert.ok(postXml.includes("<MAILINGNAME>US Dollars</MAILINGNAME>"));

  const exportXml = buildExportCollectionXml("Currency");
  assert.ok(exportXml.includes("<TYPE>Currency</TYPE>"));

  const responseXml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <CURRENCY>
              <ORIGINALNAME>$</ORIGINALNAME>
              <MAILINGNAME>US Dollar</MAILINGNAME>
            </CURRENCY>
            <CURRENCY>
              <ORIGINALNAME>₹</ORIGINALNAME>
              <MAILINGNAME>Indian Rupee</MAILINGNAME>
            </CURRENCY>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const parsed = parseExportCollection<Currency>(responseXml, "Currency");
  assert.strictEqual(parsed.length, 2);
  assert.strictEqual(parsed[0].name, "$");
  assert.strictEqual(parsed[0].formalName, "US Dollar");
  assert.strictEqual(parsed[1].name, "₹");
  assert.strictEqual(parsed[1].formalName, "Indian Rupee");
});

test("XML Builder & Parser - Count Request", () => {
  const xml = buildCountRequestXml("Ledger", { company: "Test Company" });
  assert.ok(xml.includes("<TYPE>DATA</TYPE>"));
  assert.ok(xml.includes("<ID>TC_CountReport</ID>"));
  assert.ok(xml.includes("<SET>$$NUMITEMS:TC_LedgerCollection</SET>"));
  assert.ok(xml.includes("<SVCURRENTCOMPANY>Test Company</SVCURRENTCOMPANY>"));

  const countXmlDirect = `
    <ENVELOPE>
      <TC_TOTALCOUNT>45</TC_TOTALCOUNT>
    </ENVELOPE>
  `;
  assert.strictEqual(parseCountResponse(countXmlDirect), 45);

  const countXmlNested = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <TC_TotalCount>89</TC_TotalCount>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  assert.strictEqual(parseCountResponse(countXmlNested), 89);
});

test("XML Builder & Parser - Periodic Voucher Statistics", () => {
  const xml = buildPeriodicVoucherStatisticsXml("Month", { company: "Test Co" });
  assert.ok(xml.includes("<TYPE>DATA</TYPE>"));
  assert.ok(xml.includes("<ID>TC_AutoColumnStats</ID>"));
  assert.ok(xml.includes('<SET>SVPeriodicity:"Month"</SET>'));
  assert.ok(xml.includes("<SET>$$TC_TransformDateToXSD:##SVFromDate</SET>"));
  assert.ok(xml.includes("<SET>$$TC_TransformDateToXSD:##SVToDate</SET>"));
  assert.ok(xml.includes("<XMLTAG>OtionalCount</XMLTAG>"));
  assert.ok(xml.includes("<SET>$$DirectOptionalVch:$Name</SET>"));

  const responseXml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <VCHTYPESTAT>
            <NAME>Sales</NAME>
            <TOTALCOUNT>25</TOTALCOUNT>
            <PERIODSTAT>
              <FROMDATE>2026-04-01</FROMDATE>
              <TODATE>2026-04-30</TODATE>
              <CANCELLEDCOUNT>1</CANCELLEDCOUNT>
              <OTIONALCOUNT>2</OTIONALCOUNT>
              <TOTALCOUNT>20</TOTALCOUNT>
            </PERIODSTAT>
            <PERIODSTAT>
              <FROMDATE>2026-05-01</FROMDATE>
              <TODATE>2026-05-31</TODATE>
              <CANCELLEDCOUNT>0</CANCELLEDCOUNT>
              <OTIONALCOUNT>0</OTIONALCOUNT>
              <TOTALCOUNT>5</TOTALCOUNT>
            </PERIODSTAT>
          </VCHTYPESTAT>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const parsed = parsePeriodicVoucherStatistics(responseXml);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].name, "Sales");
  assert.strictEqual(parsed[0].totalCount, 25);
  assert.strictEqual(parsed[0].periodStats.length, 2);

  assert.strictEqual(parsed[0].periodStats[0].fromDate, "2026-04-01");
  assert.strictEqual(parsed[0].periodStats[0].toDate, "2026-04-30");
  assert.strictEqual(parsed[0].periodStats[0].cancelledCount, 1);
  assert.strictEqual(parsed[0].periodStats[0].optionalCount, 2);
  assert.strictEqual(parsed[0].periodStats[0].totalCount, 20);

  assert.strictEqual(parsed[0].periodStats[1].fromDate, "2026-05-01");
  assert.strictEqual(parsed[0].periodStats[1].toDate, "2026-05-31");
  assert.strictEqual(parsed[0].periodStats[1].cancelledCount, 0);
  assert.strictEqual(parsed[0].periodStats[1].optionalCount, 0);
  assert.strictEqual(parsed[0].periodStats[1].totalCount, 5);
});

test("XML Builder - paginated export options", () => {
  const xml = buildExportCollectionXml("Ledger", {
    company: "Test Company",
    pageNum: 2,
    recordsPerPage: 25,
    compute: ["ClosingBalance : $ClosingBalance"],
    computeVar: ["SomeVar : String : \"X\""],
    childOf: "Sundry Debtors",
    belongsTo: "Yes",
    collectionType: "Ledger",
    filters: [{ name: "OnlyActive", formula: "$IsDeleted = No" }],
  });

  assert.ok(xml.includes("<SVCURRENTCOMPANY>Test Company</SVCURRENTCOMPANY>"));
  assert.ok(xml.includes("<COMPUTE>ClosingBalance : $ClosingBalance</COMPUTE>"));
  assert.ok(xml.includes("<COMPUTEVAR>SomeVar : String : &quot;X&quot;</COMPUTEVAR>"));
  assert.ok(xml.includes("<COMPUTE>LineIndex : ##vLineIndex</COMPUTE>"));
  assert.ok(xml.includes("<CHILDOF>Sundry Debtors</CHILDOF>"));
  assert.ok(xml.includes("<BELONGSTO>Yes</BELONGSTO>"));
  assert.ok(xml.includes("<FILTERS>OnlyActive</FILTERS>"));
  assert.ok(xml.includes("<FILTERS>TC_PaginationFilter</FILTERS>"));
  assert.ok(xml.includes("##vLineIndex &lt;= 50 AND ##vLineIndex &gt; 25"));
});

test("XML Builder & Parser - GST Registration", () => {
  const registrations: GSTRegistration[] = [
    {
      name: "Maharashtra GST",
      stateName: "Maharashtra",
      gstin: "27ABCDE1234F1Z5",
      isEwayBillApplicable: true,
      registrationDetails: [
        {
          applicableFrom: "2026-04-01",
          gstRegistrationType: "Regular",
          state: "Maharashtra",
          placeOfSupply: "Maharashtra",
          isStateCessOn: false,
        },
      ],
    },
  ];

  const postXml = buildPostXml("GSTRegistration", registrations);
  assert.ok(postXml.includes('<GSTREGISTRATION NAME="Maharashtra GST" ACTION="Create">'));
  assert.ok(postXml.includes("<STATENAME>Maharashtra</STATENAME>"));
  assert.ok(postXml.includes("<GSTREGNUMBER>27ABCDE1234F1Z5</GSTREGNUMBER>"));
  assert.ok(postXml.includes("<ISEWAYBILLPRINTAPPLICABLE>Yes</ISEWAYBILLPRINTAPPLICABLE>"));
  assert.ok(postXml.includes("<GSTREGISTRATIONDETAILS.LIST>"));
  assert.ok(postXml.includes("<FROMDATE>20260401</FROMDATE>"));
  assert.ok(postXml.includes("<REGISTRATIONTYPE>Regular</REGISTRATIONTYPE>"));

  const responseXml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <TAXUNIT NAME="Maharashtra GST">
              <STATENAME>Maharashtra</STATENAME>
              <GSTREGNUMBER>27ABCDE1234F1Z5</GSTREGNUMBER>
              <ISEWAYBILLPRINTAPPLICABLE>Yes</ISEWAYBILLPRINTAPPLICABLE>
              <GSTREGISTRATIONDETAILS.LIST>
                <FROMDATE>20260401</FROMDATE>
                <REGISTRATIONTYPE>Regular</REGISTRATIONTYPE>
                <STATE>Maharashtra</STATE>
                <PLACEOFSUPPLY>Maharashtra</PLACEOFSUPPLY>
                <ISSTATECESSON>No</ISSTATECESSON>
              </GSTREGISTRATIONDETAILS.LIST>
            </TAXUNIT>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const parsed = parseExportCollection<GSTRegistration>(responseXml, "GSTRegistration");
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].name, "Maharashtra GST");
  assert.strictEqual(parsed[0].stateName, "Maharashtra");
  assert.strictEqual(parsed[0].gstin, "27ABCDE1234F1Z5");
  assert.strictEqual(parsed[0].isEwayBillApplicable, true);
  assert.strictEqual(parsed[0].registrationDetails?.[0].gstRegistrationType, "Regular");
  assert.strictEqual(parsed[0].registrationDetails?.[0].isStateCessOn, false);
});

test("XML Parser - custom post response report", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <RESULTS>
            <RESULT>
              <OBJECTTYPE>Ledger</OBJECTTYPE>
              <NAME>Cash</NAME>
              <MASTERID>12</MASTERID>
              <GUID>abc</GUID>
              <REMOTEID>remote-1</REMOTEID>
            </RESULT>
            <RESULT>
              <OBJECTTYPE>Ledger</OBJECTTYPE>
              <NAME>Bad Ledger</NAME>
              <ERROR>Validation failed</ERROR>
            </RESULT>
          </RESULTS>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const resp = parsePostResponse(xml);
  assert.strictEqual(resp.length, 2);
  assert.strictEqual(resp[0].status, "success");
  assert.strictEqual(resp[0].objectType, "Ledger");
  assert.strictEqual(resp[0].masterId, 12);
  assert.strictEqual(resp[0].guid, "abc");
  assert.strictEqual(resp[1].status, "failure");
  assert.strictEqual(resp[1].message, "Validation failed");
});

test("XML Utils - normalization helpers", () => {
  assert.strictEqual(parseTallyBoolean("Yes"), true);
  assert.strictEqual(parseTallyBoolean("false"), false);
  assert.strictEqual(parseTallyNumeric("1,250.50 Dr"), 1250.5);
  assert.strictEqual(parseTallyNumeric("1,250.50 Cr"), -1250.5);
  assert.deepEqual(asArray("x"), ["x"]);
  assert.deepEqual(asArray(undefined), []);
});

test("XML Builder & Parser - deep voucher allocations", () => {
  const voucher: Voucher = {
    date: "2026-05-21",
    voucherType: "Sales",
    voucherNumber: "S-1",
    reference: "PO-9",
    referenceDate: "2026-05-20",
    partyName: "Acme Customer",
    partyGSTIN: "27ABCDE1234F1Z5",
    placeOfSupply: "Maharashtra",
    isInvoice: true,
    ledgerEntries: [
      {
        ledgerName: "Acme Customer",
        amount: 1180,
        isDeemedPositive: true,
        isPartyLedger: true,
        billAllocations: [{ name: "S-1", billType: "New Ref", amount: 1180, dueDate: "30 Days" }],
        costCentreAllocations: [{ category: "Primary Cost Category", name: "Sales Team", amount: 1180 }],
      },
    ],
    inventoryAllocations: [
      {
        stockItemName: "Widget",
        quantity: "10 pcs",
        rate: "100/pcs",
        amount: 1000,
        isDeemedPositive: false,
        batchAllocations: [{ godownName: "Main Location", batchName: "B1", actualQuantity: "10 pcs", billedQuantity: "10 pcs", amount: 1000 }],
        accountingAllocations: [{ ledgerName: "Sales", amount: -1000, isDeemedPositive: false }],
        gstRateDetails: [{ dutyHead: "CGST", valuationType: "Based on Value", rate: 9 }],
      },
    ],
    ewayBillDetails: {
      billNumber: "EWB-1",
      transporterName: "Fast Transport",
      vehicleNumber: "MH01AB1234",
    },
  };

  const builtXml = buildPostXml("Voucher", [voucher]);
  assert.ok(builtXml.includes("<BILLALLOCATIONS.LIST>"));
  assert.ok(builtXml.includes("<CATEGORYALLOCATIONS.LIST>"));
  assert.ok(builtXml.includes("<BATCHALLOCATIONS.LIST>"));
  assert.ok(builtXml.includes("<ACCOUNTINGALLOCATIONS.LIST>"));
  assert.ok(builtXml.includes("<GSTRATEDETAILS.LIST>"));
  assert.ok(builtXml.includes("<EWAYBILLDETAILS.LIST>"));

  const responseXml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <VOUCHER>
              <DATE>20260521</DATE>
              <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
              <VOUCHERNUMBER>S-1</VOUCHERNUMBER>
              <REFERENCE>PO-9</REFERENCE>
              <REFERENCEDATE>20260520</REFERENCEDATE>
              <PARTYLEDGERNAME>Acme Customer</PARTYLEDGERNAME>
              <PARTYGSTIN>27ABCDE1234F1Z5</PARTYGSTIN>
              <PLACEOFSUPPLY>Maharashtra</PLACEOFSUPPLY>
              <ISINVOICE>Yes</ISINVOICE>
              <EWAYBILLDETAILS.LIST>
                <BILLNUMBER>EWB-1</BILLNUMBER>
                <TRANSPORTERNAME>Fast Transport</TRANSPORTERNAME>
                <VEHICLENUMBER>MH01AB1234</VEHICLENUMBER>
              </EWAYBILLDETAILS.LIST>
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Acme Customer</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                <AMOUNT>1180</AMOUNT>
                <BILLALLOCATIONS.LIST>
                  <NAME>S-1</NAME>
                  <BILLTYPE>New Ref</BILLTYPE>
                  <BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD>
                  <AMOUNT>1180</AMOUNT>
                </BILLALLOCATIONS.LIST>
                <CATEGORYALLOCATIONS.LIST>
                  <CATEGORY>Primary Cost Category</CATEGORY>
                  <COSTCENTREALLOCATIONS.LIST>
                    <NAME>Sales Team</NAME>
                    <AMOUNT>1180</AMOUNT>
                  </COSTCENTREALLOCATIONS.LIST>
                </CATEGORYALLOCATIONS.LIST>
              </ALLLEDGERENTRIES.LIST>
              <ALLINVENTORYENTRIES.LIST>
                <STOCKITEMNAME>Widget</STOCKITEMNAME>
                <ACTUALQUANTITY>10 pcs</ACTUALQUANTITY>
                <BILLEDQUANTITY>10 pcs</BILLEDQUANTITY>
                <RATE>100/pcs</RATE>
                <AMOUNT>1000</AMOUNT>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <BATCHALLOCATIONS.LIST>
                  <BATCHNAME>B1</BATCHNAME>
                  <GODOWNNAME>Main Location</GODOWNNAME>
                  <ACTUALQTY>10 pcs</ACTUALQTY>
                  <BILLEDQTY>10 pcs</BILLEDQTY>
                  <AMOUNT>1000</AMOUNT>
                </BATCHALLOCATIONS.LIST>
                <ACCOUNTINGALLOCATIONS.LIST>
                  <LEDGERNAME>Sales</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>-1000</AMOUNT>
                </ACCOUNTINGALLOCATIONS.LIST>
                <GSTRATEDETAILS.LIST>
                  <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
                  <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
                  <GSTRATE>9</GSTRATE>
                </GSTRATEDETAILS.LIST>
              </ALLINVENTORYENTRIES.LIST>
            </VOUCHER>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const parsed = parseExportCollection<Voucher>(responseXml, "Voucher");
  assert.strictEqual(parsed[0].partyGSTIN, "27ABCDE1234F1Z5");
  assert.strictEqual(parsed[0].isInvoice, true);
  assert.strictEqual(parsed[0].ewayBillDetails?.vehicleNumber, "MH01AB1234");
  assert.strictEqual(parsed[0].ledgerEntries?.[0].billAllocations?.[0].billType, "New Ref");
  assert.strictEqual(parsed[0].ledgerEntries?.[0].costCentreAllocations?.[0].name, "Sales Team");
  assert.strictEqual(parsed[0].inventoryAllocations?.[0].batchAllocations?.[0].batchName, "B1");
  assert.strictEqual(parsed[0].inventoryAllocations?.[0].accountingAllocations?.[0].ledgerName, "Sales");
  assert.strictEqual(parsed[0].inventoryAllocations?.[0].gstRateDetails?.[0].rate, 9);
});

test("XML Parser - C# fixture samples", () => {
  const ledgerXml = readFileSync("../src/Tests/TallyConnector.XmlTests/Resources/TallyPrime/V6/Ledger/ledger_sample_data.xml", "utf8");
  const groupXml = readFileSync("../src/Tests/TallyConnector.XmlTests/Resources/TallyPrime/V6/Group/Groups_complete.xml", "utf8");
  const currencyXml = readFileSync("../src/Tests/TallyConnector.XmlTests/Resources/TallyPrime/V6/Currency/Currencys_complete.xml", "utf8");
  const costCentreXml = readFileSync("../src/Tests/TallyConnector.XmlTests/Resources/TallyPrime/V6/CostCentre/CostCentres_complete.xml", "utf8");
  const voucherXml = readFileSync("../src/Tests/TallyConnector.XmlTests/Resources/TallyPrime/V6/Voucher/Vouchers_Sales_complete.xml", "utf8");

  assert.ok(parseExportCollection<Ledger>(ledgerXml, "Ledger").length > 0);
  assert.ok(parseExportCollection<Group>(groupXml, "Group").length > 0);
  assert.ok(parseExportCollection<Currency>(currencyXml, "Currency").length > 0);
  assert.ok(parseExportCollection<any>(costCentreXml, "CostCentre").length > 0);
  assert.ok(parseExportCollection<Voucher>(voucherXml, "Voucher").length > 0);
});

test("TallyClient - generic APIs use injected transport", async () => {
  class MockTransport implements TallyTransport {
    public requests: string[] = [];
    constructor(private responses: string[]) {}
    async send(xml: string): Promise<string> {
      this.requests.push(xml);
      return this.responses.shift() || "<ENVELOPE><BODY><DATA><COLLECTION /></DATA></BODY></ENVELOPE>";
    }
  }

  const transport = new MockTransport([
    `<ENVELOPE><BODY><DATA><COLLECTION><LEDGER><NAME>Cash</NAME><PARENT>Cash-in-hand</PARENT></LEDGER></COLLECTION></DATA></BODY></ENVELOPE>`,
    `<ENVELOPE><TC_TOTALCOUNT>1</TC_TOTALCOUNT></ENVELOPE>`,
    `<ENVELOPE><BODY><DATA><COLLECTION><GROUP><NAME>Sundry Debtors</NAME><PARENT></PARENT></GROUP></COLLECTION></DATA></BODY></ENVELOPE>`,
    `<ENVELOPE><BODY><DATA><IMPORTRESULT><CREATED>1</CREATED></IMPORTRESULT></DATA></BODY></ENVELOPE>`,
  ]);
  const client = new TallyClient("http://localhost", 9000, 3, transport);

  const ledgers = await client.getObjects("Ledger");
  assert.strictEqual(ledgers[0].name, "Cash");

  const paged = await client.getPaginatedObjects<Group>("Group", { pageNum: 1, recordsPerPage: 10 });
  assert.strictEqual(paged.totalCount, 1);
  assert.strictEqual(paged.objects[0].name, "Sundry Debtors");

  const posted = await client.postObjects("Ledger", [{ name: "X", group: "Y" }]);
  assert.strictEqual(posted[0].status, "success");
  assert.ok(transport.requests.some(xml => xml.includes("<TYPE>Ledger</TYPE>")));
  assert.ok(transport.requests.some(xml => xml.includes("<LEDGER NAME=\"X\" ACTION=\"Create\">")));
});

test("XML Builder - CRUD Deletion and Cancellation Actions", () => {
  const ledger: Ledger = {
    name: "Maharashtra Ledger",
    group: "Sundry Debtors",
    action: "Delete",
    phone: "123456",
    mobile: "987654",
    contact: "Baburao",
    partyGstin: "27ABCDE1234F1Z5",
  };
  const ledgerXml = buildPostXml("Ledger", [ledger]);
  assert.ok(ledgerXml.includes('<LEDGER NAME="Maharashtra Ledger" ACTION="Delete">'));
  assert.ok(ledgerXml.includes("<LEDGERPHONE>123456</LEDGERPHONE>"));
  assert.ok(ledgerXml.includes("<LEDGERMOBILE>987654</LEDGERMOBILE>"));
  assert.ok(ledgerXml.includes("<LEDGERCONTACT>Baburao</LEDGERCONTACT>"));
  assert.ok(ledgerXml.includes("<PARTYGSTIN>27ABCDE1234F1Z5</PARTYGSTIN>"));

  const voucher: Voucher = {
    date: "2026-05-30",
    voucherType: "Sales",
    voucherNumber: "INV-99",
    action: "Cancel",
  };
  const voucherXml = buildPostXml("Voucher", [voucher]);
  assert.ok(voucherXml.includes('<VOUCHER VCHTYPE="Sales" ACTION="Cancel">'));
  assert.ok(voucherXml.includes("<VOUCHERNUMBER>INV-99</VOUCHERNUMBER>"));
});

test("XML Builder - AttendanceType Serialization", () => {
  const at: AttendanceType = {
    name: "Overtime Hours",
    parent: "Primary",
    attendanceType: "Production",
    unit: "Hours",
  };
  const xml = buildPostXml("AttendanceType", [at]);
  assert.ok(xml.includes('<ATTENDANCE NAME="Overtime Hours" ACTION="Create">'));
  assert.ok(xml.includes("<PARENT>Primary</PARENT>"));
  assert.ok(xml.includes("<ATTENDANCEONPRODUCTION>Production</ATTENDANCEONPRODUCTION>"));
  assert.ok(xml.includes("<BASEUNITS>Hours</BASEUNITS>"));
});

test("XML Parser - AttendanceType Deserialization", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <ATTENDANCE NAME="Sick Leave">
              <PARENT>Primary</PARENT>
              <ATTENDANCEONPRODUCTION>Attendance / Leave with Pay</ATTENDANCEONPRODUCTION>
              <BASEUNITS>Days</BASEUNITS>
              <MASTERID>300</MASTERID>
              <ALTERID>4500</ALTERID>
            </ATTENDANCE>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const result = parseExportCollection<AttendanceType>(xml, "AttendanceType");
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, "Sick Leave");
  assert.strictEqual(result[0].parent, "Primary");
  assert.strictEqual(result[0].attendanceType, "Attendance / Leave with Pay");
  assert.strictEqual(result[0].unit, "Days");
  assert.strictEqual(result[0].masterId, 300);
  assert.strictEqual(result[0].alterId, 4500);
});

test("XML Builder - Budget Serialization", () => {
  const bg: Budget = {
    name: "FY 2026 Marketing Budget",
    parent: "Primary",
    startingFrom: "2026-04-01",
    endingAt: "2027-03-31",
  };
  const xml = buildPostXml("Budget", [bg]);
  assert.ok(xml.includes('<BUDGET NAME="FY 2026 Marketing Budget" ACTION="Create">'));
  assert.ok(xml.includes("<PARENT>Primary</PARENT>"));
  assert.ok(xml.includes("<STARTINGFROM>20260401</STARTINGFROM>"));
  assert.ok(xml.includes("<ENDINGAT>20270331</ENDINGAT>"));
});

test("XML Parser - Budget Deserialization", () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <COLLECTION>
            <BUDGET NAME="Sales Budget">
              <PARENT>Primary</PARENT>
              <STARTINGFROM>20260401</STARTINGFROM>
              <ENDINGAT>20260630</ENDINGAT>
              <MASTERID>900</MASTERID>
              <ALTERID>5510</ALTERID>
            </BUDGET>
          </COLLECTION>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;
  const result = parseExportCollection<Budget>(xml, "Budget");
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].name, "Sales Budget");
  assert.strictEqual(result[0].parent, "Primary");
  assert.strictEqual(result[0].startingFrom, "20260401");
  assert.strictEqual(result[0].endingAt, "20260630");
  assert.strictEqual(result[0].masterId, 900);
  assert.strictEqual(result[0].alterId, 5510);
});

test("Client - getReport & getGSTComputation XML generation", async () => {
  let requestedXml = "";
  const mockTransport = {
    send: async (xml: string, _type: string) => {
      requestedXml = xml;
      return `
        <ENVELOPE>
          <BODY>
            <DATA>
              <REPORTDATA>Mock Report Content</REPORTDATA>
            </DATA>
          </BODY>
        </ENVELOPE>
      `;
    }
  };
  const mockClient = new TallyClient("http://localhost", 9000, 3, mockTransport);
  await mockClient.getGSTComputation({
    company: "Chirag Enterprises",
    fromDate: "2026-04-01",
    toDate: "2026-05-30"
  });

  assert.ok(requestedXml.includes("<ID>GSTComputation</ID>"));
  assert.ok(requestedXml.includes("<SVCURRENTCOMPANY>Chirag Enterprises</SVCURRENTCOMPANY>"));
  assert.ok(requestedXml.includes("<SVFROMDATE>20260401</SVFROMDATE>"));
  assert.ok(requestedXml.includes("<SVTODATE>20260530</SVTODATE>"));
});


