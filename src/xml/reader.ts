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
  constructor(private readonly node: Record<string, unknown>) {}

  raw(tag: string): unknown {
    return this.node[tag];
  }

  text(tag: string): string | undefined {
    return tallyText(this.node[tag]);
  }

  number(tag: string): number | undefined {
    return tallyNumber(this.node[tag]);
  }

  boolean(tag: string): boolean | undefined {
    return tallyBoolean(this.node[tag]);
  }

  logical(tag: string): TallyLogical {
    return tallyLogical(this.node[tag]);
  }

  quantity(tag: string): TallyQuantity | undefined {
    return parseQuantity(this.node[tag]);
  }

  rate(tag: string): TallyRate | undefined {
    return parseRate(this.node[tag]);
  }

  amount(tag: string): TallyAmount | undefined {
    return parseAmount(this.node[tag]);
  }

  list(tag: string): Record<string, unknown>[] {
    return asArray(this.node[tag]).filter(
      (v): v is Record<string, unknown> => !!v && typeof v === "object"
    );
  }

  attr(name: string): string | undefined {
    return tallyText(
      this.node[`@_${name.toUpperCase()}`] ?? this.node[`@_${name}`]
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
      if (k.startsWith("@_") || knownTags.has(k)) continue;
      unknown[k] = v;
      count++;
    }
    return count > 0 ? unknown : undefined;
  }
}
