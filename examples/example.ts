import { TallyClient } from "../src/index.js";

async function runDemo() {
  console.log("=========================================");
  console.log("   Tally Sync TypeScript Library Demo    ");
  console.log("=========================================\n");

  // 1. Initialize the client (defaults to http://localhost:9000)
  const client = new TallyClient("http://localhost", 9000);
  
  console.log("Checking connectivity to Tally...");
  const isOnline = await client.check();
  
  if (!isOnline) {
    console.log("❌ Tally is offline or not running at http://localhost:9000.");
    console.log("To run this demo fully, please open Tally Prime and enable the XML server at port 9000.");
    console.log("\nBelow is a mock code walkthrough on how you interact with the library:\n");
    
    console.log(`
import { TallyClient } from "tally-sync-ts";

const client = new TallyClient("http://localhost", 9000);

// 1. Fetch the Active Company Name
const company = await client.getActiveCompany();
console.log("Active Company:", company);

// 2. Fetch all Ledgers
const ledgers = await client.getLedgers({
  company: company,
  fetchList: ["MasterId", "Name", "Parent", "OpeningBalance"]
});
console.log("Fetched Ledgers count:", ledgers.length);

// 3. Create a new Ledger
const response = await client.postLedgers([
  {
    name: "TC_Customer Ledger",
    group: "Sundry Debtors",
    openingBalance: 12000
  }
], { company });

console.log("Create Status:", response[0].status, "Message:", response[0].message);
    `);
    return;
  }

  console.log("✅ Connected to Tally successfully!\n");

  try {
    // 2. Fetch Active Company Name
    const activeCompany = await client.getActiveCompany();
    console.log(`Active Company: "${activeCompany}"\n`);

    // 3. Fetch License Details
    console.log("Retrieving License Information...");
    const license = await client.getLicenseInfo();
    console.log(`- Serial Number: ${license.serialNumber}`);
    console.log(`- Tally Version: ${license.tallyVersion}`);
    console.log(`- Plan Name:     ${license.planName}`);
    console.log(`- Is Educational: ${license.isEducationalMode}\n`);

    // 4. Fetch last alter IDs
    console.log("Retrieving Sync Alter IDs...");
    const alterIds = await client.getLastAlterIds({ company: activeCompany });
    console.log(`- Masters Last Alter ID: ${alterIds.mastersLastId}`);
    console.log(`- Vouchers Last Alter ID: ${alterIds.vouchersLastId}\n`);

    // 5. Fetch Ledgers
    console.log("Fetching first 10 Ledgers...");
    const ledgers = await client.getLedgers({
      company: activeCompany,
      fetchList: ["MasterId", "Name", "Parent", "OpeningBalance"],
      pageNum: 1,
      recordsPerPage: 10
    });

    console.log(`Successfully fetched ${ledgers.length} ledgers:`);
    console.table(ledgers.map(l => ({
      ID: l.masterId,
      Name: l.name,
      Group: l.group,
      OpeningBal: l.openingBalance || 0
    })));

    // 6. Demonstrate Posting a Ledger
    console.log("\nPosting a new test Ledger to Tally...");
    const postResult = await client.postLedgers([
      {
        name: "TC_Demo Customer Ledger",
        group: "Sundry Debtors",
        openingBalance: 25000
      }
    ], { company: activeCompany });

    console.log("Post Result:");
    console.log(`- Status:  ${postResult[0].status.toUpperCase()}`);
    console.log(`- Message: ${postResult[0].message}`);
    if (postResult[0].masterId) {
      console.log(`- MasterID: ${postResult[0].masterId}`);
    }

  } catch (err: any) {
    console.error("❌ An error occurred during operations:", err.message);
  }
}

runDemo();
