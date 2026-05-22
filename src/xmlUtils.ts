import { TallyAmount } from "./types.js";

export function escapeXml(unsafe: unknown): string {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatDateForTally(date: Date | string | undefined | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function formatBoolForTally(val: boolean | undefined | null): string {
  return val ? "Yes" : "No";
}

export function parseTallyBoolean(val: unknown): boolean | undefined {
  const cleanVal = getSingleValue(val);
  if (cleanVal === undefined || cleanVal === null || cleanVal === "") return undefined;
  if (typeof cleanVal === "boolean") return cleanVal;
  const str = String(cleanVal).trim().toLowerCase();
  if (["yes", "true", "1"].includes(str)) return true;
  if (["no", "false", "0"].includes(str)) return false;
  return undefined;
}

export function formatAmountForTally(amount: number | TallyAmount | undefined | null): string {
  if (amount === undefined || amount === null) return "";
  if (typeof amount === "number") return String(amount);

  if (amount.forexAmount !== undefined && amount.forexCurrency) {
    const rate = amount.rateOfExchange ? ` @ ${amount.rateOfExchange}/${amount.forexCurrency}` : "";
    const currencyStr = amount.currency ? ` = ${amount.currency}` : "";
    return `${amount.forexCurrency} ${amount.forexAmount}${rate}${currencyStr} ${amount.amount}`;
  }

  let val = amount.amount;
  if (amount.isDebit) val = -Math.abs(val);
  return String(val);
}

export function getSingleValue(val: any): any {
  if (Array.isArray(val)) return val[0];
  if (val && typeof val === "object") return val["#text"] ?? val;
  return val;
}

export function asArray<T = any>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

export function parseTallyNumeric(val: unknown): number | undefined {
  const cleanVal = getSingleValue(val);
  if (cleanVal === undefined || cleanVal === null) return undefined;
  if (typeof cleanVal === "number") return cleanVal;
  const str = String(cleanVal).trim();
  if (!str) return undefined;
  const drCrMultiplier = /\bcr\b/i.test(str) ? -1 : 1;
  const match = str.match(/([+-]?\d[\d,.]*)/);
  if (!match) return undefined;
  const num = parseFloat(match[1].replace(/,/g, ""));
  if (isNaN(num)) return undefined;
  return num * drCrMultiplier;
}

export function cleanResponseXml(xml: string): string {
  if (!xml) return "";
  return xml.replace(/&#4; /g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
