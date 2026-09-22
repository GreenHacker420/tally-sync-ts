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

export class TallyReader {
  private readonly node: Record<string, unknown>;

  constructor(node: Record<string, unknown> | unknown[] | undefined | null) {
    if (Array.isArray(node)) {
      this.node = (node[0] && typeof node[0] === "object") ? (node[0] as Record<string, unknown>) : {};
    } else if (node && typeof node === "object") {
      this.node = node as Record<string, unknown>;
    } else {
      this.node = {};
    }
  }

  raw(tag: string): unknown {
    if (!this.node || typeof this.node !== "object") return undefined;
    if (this.node[tag] !== undefined) return this.node[tag];
    const upper = tag.toUpperCase();
    for (const [k, v] of Object.entries(this.node)) {
      if (k.toUpperCase() === upper) return v;
    }
    return undefined;
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
    return tallyText(
      this.node[`@_${name.toUpperCase()}`] ??
      this.node[`@_${name}`] ??
      this.raw(`@_${name}`)
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
