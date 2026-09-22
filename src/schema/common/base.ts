import { TallyUnknownFields, TallyXmlNode } from "../../xml/types.js";

export interface BaseObject {}

export interface BaseTallyObject extends BaseObject {
  guid?: string;
  remoteId?: string;
  action?: "Create" | "Alter" | "Delete" | "Cancel";
  tallyUnknown?: TallyUnknownFields;
  _raw?: TallyXmlNode | Record<string, unknown>;
}

export interface TallyObject extends BaseTallyObject {
  masterId?: number;
  alterId?: number;
  enteredBy?: string;
  alteredBy?: string;
  canDelete?: boolean;
}

export interface BaseMasterObject extends TallyObject {
  name: string;
}

export interface LanguageNameList {
  names: string[];
  languageId?: number;
}

export interface BaseAliasedMasterObject extends BaseMasterObject {
  alias?: string;
  languageNameList?: LanguageNameList[];
}
