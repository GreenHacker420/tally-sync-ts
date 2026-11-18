import { assertPaise, divRoundHalfUp, type Paise } from "./money.js";

export const TaxMode = { INCLUSIVE: "INCLUSIVE", EXCLUSIVE: "EXCLUSIVE" } as const;
export type TaxMode = (typeof TaxMode)[keyof typeof TaxMode];

/** Where Tally rounds the tax: on each line, or once on the summed taxable value of a slab. Proven per release by golden files. */
export const RoundingStrategy = { PER_SLAB: "PER_SLAB", PER_LINE: "PER_LINE" } as const;
export type RoundingStrategy = (typeof RoundingStrategy)[keyof typeof RoundingStrategy];

export interface LineGst {
  taxability: string;
  basisPoints: { cgst: number; sgst: number; igst: number; cess: number };
}

export interface TaxLineInput {
  /** INCLUSIVE: what the customer pays for the line. EXCLUSIVE: the taxable value of the line. Positive paise, after line discount. */
  amountPaise: Paise;
  gst: LineGst;
}

export interface TaxOptions {
  taxMode: TaxMode;
  /** true => IGST only; false => CGST + SGST. Decided by place of supply vs the company's state. */
  interState: boolean;
  rounding?: RoundingStrategy;
  /** Round the party total to a whole rupee and book the difference to the Round Off ledger. */
  roundTotalToRupee?: boolean;
}

export interface LineTax {
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  cessPaise: Paise;
}

export interface Slab {
  key: string;
  gst: LineGst;
  taxablePaise: Paise;
  cgstPaise: Paise;
  sgstPaise: Paise;
  igstPaise: Paise;
  cessPaise: Paise;
}

export interface TaxResult {
  lines: LineTax[];
  slabs: Slab[];
  taxablePaise: Paise;
  taxPaise: Paise;
  /** taxable + tax, before round-off. */
  computedTotalPaise: Paise;
  /** What the party ledger is debited with. */
  partyAmountPaise: Paise;
  /** partyAmount - computedTotal; positive => credit to Round Off. */
  roundOffPaise: Paise;
}

const BP = 10_000;
const NON_TAXABLE = /^(exempt|nil.?rated|non.?gst)$/i;

function effective(gst: LineGst, interState: boolean) {
  if (NON_TAXABLE.test(gst.taxability)) return { cgst: 0, sgst: 0, igst: 0, cess: 0 };
  return interState
    ? { cgst: 0, sgst: 0, igst: gst.basisPoints.igst, cess: gst.basisPoints.cess }
    : { cgst: gst.basisPoints.cgst, sgst: gst.basisPoints.sgst, igst: 0, cess: gst.basisPoints.cess };
}

const slabKey = (gst: LineGst): string => `${gst.taxability}|${gst.basisPoints.cgst}|${gst.basisPoints.sgst}|${gst.basisPoints.igst}|${gst.basisPoints.cess}`;
const tax = (taxable: number, bp: number): number => divRoundHalfUp(taxable * bp, BP);

/** Pure tax computation for one invoice. Throws on non-integer or non-positive amounts. */
export function computeInvoiceTax(inputs: readonly TaxLineInput[], options: TaxOptions): TaxResult {
  if (inputs.length === 0) throw new RangeError("An invoice needs at least one line");
  const rounding = options.rounding ?? RoundingStrategy.PER_SLAB;

  const lines: LineTax[] = inputs.map((input, i) => {
    assertPaise(input.amountPaise, `line ${i + 1} amount`);
    if (input.amountPaise <= 0) throw new RangeError(`line ${i + 1} amount must be positive`);
    const bp = effective(input.gst, options.interState);
    const taxable =
      options.taxMode === TaxMode.INCLUSIVE
        ? divRoundHalfUp(input.amountPaise * BP, BP + bp.cgst + bp.sgst + bp.igst + bp.cess)
        : input.amountPaise;
    return {
      taxablePaise: taxable,
      cgstPaise: tax(taxable, bp.cgst),
      sgstPaise: tax(taxable, bp.sgst),
      igstPaise: tax(taxable, bp.igst),
      cessPaise: tax(taxable, bp.cess),
    };
  });

  const slabMap = new Map<string, Slab>();
  inputs.forEach((input, i) => {
    const key = slabKey(input.gst);
    const slab = slabMap.get(key) ?? { key, gst: input.gst, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, cessPaise: 0 };
    slab.taxablePaise += lines[i].taxablePaise;
    slabMap.set(key, slab);
    if (rounding === RoundingStrategy.PER_LINE) {
      slab.cgstPaise += lines[i].cgstPaise; slab.sgstPaise += lines[i].sgstPaise;
      slab.igstPaise += lines[i].igstPaise; slab.cessPaise += lines[i].cessPaise;
    }
  });
  const slabs = [...slabMap.values()];
  if (rounding === RoundingStrategy.PER_SLAB) {
    for (const slab of slabs) {
      const bp = effective(slab.gst, options.interState);
      slab.cgstPaise = tax(slab.taxablePaise, bp.cgst); slab.sgstPaise = tax(slab.taxablePaise, bp.sgst);
      slab.igstPaise = tax(slab.taxablePaise, bp.igst); slab.cessPaise = tax(slab.taxablePaise, bp.cess);
    }
  }

  const taxablePaise = slabs.reduce((s, x) => s + x.taxablePaise, 0);
  const taxPaise = slabs.reduce((s, x) => s + x.cgstPaise + x.sgstPaise + x.igstPaise + x.cessPaise, 0);
  const computedTotalPaise = taxablePaise + taxPaise;
  const base = options.taxMode === TaxMode.INCLUSIVE ? inputs.reduce((s, x) => s + x.amountPaise, 0) : computedTotalPaise;
  const partyAmountPaise = options.roundTotalToRupee ? divRoundHalfUp(base, 100) * 100 : base;
  return { lines, slabs, taxablePaise, taxPaise, computedTotalPaise, partyAmountPaise, roundOffPaise: partyAmountPaise - computedTotalPaise };
}
