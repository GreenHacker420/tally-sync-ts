import { open, stat } from "node:fs/promises";
import * as path from "node:path";

export const IMPORT_LOG_FILE_NAME = "Tally.imp";
const WINDOWS_PATH = /^[A-Za-z]:[\\/]|\\/;

/** Tally writes `Tally.imp` into its installation folder (LicenseInfo.applicationPath). */
export function importLogPath(applicationPath: string): string {
  return WINDOWS_PATH.test(applicationPath)
    ? path.win32.join(applicationPath, IMPORT_LOG_FILE_NAME)
    : path.join(applicationPath, IMPORT_LOG_FILE_NAME);
}

async function sizeOrZero(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
}

/** Take a byte offset before an import so only that import's log lines are read afterwards. */
export function importLogMark(file: string): Promise<number> {
  return sizeOrZero(file);
}

/** Read what was appended after `offset`. If the log shrank (Tally recreated it) it is read from the start. */
export async function readImportLogSince(file: string, offset: number): Promise<string> {
  const size = await sizeOrZero(file);
  if (size === 0) return "";
  const from = size < offset ? 0 : offset;
  if (size === from) return "";
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(size - from);
    await handle.read(buffer, 0, buffer.length, from);
    // Tally may write UTF-16LE with a BOM; decode accordingly.
    const isUtf16 = buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe;
    return isUtf16 ? buffer.subarray(2).toString("utf16le") : buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}
