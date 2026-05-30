import { TallyClient } from "../src/client.js";

const client = new TallyClient("http://localhost", 9000);
const company = await client.getActiveCompany();

async function fetchReport(reportId: string) {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>${reportId}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
        <SVFROMDATE>20260401</SVFROMDATE>
        <SVTODATE>20260530</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;

  const resp = await fetch("http://localhost:9000", {
    method: "POST",
    body: xml,
    headers: { "Content-Type": "text/xml" }
  });

  const text = await resp.text();
  if (text.includes("Could not find Report")) {
    console.log(`❌ Report '${reportId}': Not Found`);
  } else {
    console.log(`✅ Report '${reportId}': FOUND! (Length: ${text.length} chars)`);
    console.log(text.substring(0, 1000));
  }
}

const variations = [
  "GST R1",
  "GST R3B",
  "GSTR 1",
  "GSTR 3B",
  "GSTR1",
  "GSTR3B",
  "GSTComputation",
  "GST Computation",
  "GST Ledger",
  "GSTSummary",
  "GST Summary",
  "GSTReturns",
  "GST Returns",
];

for (const v of variations) {
  await fetchReport(v);
}
