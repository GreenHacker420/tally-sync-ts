import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findTallyDataPaths, parseTallyIni, extractCompanyPathsFromLog, looksLikeCompanyFolder, decodeTallyText, DataPathSource, type FsPort } from "../src/index.js";

// ---- in-memory Windows-style filesystem + spy ---------------------------------------------------
interface F { size: number; mtimeMs: number; text?: string }
function memoryFs(files: Record<string, F>, drives = ["C:\\"]): FsPort & { readTextCalls: string[]; readdirCalls: string[] } {
  const norm = (p: string) => p.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  const byPath = new Map(Object.entries(files).map(([p, f]) => [norm(p), f]));
  const tree = new Map<string, Map<string, { name: string; isDir: boolean }>>();
  const put = (dir: string, name: string, isDir: boolean) => { const k = norm(dir); if (!tree.has(k)) tree.set(k, new Map()); tree.get(k)!.set(name.toLowerCase(), { name, isDir }); };
  for (const d of drives) if (!tree.has(norm(d))) tree.set(norm(d), new Map());
  for (const path of Object.keys(files)) {
    const parts = path.split("\\");
    for (let i = 1; i < parts.length; i++) put(parts.slice(0, i).join("\\"), parts[i], i < parts.length - 1);
  }
  const readTextCalls: string[] = []; const readdirCalls: string[] = [];
  return {
    readTextCalls, readdirCalls,
    async listDrives() { return drives; },
    async readdir(dir) { readdirCalls.push(dir); const m = tree.get(norm(dir)); return m ? [...m.values()] : undefined; },
    async stat(p) { const f = byPath.get(norm(p)); return f ? { size: f.size, mtimeMs: f.mtimeMs, isDir: false } : tree.has(norm(p)) ? { size: 0, mtimeMs: 0, isDir: true } : undefined; },
    async readText(p) { readTextCalls.push(p); return byPath.get(norm(p))?.text; },
  };
}
const company = (root: string, n: string, extra: Record<string, F> = {}): Record<string, F> => ({
  [`${root}\\${n}\\Company.900`]: { size: 4096, mtimeMs: 1000 }, [`${root}\\${n}\\Manager.900`]: { size: 2048, mtimeMs: 1100 },
  [`${root}\\${n}\\00000001.1800`]: { size: 900_000, mtimeMs: 5000 }, [`${root}\\${n}\\LST_001.dat`]: { size: 1234, mtimeMs: 900 }, ...extra,
});
let clock = 0; const now = () => clock;

describe("parseTallyIni / decodeTallyText", () => {
  const ini = ";;TallyPrime workstation specific parameters file\n[TALLY]\n;;Specify location of Data files\nData=C:\\Users\\Public\\TallyPrime\\data\nDefault Companies=Yes\nLoad=C:\\Users\\Public\\TallyPrime\\data\\100003\nExport Path=C:\\Users\\lenovo\\Desktop\\Bills\nClient Server=Both\nServerPort=9000\nEnable ODBC Server=Yes\nIgnore Tcp Timeout=Yes\nLoad Buffering=Yes\n;;Data=Z:\\commented\n";
  it("extracts data paths, load targets, export path and the settings that matter, ignoring ;; comments", () => {
    const p = parseTallyIni(ini, "C:\\Program Files\\TallyPrime");
    assert.deepEqual(p.dataPaths, ["C:\\Users\\Public\\TallyPrime\\data"]);
    assert.deepEqual(p.loadPaths, ["C:\\Users\\Public\\TallyPrime\\data\\100003"]);
    assert.equal(p.exportPath, "C:\\Users\\lenovo\\Desktop\\Bills");
    assert.equal(p.serverPort, 9000); assert.equal(p.odbcServer, true); assert.equal(p.ignoreTcpTimeout, true); assert.equal(p.loadBuffering, true); assert.equal(p.defaultCompanies, true);
  });
  it("resolves relative Data= against the install folder and accepts bare company numbers in Load=", () => {
    const p = parseTallyIni("Data=.\\Data\nLoad=100003\nLoad = 100004\n", "E:\\Apps\\Tally");
    assert.deepEqual(p.dataPaths, ["E:\\Apps\\Tally\\Data"]);
    assert.deepEqual(p.loadNumbers, ["100003", "100004"]);
  });
  it("decodes UTF-16LE with BOM and UTF-8", () => {
    assert.equal(decodeTallyText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Data=D:\\x", "utf16le")])), "Data=D:\\x");
    assert.equal(decodeTallyText(Buffer.from("Data=D:\\y", "utf8")), "Data=D:\\y");
  });
});

describe("extractCompanyPathsFromLog", () => {
  it("finds the data root and company number in a Tally error log line", () => {
    const log = "- - * E R R O R *\n31-05-2026 18:09:11, PID: 23576\nInternal Error.\nFile: 'D:\\data\\010009\\TSTATE.TSF'\nSize: 5632\n";
    assert.deepEqual(extractCompanyPathsFromLog(log), [{ root: "D:\\data", number: "010009" }]);
  });
  it("ignores paths without a 5-6 digit company folder and de-duplicates", () => {
    const log = "C:\\Program Files\\TallyPrime\\tally.exe\nE:\\Acc\\100003\\a.900\nE:\\Acc\\100003\\b.900\nC:\\Windows\\1234\\x\n";
    assert.deepEqual(extractCompanyPathsFromLog(log), [{ root: "E:\\Acc", number: "100003" }]);
  });
});

describe("looksLikeCompanyFolder", () => {
  it("accepts Company.900, or .900 + .1800, case-insensitively; rejects ordinary numeric folders", () => {
    assert.equal(looksLikeCompanyFolder(["COMPANY.900", "x.txt"]).isCompany, true);
    assert.equal(looksLikeCompanyFolder(["a.900", "00000001.1800"]).isCompany, true);
    assert.equal(looksLikeCompanyFolder(["photo.jpg", "notes.txt"]).isCompany, false);
    assert.equal(looksLikeCompanyFolder(["a.1800"]).isCompany, false);
  });
});

describe("findTallyDataPaths", () => {
  it("HIGH confidence: Tally reports company number 100003 and ini Load/Data points at the verified folder", async () => {
    const fs = memoryFs({ ...company("C:\\Users\\Public\\TallyPrime\\data", "100003"), "C:\\Program Files\\TallyPrime\\tally.ini": { size: 1, mtimeMs: 1, text: "Data=C:\\Users\\Public\\TallyPrime\\data\nLoad=C:\\Users\\Public\\TallyPrime\\data\\100003\n" } });
    const r = await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", companyNumbers: ["100003"], now });
    assert.equal(r.companies.length, 1);
    const c = r.companies[0];
    assert.equal(c.path, "C:\\Users\\Public\\TallyPrime\\data\\100003"); assert.equal(c.confidence, "HIGH"); assert.equal(c.verified, true); assert.equal(c.reportedByTally, true);
    assert.ok(c.sources.includes(DataPathSource.INI_LOAD)); assert.equal(c.lastModifiedMs, 5000); assert.ok(c.sizeBytes > 900_000);
    assert.ok(c.watchFiles.some((f) => f.endsWith("00000001.1800")));
    assert.equal(r.scan.performed, false, "no drive scan when the answer is already verified");
    assert.deepEqual(r.unresolvedNumbers, []);
  });

  it("company data on another drive named only in the logs (D:\\data\\010009) is found and verified", async () => {
    const fs = memoryFs({ ...company("D:\\data", "010009"), "C:\\Program Files\\TallyPrime\\tallyerr.log": { size: 1, mtimeMs: 1, text: "File: 'D:\\data\\010009\\TSTATE.TSF'" } }, ["C:\\", "D:\\"]);
    const r = await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", companyNumbers: ["010009"], now });
    assert.equal(r.companies[0]?.path, "D:\\data\\010009"); assert.ok(r.companies[0]?.sources.includes(DataPathSource.LOG)); assert.equal(r.companies[0]?.verified, true);
  });

  it("falls back to a bounded drive scan and finds E:\\Accounts\\Tally\\100003 (depth 3)", async () => {
    const fs = memoryFs({ ...company("E:\\Accounts\\Tally", "100003"), "E:\\Photos\\1\\a.jpg": { size: 1, mtimeMs: 1 } }, ["C:\\", "E:\\"]);
    const r = await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", companyNumbers: ["100003"], now });
    assert.equal(r.companies[0]?.path, "E:\\Accounts\\Tally\\100003"); assert.ok(r.companies[0]?.sources.includes(DataPathSource.SCAN)); assert.equal(r.scan.performed, true);
    assert.deepEqual(r.unresolvedNumbers, []);
  });

  it("without Tally's numbers it still finds every company folder on all drives; unreported ones are MEDIUM", async () => {
    const fs = memoryFs({ ...company("C:\\Users\\Public\\TallyPrime\\data", "100003"), ...company("E:\\OldBooks", "100010") }, ["C:\\", "E:\\"]);
    const r = await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", now });
    assert.deepEqual(r.companies.map((c) => c.number).sort(), ["100003", "100010"]);
    assert.ok(r.companies.every((c) => c.confidence === "MEDIUM" && !c.reportedByTally));
  });

  it("reports numbers it could not locate and returns LOW-confidence unverified evidence from the ini", async () => {
    const fs = memoryFs({ "C:\\Program Files\\TallyPrime\\tally.ini": { size: 1, mtimeMs: 1, text: "Data=Z:\\GoneDrive\\data\n" } });
    const r = await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", companyNumbers: ["100003"], now });
    assert.deepEqual(r.unresolvedNumbers, ["100003"]);
    assert.ok(r.evidence.some((e) => /Z:\\GoneDrive\\data/.test(e) && /not found|unavailable/i.test(e)));
  });

  it("skips system folders, flags backup-looking paths, and finds several roots at once", async () => {
    const fs = memoryFs({ ...company("E:\\Windows\\Temp", "100003"), ...company("E:\\TallyBackup", "100003"), ...company("E:\\Live\\Tally", "100003") }, ["C:\\", "E:\\"]);
    const r = await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", companyNumbers: ["100003"], now });
    const paths = r.companies.map((c) => c.path);
    assert.ok(!paths.some((p) => /Windows/i.test(p)), "system folders are not scanned");
    assert.ok(paths.includes("E:\\Live\\Tally\\100003")); const bak = r.companies.find((c) => /TallyBackup/.test(c.path)); assert.equal(bak?.looksLikeBackup, true);
    assert.equal(r.companies[0].path, "E:\\Live\\Tally\\100003", "live data ranks above backup copies");
  });

  it("honours the scan budget and says the result is incomplete", async () => {
    const big: Record<string, F> = {}; for (let i = 0; i < 400; i++) big[`E:\\d${i}\\f.txt`] = { size: 1, mtimeMs: 1 };
    const fs = memoryFs(big, ["C:\\", "E:\\"]);
    const r = await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", companyNumbers: ["100003"], now, maxDirs: 50 });
    assert.equal(r.scan.complete, false); assert.ok(r.scan.visitedDirs <= 51);
  });

  it("NEVER opens data files: only .ini/.log/.imp are read; everything else is listing/stat only", async () => {
    const fs = memoryFs({ ...company("C:\\Users\\Public\\TallyPrime\\data", "100003"), "C:\\Program Files\\TallyPrime\\tally.ini": { size: 1, mtimeMs: 1, text: "Data=C:\\Users\\Public\\TallyPrime\\data\n" }, "C:\\Program Files\\TallyPrime\\tallyerr.log": { size: 1, mtimeMs: 1, text: "x" } });
    await findTallyDataPaths({ fs, installDir: "C:\\Program Files\\TallyPrime", companyNumbers: ["100003"], now });
    assert.ok(fs.readTextCalls.length > 0);
    assert.ok(fs.readTextCalls.every((p) => /\.(ini|log|imp)$/i.test(p)), `read: ${fs.readTextCalls.join(", ")}`);
  });
});
