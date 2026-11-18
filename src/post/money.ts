/** Integer paise helpers. Money never touches floating point arithmetic in the posting path. */
export type Paise = number;

export function assertPaise(value: number, label: string): Paise {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer number of paise, got ${value}`);
  return value;
}

/** round_half_up(numerator / denominator) for non-negative integers. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (numerator < 0 || denominator <= 0) throw new RangeError("divRoundHalfUp expects numerator >= 0 and denominator > 0");
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Tally's two-decimal amount string from paise, e.g. 123456 -> "1234.56", -50 -> "-0.50". */
export function paiseToTally(paise: Paise): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parse "1,234.56" / "-1234.5" / " 18 " into paise without float math. */
export function tallyToPaise(text: string): Paise {
  const m = text.replace(/,/g, "").trim().match(/^(-?)(\d+)(?:\.(\d{0,2})\d*)?$/);
  if (!m) throw new RangeError(`Not a Tally amount: "${text}"`);
  const paise = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -paise : paise;
}
