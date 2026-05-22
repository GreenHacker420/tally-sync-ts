import { test } from "node:test";
import assert from "node:assert";
import { escapeXml, formatDateForTally, buildExportCollectionXml, buildPostXml, buildMasterStatisticsXml, buildVoucherStatisticsXml, buildCountRequestXml, buildPeriodicVoucherStatisticsXml } from "../src/xmlBuilder.js";
import { parseActiveCompany, parseLicenseInfo, parseLastAlterIds, parseExportCollection, parsePostResponse, checkTallyError, parseMasterStatistics, parseVoucherStatistics, parseCountResponse, parsePeriodicVoucherStatistics } from "../src/xmlParser.js";
import { Ledger, Group, Voucher, Currency } from "../src/types.js";

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

