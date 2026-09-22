export type TallyXmlPrimitive = string;

export interface TallyXmlNode {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly children: readonly TallyXmlNode[];
}

export type TallyUnknownFields = Record<string, unknown>;

export interface XmlElement {
  name: string;
  attributes?: Record<string, string>;
  children?: Array<XmlElement | string>;
}
