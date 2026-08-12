import { TallyClient } from "../src/index.js";

async function runDemo() {
  console.log("=========================================");
  console.log("   Tally Sync TypeScript Library Demo    ");
  console.log("=========================================\n");

  const client = new TallyClient("http://localhost", 9000);

  console.log("Checking connectivity to Tally...");
  const isOnline = await client.check();

  if (!isOnline) {
    console.log("❌ Tally is offline or not running at http://localhost:9000.");
    console.log("Open Tally Prime and make sure its XML/HTTP interface is available on port 9000.");
    return;
  }

  console.log("✅ Connected to Tally successfully!\n");

  try {
    const activeCompany = await client.getActiveCompany();
    console.log(`Active Company: "${activeCompany}"\n`);

    const license = await client.getLicenseInfo();
    console.log("License Information:");
    console.log(`- Serial Number:  ${license.serialNumber}`);
    console.log(`- Tally Version:  ${license.tallyVersion}`);
    console.log(`- Plan Name:      ${license.planName}`);
    console.log(`- Educational:    ${license.isEducationalMode}\n`);

    const alterIds = await client.getLastAlterIds({ company: activeCompany });
    console.log("Sync Alter IDs:");
    console.log(`- Masters:  ${alterIds.mastersLastId}`);
    console.log(`- Vouchers: ${alterIds.vouchersLastId}\n`);

    const ledgers = await client.getLedgers({
      company: activeCompany,
      fetchList: ["MasterId", "Name", "Parent", "OpeningBalance"],
      pageNum: 1,
      recordsPerPage: 10,
    });

    console.log(`Fetched ${ledgers.length} ledgers:`);
    console.table(
      ledgers.map(ledger => ({
        ID: ledger.masterId,
        Name: ledger.name,
        Group: ledger.group,
        OpeningBalance: ledger.openingBalance || 0,
      }))
    );
  } catch (error: any) {
    console.error("❌ Tally operation failed:", error.message);
  }
}

runDemo();
