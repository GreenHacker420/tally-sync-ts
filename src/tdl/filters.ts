import { escapeTdlString } from "../xml/escaping.js";

export type TallyFormula = string & { readonly __tallyFormula?: never };

export interface TallyFilterDefinition {
  readonly name: string;
  readonly formula?: string;
}

export function tdlStringLiteral(value: string): string {
  return escapeTdlString(value);
}
