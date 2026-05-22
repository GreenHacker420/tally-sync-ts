import { buildMasterStatisticsXml, buildVoucherStatisticsXml } from "../src/xmlBuilder.js";

async function run() {
  const masterXml = buildMasterStatisticsXml();
  const voucherXml = buildVoucherStatisticsXml();

  console.log("---- MASTER STATS XML REQUEST ----");
  console.log(masterXml);

  let resp = await fetch("http://localhost:9000", {
    method: "POST",
    body: masterXml,
    headers: { "Content-Type": "text/xml" }
  });
  console.log("---- MASTER STATS XML RESPONSE ----");
  console.log(await resp.text());

  console.log("---- VOUCHER STATS XML REQUEST ----");
  console.log(voucherXml);

  resp = await fetch("http://localhost:9000", {
    method: "POST",
    body: voucherXml,
    headers: { "Content-Type": "text/xml" }
  });
  console.log("---- VOUCHER STATS XML RESPONSE ----");
  console.log(await resp.text());
}

run();
