/**
 * Tally data-path finder.
 *
 * Tally's company data does not have to live under the TallyPrime folder: it can be on E:\ or any drive
 * (`tally.ini` `Data=`, `Load=`, a path chosen in Alt+Y > Data Path, or companies loaded from other drives).
 * Strategy, strongest evidence first, always verified against the real disk:
 *   1. Tally itself reports each loaded company's folder number (`CompanyNumber`, e.g. 100003) - authoritative.
 *   2. `tally.ini` `Load=` (full path) and `Data=` roots.
 *   3. Paths mentioned in Tally's own logs (tallyerr.log ...), e.g. `D:\data\010009\TSTATE.TSF`.
 *   4. Default locations.
 *   5. A bounded scan of every drive for numbered folders that carry Tally's file signature.
 *
 * SAFETY: only directory listings and file stat() are used on company folders. The data files themselves
 * (*.900, *.1800, LST_*.dat ...) are never opened; text is read only from *.ini, *.log and *.imp.
 */

export interface DirEntry { name: string; isDir: boolean }
export interface FileStat { size: number; mtimeMs: number; isDir: boolean }

/** Windows-style paths only (the agent runs on the Tally PC). Implementations must never be asked to read data files. */
export interface FsPort {
  listDrives(): Promise<string[]>;
  readdir(dir: string): Promise<DirEntry[] | undefined>;
  stat(path: string): Promise<FileStat | undefined>;
  readText(path: string): Promise<string | undefined>;
}

export const DataPathSource = {
  TALLY_REPORTED: "TALLY_REPORTED",
  INI_LOAD: "INI_LOAD",
  INI_DATA: "INI_DATA",
  LOG: "LOG",
  DEFAULT: "DEFAULT",
  SCAN: "SCAN",
} as const;
export type DataPathSource = (typeof DataPathSource)[keyof typeof DataPathSource];

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export interface TallyIni {
  dataPaths: string[];
  loadPaths: string[];
  loadNumbers: string[];
  exportPath?: string;
  defaultCompanies?: boolean;
  serverPort?: number;
  clientServer?: string;
  odbcServer?: boolean;
  ignoreTcpTimeout?: boolean;
  loadBuffering?: boolean;
  gatewayServer?: string;
}

export interface CompanyFolder {
  number: string;
  path: string;
  root: string;
  verified: boolean;
  reportedByTally: boolean;
  sources: DataPathSource[];
  confidence: Confidence;
  looksLikeBackup: boolean;
  signature: string[];
  sizeBytes: number;
  lastModifiedMs: number;
  /** Files whose modification time moves when Tally saves (for the file-watch trigger). Metadata only. */
  watchFiles: string[];
}

export interface DataPathReport {
  companies: CompanyFolder[];
  unresolvedNumbers: string[];
  roots: string[];
  ini?: TallyIni;
  exportPath?: string;
  evidence: string[];
  scan: { performed: boolean; complete: boolean; visitedDirs: number; durationMs: number };
}

export interface FindOptions {
  fs: FsPort;
  installDir?: string;
  /** Folder numbers of the companies Tally says are loaded (`CompanyNumber`). */
  companyNumbers?: readonly string[];
  /** Force a drive scan even when everything was resolved (e.g. to list unloaded companies). */
  deepScan?: boolean;
  maxDepth?: number;
  maxDirs?: number;
  timeBudgetMs?: number;
  now?: () => number;
  extraLogNames?: readonly string[];
}

// ---- text helpers -------------------------------------------------------------------------------
export function decodeTallyText(buf: Buffer | Uint8Array): string {
  const b = Buffer.from(buf);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString("utf16le");
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return b.subarray(3).toString("utf8");
  if (b.length > 2 && b[1] === 0x00 && b[0] !== 0x00) return b.toString("utf16le");
  return b.toString("utf8");
}

const COMPANY_NUMBER = /^\d{5,6}$/;

export function normWinPath(p: string, baseDir?: string): string {
  let s = p.trim().replace(/^["']|["']$/g, "").replace(/\//g, "\\");
  if (/^\.\.?\\/.test(s) && baseDir) {
    const parts = baseDir.replace(/\\+$/, "").split("\\");
    for (const seg of s.split("\\")) { if (seg === "." || seg === "") continue; if (seg === "..") parts.pop(); else parts.push(seg); }
    s = parts.join("\\");
  }
  s = s.replace(/\\+$/, "");
  if (/^[a-z]:/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}
const key = (p: string): string => normWinPath(p).toLowerCase();
const join = (a: string, b: string): string => `${a.replace(/\\+$/, "")}\\${b}`;
const parent = (p: string): string => normWinPath(p).split("\\").slice(0, -1).join("\\");
const base = (p: string): string => normWinPath(p).split("\\").pop() ?? "";

const truthy = (v: string): boolean => /^(yes|true|1)$/i.test(v.trim());

export function parseTallyIni(text: string, installDir?: string): TallyIni {
  const out: TallyIni = { dataPaths: [], loadPaths: [], loadNumbers: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("[")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim().toLowerCase();
    const v = line.slice(eq + 1).trim();
    if (!v) continue;
    switch (k) {
      case "data": out.dataPaths.push(normWinPath(v, installDir)); break;
      case "load": if (COMPANY_NUMBER.test(v)) out.loadNumbers.push(v); else out.loadPaths.push(normWinPath(v, installDir)); break;
      case "export path": out.exportPath = normWinPath(v, installDir); break;
      case "default companies": out.defaultCompanies = truthy(v); break;
      case "serverport": out.serverPort = Number(v) || undefined; break;
      case "client server": out.clientServer = v; break;
      case "enable odbc server": out.odbcServer = truthy(v); break;
      case "ignore tcp timeout": out.ignoreTcpTimeout = truthy(v); break;
      case "load buffering": out.loadBuffering = truthy(v); break;
      case "tally gateway server": out.gatewayServer = v; break;
      default: break;
    }
  }
  return out;
}

export function extractCompanyPathsFromLog(text: string): Array<{ root: string; number: string }> {
  const seen = new Set<string>();
  const out: Array<{ root: string; number: string }> = [];
  const re = /([A-Za-z]:\\(?:[^\\/:*?"<>|\r\n\x00]+\\)*?)(\d{5,6})(?=\\)/g;
  for (const m of text.matchAll(re)) {
    const root = normWinPath(m[1]);
    const k = `${root.toLowerCase()}|${m[2]}`;
    if (!root || seen.has(k)) continue;
    seen.add(k);
    out.push({ root, number: m[2] });
  }
  return out;
}

export function looksLikeCompanyFolder(names: readonly string[]): { isCompany: boolean; signature: string[] } {
  const lower = names.map((n) => n.toLowerCase());
  const has900 = lower.filter((n) => n.endsWith(".900"));
  const has1800 = lower.filter((n) => n.endsWith(".1800"));
  const hasCompany = lower.includes("company.900");
  const signature: string[] = [];
  if (hasCompany) signature.push("Company.900");
  if (has900.length) signature.push(`${has900.length}x .900`);
  if (has1800.length) signature.push(`${has1800.length}x .1800`);
  if (lower.some((n) => /^lst_.*\.dat$/.test(n))) signature.push("LST_*.dat");
  return { isCompany: hasCompany || (has900.length >= 1 && has1800.length >= 1), signature };
}

// ---- finder -------------------------------------------------------------------------------------
const SKIP_DIRS = new Set(["windows", "program files", "program files (x86)", "programdata", "$recycle.bin", "system volume information", "recovery", "msocache", "perflogs", "node_modules", ".git", "windows.old", "appdata", "intel", "nvidia", "amd", "$windows.~bt", "config.msi"]);
const BACKUP_HINT = /backup|bak\b|\bcopy\b|old|restore|archive|temp|tmp|recycle/i;
const DEFAULT_ROOTS = (install?: string): string[] => [
  ...(install ? [join(install, "Data")] : []),
  "C:\\Users\\Public\\TallyPrime\\Data",
  "C:\\Users\\Public\\TallyPrimeData\\Data",
  "C:\\Users\\Public\\Tally.ERP9\\Data",
];
const LOG_NAMES = ["tallyerr.log", "tdlfunc.log", "tallyhttp.log", "exchangetime.log", "tally.imp"];

async function inspectFolder(fs: FsPort, path: string): Promise<{ verified: boolean; signature: string[]; sizeBytes: number; lastModifiedMs: number; watchFiles: string[] }> {
  const entries = await fs.readdir(path);
  if (!entries) return { verified: false, signature: [], sizeBytes: 0, lastModifiedMs: 0, watchFiles: [] };
  const files = entries.filter((e) => !e.isDir);
  const sig = looksLikeCompanyFolder(files.map((f) => f.name));
  let sizeBytes = 0; let lastModifiedMs = 0; const watchFiles: string[] = [];
  if (sig.isCompany) {
    for (const f of files) {
      const full = join(path, f.name);
      const st = await fs.stat(full); // metadata only
      if (!st) continue;
      sizeBytes += st.size; lastModifiedMs = Math.max(lastModifiedMs, st.mtimeMs);
      if (/\.1800$/i.test(f.name) || /^company\.900$/i.test(f.name)) watchFiles.push(full);
    }
  }
  return { verified: sig.isCompany, signature: sig.signature, sizeBytes, lastModifiedMs, watchFiles };
}

export async function findTallyDataPaths(opts: FindOptions): Promise<DataPathReport> {
  const { fs, installDir } = opts;
  const now = opts.now ?? Date.now;
  const started = now();
  const evidence: string[] = [];
  const wanted = new Set((opts.companyNumbers ?? []).map(String));
  const found = new Map<string, CompanyFolder>(); // key: lowercase full path
  const roots = new Map<string, string>();

  const addCandidate = async (root: string, number: string, source: DataPathSource): Promise<boolean> => {
    const path = join(root, number);
    const k = key(path);
    const existing = found.get(k);
    if (existing) { if (!existing.sources.includes(source)) existing.sources.push(source); return existing.verified; }
    const info = await inspectFolder(fs, path);
    if (!info.verified) { evidence.push(`${source}: ${path} - folder not found or not a Tally company folder`); return false; }
    found.set(k, { number, path, root: normWinPath(root), verified: true, reportedByTally: wanted.has(number), sources: [source], confidence: "MEDIUM", looksLikeBackup: BACKUP_HINT.test(path), signature: info.signature, sizeBytes: info.sizeBytes, lastModifiedMs: info.lastModifiedMs, watchFiles: info.watchFiles });
    roots.set(key(root), normWinPath(root));
    evidence.push(`${source}: ${path} verified (${info.signature.join(", ")})`);
    return true;
  };

  // 1+2: ini
  let ini: TallyIni | undefined;
  if (installDir) {
    const text = await fs.readText(join(installDir, "tally.ini"));
    if (text) ini = parseTallyIni(text, installDir);
    else evidence.push(`INI: ${join(installDir, "tally.ini")} not readable`);
  }
  if (ini) {
    for (const p of ini.loadPaths) { const n = base(p); if (COMPANY_NUMBER.test(n)) await addCandidate(parent(p), n, DataPathSource.INI_LOAD); else evidence.push(`INI: Load=${p} is not a company folder path`); }
    const roots2 = [...ini.dataPaths];
    for (const root of roots2) {
      const nums = wanted.size ? [...wanted] : ini.loadNumbers;
      let any = false;
      for (const n of nums) any = (await addCandidate(root, n, DataPathSource.INI_DATA)) || any;
      if (!any && !(await fs.readdir(root))) evidence.push(`INI: Data=${root} - path unavailable (drive missing or folder moved)`);
    }
  }

  // 3: logs
  const logNames = [...LOG_NAMES, ...(opts.extraLogNames ?? [])];
  if (installDir) {
    for (const name of logNames) {
      const text = await fs.readText(join(installDir, name));
      if (!text) continue;
      for (const { root, number } of extractCompanyPathsFromLog(text)) await addCandidate(root, number, DataPathSource.LOG);
    }
  }

  // 4: defaults
  const unresolvedNow = () => [...wanted].filter((n) => ![...found.values()].some((c) => c.number === n));
  if (wanted.size === 0 || unresolvedNow().length) {
    for (const root of DEFAULT_ROOTS(installDir)) {
      const entries = await fs.readdir(root);
      if (!entries) continue;
      for (const e of entries) if (e.isDir && COMPANY_NUMBER.test(e.name) && (!wanted.size || wanted.has(e.name))) await addCandidate(root, e.name, DataPathSource.DEFAULT);
    }
  }

  // 5: bounded scan
  const scan = { performed: false, complete: true, visitedDirs: 0, durationMs: 0 };
  // Without Tally's list of loaded companies we cannot know when we are done, so list everything on disk.
  const deepScan = opts.deepScan ?? wanted.size === 0;
  const wantedHaveLiveCopy = (): boolean => [...wanted].every((n) => [...found.values()].some((c) => c.number === n && !c.looksLikeBackup));
  if (deepScan || unresolvedNow().length || !wantedHaveLiveCopy()) {
    scan.performed = true;
    const maxDepth = opts.maxDepth ?? 4; const maxDirs = opts.maxDirs ?? 20_000; const budget = opts.timeBudgetMs ?? 20_000;
    const queue: Array<{ path: string; depth: number }> = [];
    for (const d of await fs.listDrives()) queue.push({ path: normWinPath(d), depth: 0 });
    // find shallow (depth) first so live data is found before deep trees
    while (queue.length) {
      if (scan.visitedDirs >= maxDirs || now() - started > budget) { scan.complete = false; break; }
      const { path, depth } = queue.shift()!;
      const entries = await fs.readdir(path.length === 2 ? `${path}\\` : path);
      scan.visitedDirs += 1;
      if (!entries) continue;
      for (const e of entries) {
        if (!e.isDir) continue;
        const lower = e.name.toLowerCase();
        if (SKIP_DIRS.has(lower)) continue;
        if (COMPANY_NUMBER.test(e.name)) {
          if (!wanted.size || wanted.has(e.name) || deepScan) await addCandidate(path.length === 2 ? `${path}\\` : path, e.name, DataPathSource.SCAN);
          continue;
        }
        if (depth + 1 < maxDepth) queue.push({ path: join(path, e.name), depth: depth + 1 });
      }
      if (!deepScan && wanted.size && wantedHaveLiveCopy()) break; // every loaded company has a non-backup copy
    }
    scan.durationMs = now() - started;
  }

  // confidence + ordering
  const list = [...found.values()];
  for (const c of list) {
    const strongSource = c.sources.some((s) => s === DataPathSource.INI_LOAD || s === DataPathSource.INI_DATA || s === DataPathSource.LOG || s === DataPathSource.DEFAULT);
    c.confidence = c.verified && c.reportedByTally && (strongSource || c.sources.includes(DataPathSource.SCAN)) ? (strongSource ? "HIGH" : "MEDIUM") : c.verified ? "MEDIUM" : "LOW";
  }
  const rank = (c: CompanyFolder) => (c.looksLikeBackup ? 1 : 0) * 10 + (c.confidence === "HIGH" ? 0 : c.confidence === "MEDIUM" ? 1 : 2) - Math.min(c.sources.length, 4) * 0.01;
  list.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));

  return { companies: list, unresolvedNumbers: unresolvedNow(), roots: [...roots.values()], ini, exportPath: ini?.exportPath, evidence, scan };
}
