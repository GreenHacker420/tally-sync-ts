import { XmlElement } from "./types.js";
import { escapeXmlText, escapeXmlAttribute } from "./escaping.js";
import { TallyLogical, TallyAmount } from "./values.js";

export function el(
  name: string,
  value?: string | number | boolean | null,
  attributes?: Record<string, string>
): XmlElement | undefined {
  if (value === undefined || value === null) return undefined;
  return {
    name,
    attributes,
    children: [String(value)],
  };
}

export function boolElement(tag: string, value: boolean | undefined): XmlElement | undefined {
  if (value === undefined) return undefined;
  return el(tag, value ? "Yes" : "No");
}

export function logicalElement(tag: string, value: TallyLogical): XmlElement | undefined {
  if (value === undefined) return undefined;
  if (value === "Not Applicable") return el(tag, "Not Applicable");
  return el(tag, value ? "Yes" : "No");
}

export function amountElement(tag: string, amount: number | TallyAmount | undefined): XmlElement | undefined {
  if (amount === undefined) return undefined;
  const val = typeof amount === "number" ? amount : amount.value;
  return el(tag, val.toFixed(2));
}

export function serializeXml(element: XmlElement, indent: number = 0): string {
  const pad = " ".repeat(indent);
  const attrs = element.attributes
    ? Object.entries(element.attributes)
        .map(([k, v]) => ` ${k}="${escapeXmlAttribute(v)}"`)
        .join("")
    : "";

  if (!element.children || element.children.length === 0) {
    return `${pad}<${element.name}${attrs}/>`;
  }

  if (element.children.length === 1 && typeof element.children[0] === "string") {
    return `${pad}<${element.name}${attrs}>${escapeXmlText(element.children[0])}</${element.name}>`;
  }

  const childLines = element.children
    .map((c) => {
      if (typeof c === "string") return `${pad}  ${escapeXmlText(c)}`;
      return serializeXml(c, indent + 2);
    })
    .join("\n");

  return `${pad}<${element.name}${attrs}>\n${childLines}\n${pad}</${element.name}>`;
}
