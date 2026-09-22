import { TallyXmlRoot } from "./types.js";
import { XMLParser } from "fast-xml-parser";

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
  isArray: (tagName) => {
    return (
      tagName === "TALLYMESSAGE" ||
      tagName === "OBJECT" ||
      tagName.endsWith(".LIST")
    );
  },
});

export function cleanResponseXml(xml: string): string {
  return xml.replace(/&#4;/g, "").replace(/\u0004/g, "");
}

export function parseRawXml(xml: string): TallyXmlRoot {
  const cleaned = cleanResponseXml(xml);
  return xmlParser.parse(cleaned);
}
