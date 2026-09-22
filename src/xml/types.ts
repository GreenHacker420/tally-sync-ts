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

export interface TallyXmlHeader {
  VERSION?: string | number;
  TALLYREQUEST?: string;
  TYPE?: string;
  ID?: string;
  STATUS?: string;
  SUBSTATUS?: string;
  [key: string]: unknown;
}

export interface TallyXmlImportResult {
  CREATED?: string | number;
  ALTERED?: string | number;
  DELETED?: string | number;
  COMBINED?: string | number;
  IGNORED?: string | number;
  CANCELLED?: string | number;
  ERRORS?: string | number;
  LASTMID?: string | number;
  LASTVCHID?: string | number;
  [key: string]: unknown;
}

export interface TallyXmlResultItem {
  OBJECTTYPE?: string;
  NAME?: string;
  MASTERID?: string | number;
  GUID?: string;
  REMOTEID?: string;
  ERROR?: string;
  [key: string]: unknown;
}

export interface TallyXmlResultsContainer {
  RESULT?: TallyXmlResultItem | TallyXmlResultItem[];
  [key: string]: unknown;
}

export interface TallyStatisticItem {
  OBJECTTYPE?: string;
  VCHTYPE?: string;
  COUNT?: string | number;
  STATAMOUNT?: string | number;
  [key: string]: unknown;
}

export interface TallyLicenseInfoLine {
  SERIALNUMBER?: string;
  REMOTESERIALNUMBER?: string;
  ACCOUNTID?: string;
  ADMINMAILID?: string;
  ISADMIN?: string | boolean;
  ISEDUCATIONALMODE?: string | boolean;
  ISSILVER?: string | boolean;
  ISGOLD?: string | boolean;
  PLANNAME?: string;
  ISINDIAN?: string | boolean;
  APPLICATIONPATH?: string;
  DATAPATH?: string;
  USERLEVEL?: string;
  USERNAME?: string;
  TALLYVERSION?: string;
  [key: string]: unknown;
}

export interface TallyLicenseInfoReportNode {
  LICENSEINFOREPORT?: {
    LicenseInfoPart?: {
      LICENSEINFOPART?: {
        LicenseInfoLine?: TallyLicenseInfoLine;
      };
    };
  };
  [key: string]: unknown;
}

export interface TallyLastAlterIdsReportNode {
  LASTALTERIDSREPORT?: {
    MASTERSLASTID?: string | number;
    VOUCHERSLASTID?: string | number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TallyXmlCollection {
  VOUCHER?: TallyXmlNodeObject | TallyXmlNodeObject[];
  LEDGER?: TallyXmlNodeObject | TallyXmlNodeObject[];
  STOCKITEM?: TallyXmlNodeObject | TallyXmlNodeObject[];
  COMPANY?: TallyXmlNodeObject | TallyXmlNodeObject[];
  GROUP?: TallyXmlNodeObject | TallyXmlNodeObject[];
  STOCKGROUP?: TallyXmlNodeObject | TallyXmlNodeObject[];
  STOCKCATEGORY?: TallyXmlNodeObject | TallyXmlNodeObject[];
  UNIT?: TallyXmlNodeObject | TallyXmlNodeObject[];
  GODOWN?: TallyXmlNodeObject | TallyXmlNodeObject[];
  VOUCHERTYPE?: TallyXmlNodeObject | TallyXmlNodeObject[];
  COSTCENTRE?: TallyXmlNodeObject | TallyXmlNodeObject[];
  COSTCATEGORY?: TallyXmlNodeObject | TallyXmlNodeObject[];
  CURRENCY?: TallyXmlNodeObject | TallyXmlNodeObject[];
  [key: string]: unknown;
}

export type TallyXmlNodeObject = Record<string, unknown>;

export interface TallyXmlData {
  COLLECTION?: TallyXmlCollection;
  TALLYMESSAGE?: TallyXmlNodeObject | TallyXmlNodeObject[];
  IMPORTRESULT?: TallyXmlImportResult;
  LINEERROR?: string | string[];
  RESULTS?: TallyXmlResultsContainer;
  RESULT?: string;
  STATICVARIABLES?: Record<string, string>;
  TC_MASTERSTATISTICSREPORT?: TallyStatisticItem | TallyStatisticItem[];
  TC_VOUCHERSTATISTICSREPORT?: TallyStatisticItem | TallyStatisticItem[];
  VCHTYPESTAT?: TallyStatisticItem | TallyStatisticItem[];
  VchTypeStat?: TallyStatisticItem | TallyStatisticItem[];
  PeriodicVoucherStatReport?: TallyXmlNodeObject;
  LicenseInfoReport?: TallyLicenseInfoReportNode;
  LastAlterIdsReport?: TallyLastAlterIdsReportNode;
  TC_ALTERIDSREPORT?: TallyXmlNodeObject;
  TC_TOTALCOUNT?: string | number;
  TOTALCOUNT?: string | number;
  TC_TotalCount?: string | number;
  [key: string]: unknown;
}

export interface TallyXmlBody {
  DESC?: TallyXmlNodeObject;
  DATA?: TallyXmlData;
  [key: string]: unknown;
}

export interface TallyXmlEnvelope {
  HEADER?: TallyXmlHeader;
  BODY?: TallyXmlBody;
  DATA?: TallyXmlData;
  RESULTS?: TallyXmlResultsContainer;
  TC_MASTERSTATISTICSREPORT?: TallyStatisticItem | TallyStatisticItem[];
  TC_MasterStatisticsReport?: TallyStatisticItem | TallyStatisticItem[];
  TC_VOUCHERSTATISTICSREPORT?: TallyStatisticItem | TallyStatisticItem[];
  TC_VoucherStatisticsReport?: TallyStatisticItem | TallyStatisticItem[];
  TC_TOTALCOUNT?: string | number;
  TOTALCOUNT?: string | number;
  [key: string]: unknown;
}

export interface TallyXmlRoot {
  ENVELOPE?: TallyXmlEnvelope;
  [key: string]: unknown;
}
