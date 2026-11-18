/**
 * Environment data used by the Tally data-path finder (Windows). Data, not logic: tunable per machine/OS and
 * overridable through policy; kept out of the finder so the algorithm carries no filesystem assumptions.
 */
export interface FinderEnvironment {
  /** Directory names never scanned (system, caches, tooling). Lower-case. */
  skipDirs: ReadonlySet<string>;
  /** Path hints that mark a company folder as a backup/copy rather than live data. */
  backupHint: RegExp;
  /** Default Tally data locations, relative to the install dir (`{install}`) or absolute. */
  defaultRoots: readonly string[];
  /** Text files Tally writes that may mention data paths. */
  logNames: readonly string[];
}

export const WINDOWS_FINDER_ENVIRONMENT: FinderEnvironment = {
  skipDirs: new Set(["windows", "program files", "program files (x86)", "programdata", "$recycle.bin", "system volume information", "recovery", "msocache", "perflogs", "node_modules", ".git", "windows.old", "appdata", "intel", "nvidia", "amd", "$windows.~bt", "config.msi"]),
  backupHint: /backup|bak\b|\bcopy\b|old|restore|archive|temp|tmp|recycle/i,
  defaultRoots: ["{install}\\Data", "C:\\Users\\Public\\TallyPrime\\Data", "C:\\Users\\Public\\TallyPrimeData\\Data", "C:\\Users\\Public\\Tally.ERP9\\Data"],
  logNames: ["tallyerr.log", "tdlfunc.log", "tallyhttp.log", "exchangetime.log", "tally.imp"],
};
