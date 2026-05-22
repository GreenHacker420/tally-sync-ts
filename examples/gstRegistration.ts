import { TallyClient } from "../src/index.js";

const client = new TallyClient("http://localhost", 9000);
const company = await client.getActiveCompany();

const registrations = await client.getGSTRegistrations({ company });
console.table(registrations.map(reg => ({ name: reg.name, state: reg.stateName, gstin: reg.gstin })));

const result = await client.postGSTRegistrations([
  {
    name: "Maharashtra GST",
    stateName: "Maharashtra",
    gstin: "27ABCDE1234F1Z5",
    registrationDetails: [
      {
        applicableFrom: "2026-04-01",
        gstRegistrationType: "Regular",
        state: "Maharashtra",
        placeOfSupply: "Maharashtra",
      },
    ],
  },
], { company });

console.table(result);
