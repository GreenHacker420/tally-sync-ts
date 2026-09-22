export type TallyLogical = true | false | "Not Applicable" | undefined;

export interface TallyQuantity {
  value: number;
  unit?: string;
  raw: string;
}

export interface TallyRate {
  value: number;
  unit?: string;
  raw: string;
}

export interface TallyAmount {
  value: number;
  currency?: string;
  forexValue?: number;
  forexCurrency?: string;
  rateOfExchange?: number;
  raw?: string;
}

export type TallyDateString = `${number}${number}${number}${number}${number}${number}${number}${number}`;
export type TallyDateInput = Date | string;
export type TallyDateOutput = string;

/**
 * Common Regular Expressions & Patterns
 */
export const REGEX_CONTROL_CHAR = /\u0004/g;
export const REGEX_COMMA = /,/g;
export const REGEX_NOT_APPLICABLE = /not applicable/i;
export const REGEX_DATE_DELIMITER = /[-/]/g;

export const NUMERIC_PATTERN = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
export const REGEX_QUANTITY = new RegExp(`^(${NUMERIC_PATTERN})(?:\\s+(.+))?$`);
export const REGEX_RATE = new RegExp(`^(${NUMERIC_PATTERN})(?:\\/([^\\s]+))?$`);

export const COMMON_REGEX = {
  CONTROL_CHAR: REGEX_CONTROL_CHAR,
  COMMA: REGEX_COMMA,
  NOT_APPLICABLE: REGEX_NOT_APPLICABLE,
  DATE_DELIMITER: REGEX_DATE_DELIMITER,
  NUMERIC_PATTERN,
  QUANTITY: REGEX_QUANTITY,
  RATE: REGEX_RATE,
} as const;

export function getSingleValue(val: unknown): unknown {
  if (val === null || val === undefined) return undefined;
  if (Array.isArray(val)) return val.length > 0 ? getSingleValue(val[0]) : undefined;
  if (typeof val === "object" && val !== null && "#text" in (val as any)) {
    return (val as any)["#text"];
  }
  return val;
}

export function tallyText(value: unknown): string | undefined {
  const raw = getSingleValue(value);
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).replace(REGEX_CONTROL_CHAR, "").trim();
  return text === "" ? undefined : text;
}

export function tallyNumber(value: unknown): number | undefined {
  const text = tallyText(value);
  if (text === undefined) return undefined;
  const normalized = text.replace(REGEX_COMMA, "");
  const valueNumber = Number(normalized);
  return Number.isFinite(valueNumber) ? valueNumber : undefined;
}

export function tallyBoolean(value: unknown): boolean | undefined {
  const text = tallyText(value)?.toLowerCase();
  switch (text) {
    case "yes":
    case "true":
    case "1":
      return true;
    case "no":
    case "false":
    case "0":
      return false;
    default:
      return undefined;
  }
}

export function tallyLogical(value: unknown): TallyLogical {
  const text = tallyText(value);
  if (text === undefined) return undefined;
  if (REGEX_NOT_APPLICABLE.test(text)) return "Not Applicable";
  return tallyBoolean(text);
}

function parseValueWithUnit(
  raw: string,
  regex: RegExp
): { value: number; unit?: string } | null {
  const match = raw.match(regex);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: match[2]?.trim(),
  };
}

export function parseQuantity(input: unknown): TallyQuantity | undefined {
  const raw = tallyText(input);
  if (!raw) return undefined;
  const parsed = parseValueWithUnit(raw, REGEX_QUANTITY);
  if (!parsed) {
    return { value: Number.NaN, raw };
  }
  return {
    value: parsed.value,
    unit: parsed.unit,
    raw,
  };
}

export function parseRate(input: unknown): TallyRate | undefined {
  const raw = tallyText(input);
  if (!raw) return undefined;
  const parsed = parseValueWithUnit(raw, REGEX_RATE);
  if (parsed) {
    return {
      value: parsed.value,
      unit: parsed.unit,
      raw,
    };
  }
  const num = tallyNumber(raw);
  return {
    value: num ?? Number.NaN,
    raw,
  };
}

export function parseAmount(input: unknown): TallyAmount | undefined {
  const raw = tallyText(input);
  if (!raw) return undefined;
  const num = tallyNumber(raw);
  return {
    value: num ?? 0,
    raw,
  };
}

export function formatDateForTally(d: TallyDateInput | undefined): string {
  if (!d) return "";
  if (typeof d === "string") {
    const clean = d.replace(REGEX_DATE_DELIMITER, "").trim();
    if (clean.length === 8) return clean;
    const dateObj = new Date(d);
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, "0");
      const day = String(dateObj.getDate()).padStart(2, "0");
      return `${year}${month}${day}`;
    }
    return clean;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
