// Writes policy-registry.json (the registry as plain data) so the backend can vendor it. Run after `npm run build`.
import { writeFileSync } from "node:fs";
import { policyRegistryJson } from "../dist/index.js";
const out = process.argv[2] ?? "policy-registry.json";
writeFileSync(out, JSON.stringify(policyRegistryJson(), null, 2) + "\n");
console.log(`wrote ${out}`);
