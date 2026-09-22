import {
  tallyText,
  tallyNumber,
  tallyBoolean,
  tallyLogical,
  parseQuantity,
  parseRate,
  parseAmount,
  TallyLogical,
  TallyQuantity,
  TallyRate,
  TallyAmount,
} from "./values.js";
import { TallyUnknownFields } from "./types.js";

export function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

/**
 * TallyReader provides ultra-fast O(1) case-insensitive field lookups
 * by building an internal uppercase key-map on construction.
 */
export class TallyReader {
  private readonly node: Record<string, unknown>;
  private readonly upperMap: Map<string, unknown>;

  constructor(node: unknown) {
    if (Array.isArray(node)) {
      this.node = (node[0] && typeof node[0] === "object") ? (node[0] as Record<string, unknown>) : {};
    } else if (node && typeof node === "object") {
      this.node = node as Record<string, unknown>;
    } else {
      this.node = {};
    }

    this.upperMap = new Map();
    for (const [k, v] of Object.entries(this.node)) {
      this.upperMap.set(k.toUpperCase(), v);
    }
  }

  /**
   * Ultra-fast O(1) case-insensitive lookup using pre-computed upper map
   */
  raw(tag: string): unknown {
    return this.upperMap.get(tag.toUpperCase());
  }

  text(tag: string): string | undefined {
    return tallyText(this.raw(tag));
  }

  number(tag: string): number | undefined {
    return tallyNumber(this.raw(tag));
  }

  boolean(tag: string): boolean | undefined {
    return tallyBoolean(this.raw(tag));
  }

  logical(tag: string): TallyLogical {
    return tallyLogical(this.raw(tag));
  }

  quantity(tag: string): TallyQuantity | undefined {
    return parseQuantity(this.raw(tag));
  }

  rate(tag: string): TallyRate | undefined {
    return parseRate(this.raw(tag));
  }

  amount(tag: string): TallyAmount | undefined {
    return parseAmount(this.raw(tag));
  }

  amountVal(tag: string): number | undefined {
    return parseAmount(this.raw(tag))?.value;
  }

  list(tag: string): Record<string, unknown>[] {
    const rawVal = this.raw(tag);
    if (!rawVal) return [];
    return asArray(rawVal).filter(
      (v): v is Record<string, unknown> => !!v && typeof v === "object"
    );
  }

  attr(name: string): string | undefined {
    const upper = name.toUpperCase();
    return tallyText(
      this.upperMap.get("@_" + upper) ??
      this.upperMap.get(upper)
    );
  }

  firstText(...tags: readonly string[]): string | undefined {
    for (const tag of tags) {
      const value = this.text(tag);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  collectUnknown(knownTags: ReadonlySet<string>): TallyUnknownFields | undefined {
    const unknown: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(this.node)) {
      if (k.startsWith("@_") || k.startsWith("?") || k === "#text") continue;
      const upper = k.toUpperCase();
      if (!knownTags.has(upper)) {
        unknown[k] = v;
        count++;
      }
    }
    return count > 0 ? unknown : undefined;
  }
}
