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
    console.log("\nFetching first 10 Stock Items...");
    const items = await client.getStockItems({
      company: activeCompany,
      fetchList: ["MasterId", "Name", "Parent", "BaseUnits", "OpeningBalance", "OpeningValue"],
      pageNum: 1,
      recordsPerPage: 10,
    });

    if (items.length === 0) {
      console.log("ℹ No Stock Items found in this company.");
    } else {
      console.table(
        items.map(item => ({
          ID: item.masterId,
          Name: item.name,
          Group: item.stockGroup || "(None)",
          Unit: item.baseUnit || "(None)",
          "Opening Bal": item.openingBalance ?? 0,
          "Opening Val": item.openingValue ?? 0,
        }))
      );
    }

    console.log("\nFetching first 10 Units of Measure...");
    const units = await client.getUnits({
      company: activeCompany,
      pageNum: 1,
      recordsPerPage: 10,
    });

    if (units.length === 0) {
      console.log("ℹ No Units found in this company.");
    } else {
      console.table(
        units.map(unit => ({
          ID: unit.masterId,
          Symbol: unit.name,
          "Formal Name": unit.formalName || "",
          "Decimal Places": unit.decimalPlaces ?? 0,
        }))
      );
    }

    console.log("\nFetching Master Statistics...");
    const masterStats = await client.getMasterStatistics({ company: activeCompany });
    if (masterStats.length === 0) {
      console.log("ℹ No Master Statistics found.");
    } else {
      console.table(
        masterStats.map(stat => ({
          "Master Type": stat.name,
          "Total Count": stat.count,
        }))
      );
    }

    console.log("\nFetching Voucher Statistics...");
    const voucherStats = await client.getVoucherStatistics({ company: activeCompany });
    if (voucherStats.length === 0) {
      console.log("ℹ No Voucher Statistics found.");
    } else {
      console.table(
        voucherStats.map(stat => ({
          "Voucher Type": stat.name,
          "Period Count": stat.count,
          Cancelled: stat.cancelledCount,
          Optional: stat.optionalCount,
          "Total Count": stat.totalCount,
        }))
      );
    }

    console.log("\nFetching Currencies...");
    const currencies = await client.getCurrencies({
      company: activeCompany,
      pageNum: 1,
      recordsPerPage: 10,
    });

    if (currencies.length === 0) {
      console.log("ℹ No Currencies found in this company.");
    } else {
      console.table(
        currencies.map(currency => ({
          ID: currency.masterId,
          Symbol: currency.name,
          "Formal Name": currency.formalName || "",
        }))
      );
    }

    console.log("\nTesting Dynamic COUNT API...");
    const ledgerCount = await client.getObjectsCount("Ledger", { company: activeCompany });
    const stockItemCount = await client.getObjectsCount("StockItem", { company: activeCompany });
    console.log(`✅ Dynamic Ledger Count: ${ledgerCount}`);
    console.log(`✅ Dynamic StockItem Count: ${stockItemCount}`);

    console.log("\nFetching Monthly Voucher Statistics...");
    const periodicStats = await client.getPeriodicVoucherStatistics("Month", {
      company: activeCompany,
    });

    if (periodicStats.length === 0) {
      console.log("ℹ No Periodic Voucher Statistics found.");
    } else {
      const flattenedStats = periodicStats.flatMap(voucherType =>
        voucherType.periodStats.map(period => ({
          "Voucher Type": voucherType.name,
          "From Date": period.fromDate,
          "To Date": period.toDate,
          "Total Count": period.totalCount,
          Optional: period.optionalCount,
          Cancelled: period.cancelledCount,
        }))
      );

      console.table(flattenedStats);
    }
  } catch (error: any) {
    console.error("❌ Error performing operations:", error.message);
  }
}

main();
