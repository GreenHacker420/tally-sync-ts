import { TallyClient } from "../src/index.js";

async function main() {
  const client = new TallyClient("http://localhost", 9000);
  
  console.log("Checking connection...");
  const isOnline = await client.check();
  if (!isOnline) {
    console.log("❌ Tally is not online on port 9000.");
    return;
  }
  
  const activeCompany = await client.getActiveCompany();
  console.log("✅ Active Company:", activeCompany);
  
  try {
    console.log("\nFetching first 10 parsed Stock Items...");
    const items = await client.getStockItems({
      company: activeCompany,
      fetchList: ["MasterId", "Name", "Parent", "BaseUnits", "OpeningBalance", "OpeningValue"],
      pageNum: 1,
      recordsPerPage: 10
    });
    
    if (items.length === 0) {
      console.log("ℹ No Stock Items found in this company.");
    } else {
      console.log(`✅ Successfully retrieved and parsed ${items.length} Stock Items:`);
      console.table(items.map(item => ({
        ID: item.masterId,
        Name: item.name,
        Group: item.stockGroup || "(None)",
        Unit: item.baseUnit || "(None)",
        "Opening Bal": item.openingBalance !== undefined ? item.openingBalance : 0,
        "Opening Val": item.openingValue !== undefined ? item.openingValue : 0,
      })));
    }

    console.log("\nFetching first 10 parsed Units of Measure...");
    const units = await client.getUnits({
      company: activeCompany,
      pageNum: 1,
      recordsPerPage: 10
    });
    
    if (units.length === 0) {
      console.log("ℹ No Units found in this company.");
    } else {
      console.log(`✅ Successfully retrieved and parsed ${units.length} Units:`);
      console.table(units.map(unit => ({
        ID: unit.masterId,
        Name: unit.name,
        Symbol: unit.originalName || unit.name,
        "Formal Name": unit.formalName || "",
        "Decimal Places": unit.decimalPlaces !== undefined ? unit.decimalPlaces : 0,
      })));
    }

    console.log("\nFetching Master Statistics...");
    const masterStats = await client.getMasterStatistics({ company: activeCompany });
    if (masterStats.length === 0) {
      console.log("ℹ No Master Statistics found.");
    } else {
      console.log(`✅ Successfully retrieved ${masterStats.length} Master Counts:`);
      console.table(masterStats.map(stat => ({
        "Master Type": stat.name,
        "Total Count": stat.count,
      })));
    }

    console.log("\nFetching Voucher Statistics...");
    const voucherStats = await client.getVoucherStatistics({ company: activeCompany });
    if (voucherStats.length === 0) {
      console.log("ℹ No Voucher Statistics found.");
    } else {
      console.log(`✅ Successfully retrieved ${voucherStats.length} Voucher Counts:`);
      console.table(voucherStats.map(stat => ({
        "Voucher Type": stat.name,
        "Period Count": stat.count,
        "Cancelled": stat.cancelledCount,
        "Optional": stat.optionalCount,
        "Total Count": stat.totalCount,
      })));
    }

    console.log("\nFetching Currencies...");
    const currencies = await client.getCurrencies({
      company: activeCompany,
      pageNum: 1,
      recordsPerPage: 10
    });
    if (currencies.length === 0) {
      console.log("ℹ No Currencies found in this company.");
    } else {
      console.log(`✅ Successfully retrieved and parsed ${currencies.length} Currencies:`);
      console.table(currencies.map(cur => ({
        ID: cur.masterId,
        Symbol: cur.name,
        "Formal Name": cur.formalName || "",
      })));
    }

    console.log("\nTesting Dynamic COUNT API (getObjectsCount)...");
    const ledgerCount = await client.getObjectsCount("Ledger", { company: activeCompany });
    const stockItemCount = await client.getObjectsCount("StockItem", { company: activeCompany });
    console.log(`✅ Dynamic Ledger Count: ${ledgerCount}`);
    console.log(`✅ Dynamic StockItem Count: ${stockItemCount}`);

    console.log("\nFetching Periodic Voucher Statistics (Monthly Breakdown)...");
    const periodicStats = await client.getPeriodicVoucherStatistics("Month", { company: activeCompany });
    if (periodicStats.length === 0) {
      console.log("ℹ No Periodic Voucher Statistics found.");
    } else {
      console.log(`✅ Successfully retrieved Periodic Stats for ${periodicStats.length} Voucher Types:`);
      const flattenedStats = [];
      for (const vt of periodicStats) {
        for (const ps of vt.periodStats) {
          flattenedStats.push({
            "Voucher Type": vt.name,
            "From Date": ps.fromDate,
            "To Date": ps.toDate,
            "Total Count": ps.totalCount,
            "Optional": ps.optionalCount,
            "Cancelled": ps.cancelledCount,
          });
        }
      }
      console.table(flattenedStats);
    }

  } catch (err: any) {
    console.error("❌ Error performing operations:", err.message);
  }
}

main();
