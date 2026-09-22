import { escapeXmlText, escapeTdlString } from "../xml/escaping.js";
import { formatDateForTally } from "../xml/values.js";
import { TALLY_OBJECTS, TallyObjectType, TallyObjectMap } from "../schema/registry.js";
import { tallyCodecs } from "../schema/codecs.js";
import { serializeXml } from "../xml/writer.js";
import { VOUCHER_FETCH_PROFILES } from "./profiles.js";

export interface RequestOptions {
  company?: string;
  fromDate?: Date | string;
  toDate?: Date | string;
  filters?: { name: string; formula?: string }[];
  fetchList?: string[];
  compute?: string[];
  computeVar?: string[];
  childOf?: string;
  collectionType?: string;
  belongsTo?: "Yes" | "No";
}

export interface PaginatedRequestOptions extends RequestOptions {
  pageNum?: number;
  recordsPerPage?: number;
  disableCountTag?: boolean;
}

export interface PostRequestOptions {
  company?: string;
  stopAtFirstError?: boolean;
}

export function buildExportCollectionXml(
  type: TallyObjectType | string,
  options: PaginatedRequestOptions = {}
): string {
  const collectionType = options.collectionType || (type in TALLY_OBJECTS ? TALLY_OBJECTS[type as TallyObjectType].collectionType : type);
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);

  // Auto-include sub-collections for Voucher, StockItem, and Ledger full fidelity
  let fetchList = options.fetchList;
  if (!fetchList || fetchList.length === 0) {
    const colLower = collectionType.toLowerCase();
    if (colLower === "voucher") {
      fetchList = [...VOUCHER_FETCH_PROFILES.full];
    } else if (colLower === "stockitem") {
      fetchList = [
        "MasterId", "*", "CanDelete",
        "ClosingBalance", "ClosingRate", "ClosingValue",
        "OpeningBalance", "OpeningRate", "OpeningValue",
        "GstApplicable", "GstHsnName", "GstHsnDescription", "Taxability"
      ];
    } else if (colLower === "ledger") {
      fetchList = [
        "MasterId", "*", "CanDelete",
        "ClosingBalance", "OpeningBalance",
        "Address.List", "LedMailingDetails.List", "LedGstRegDetails.List"
      ];
    } else {
      fetchList = ["MasterId", "*", "CanDelete"];
    }
  }

  const fetchTags = fetchList.map(f => `<FETCH>${escapeXmlText(f)}</FETCH>`).join("\n        ");

  const systemFilters = options.filters
    ? options.filters
        .filter((f): f is { name: string; formula: string } => !!f.formula)
        .map(f => `<SYSTEM TYPE="Formulae" NAME="${escapeXmlText(f.name)}">${escapeXmlText(f.formula)}</SYSTEM>`)
        .join("\n        ")
    : "";

  const filterTags = options.filters
    ? options.filters.map(f => `<FILTER>${escapeXmlText(f.name)}</FILTER>`).join("\n        ")
    : "";

  let paginationTags = "";
  if (options.pageNum !== undefined && options.recordsPerPage !== undefined) {
    paginationTags = `
        <COUNT>${escapeXmlText(String(options.recordsPerPage))}</COUNT>
        <START>${escapeXmlText(String((options.pageNum - 1) * options.recordsPerPage + 1))}</START>`;
  }

  const childOfTag = options.childOf ? `\n        <CHILDOF>${escapeTdlString(options.childOf)}</CHILDOF>` : "";
  const belongsToTag = options.belongsTo ? `\n        <BELONGSTO>${escapeXmlText(options.belongsTo)}</BELONGSTO>` : "";

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>TC_ExportCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${
          options.company ? `\n        <SVCURRENTCOMPANY>${escapeXmlText(options.company)}</SVCURRENTCOMPANY>` : ""
        }${fromDate ? `\n        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>` : ""}${
          toDate ? `\n        <SVTODATE TYPE="Date">${toDate}</SVTODATE>` : ""
        }
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="TC_ExportCollection">
            <TYPE>${escapeXmlText(collectionType)}</TYPE>${childOfTag}${belongsToTag}${paginationTags}
            ${fetchTags}
            ${filterTags}
          </COLLECTION>
          ${systemFilters}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildPostXml<T extends TallyObjectType>(
  type: T,
  objects: readonly TallyObjectMap[T][],
  options: PostRequestOptions = {}
): string {
  const codec = tallyCodecs[type];
  const report = TALLY_OBJECTS[type].importReport;

  const messages = objects.map(obj => {
    const xmlEl = codec.build(obj);
    const xmlStr = serializeXml(xmlEl, 8);
    return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
${xmlStr}
      </TALLYMESSAGE>`;
  }).join("\n");

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Import</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>${report}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>${
        options.company ? `\n        <SVCURRENTCOMPANY>${escapeXmlText(options.company)}</SVCURRENTCOMPANY>` : ""
      }
      </STATICVARIABLES>
    </DESC>
    <DATA>
${messages}
    </DATA>
  </BODY>
</ENVELOPE>`;
}

export function buildMasterStatisticsXml(options: RequestOptions = {}): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>TC_MasterStatisticsReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${
          options.company ? `\n        <SVCURRENTCOMPANY>${escapeXmlText(options.company)}</SVCURRENTCOMPANY>` : ""
        }
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="TC_MasterStatisticsReport">
            <FORMS>TC_MasterStatisticsForm</FORMS>
          </REPORT>
          <FORM NAME="TC_MasterStatisticsForm">
            <PARTS>TC_MasterStatisticsPart</PARTS>
          </FORM>
          <PART NAME="TC_MasterStatisticsPart">
            <LINES>TC_MasterStatisticsLine</LINES>
            <REPEAT>TC_MasterStatisticsLine : TC_MasterStatisticsCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="TC_MasterStatisticsLine">
            <FIELDS>TC_StatNameField, TC_StatCountField</FIELDS>
          </LINE>
          <FIELD NAME="TC_StatNameField">
            <SET>$Name</SET>
            <XMLTAG>STATNAME</XMLTAG>
          </FIELD>
          <FIELD NAME="TC_StatCountField">
            <SET>$TotalCount</SET>
            <XMLTAG>STATCOUNT</XMLTAG>
          </FIELD>
          <COLLECTION NAME="TC_MasterStatisticsCollection">
            <TYPE>MasterStatistics</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildVoucherStatisticsXml(options: RequestOptions = {}): string {
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>TC_VoucherStatisticsReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${
          options.company ? `\n        <SVCURRENTCOMPANY>${escapeXmlText(options.company)}</SVCURRENTCOMPANY>` : ""
        }${fromDate ? `\n        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>` : ""}${
          toDate ? `\n        <SVTODATE TYPE="Date">${toDate}</SVTODATE>` : ""
        }
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="TC_VoucherStatisticsReport">
            <FORMS>TC_VoucherStatisticsForm</FORMS>
          </REPORT>
          <FORM NAME="TC_VoucherStatisticsForm">
            <PARTS>TC_VoucherStatisticsPart</PARTS>
          </FORM>
          <PART NAME="TC_VoucherStatisticsPart">
            <LINES>TC_VoucherStatisticsLine</LINES>
            <REPEAT>TC_VoucherStatisticsLine : TC_VoucherStatisticsCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="TC_VoucherStatisticsLine">
            <FIELDS>TC_VchNameField, TC_VchCountField, TC_VchCancelledField, TC_VchOptionalField</FIELDS>
          </LINE>
          <FIELD NAME="TC_VchNameField">
            <SET>$Name</SET>
            <XMLTAG>VCHTYPENAME</XMLTAG>
          </FIELD>
          <FIELD NAME="TC_VchCountField">
            <SET>$TotalCount</SET>
            <XMLTAG>TOTALCOUNT</XMLTAG>
          </FIELD>
          <FIELD NAME="TC_VchCancelledField">
            <SET>$CancelledCount</SET>
            <XMLTAG>CANCELLEDCOUNT</XMLTAG>
          </FIELD>
          <FIELD NAME="TC_VchOptionalField">
            <SET>$OptionalCount</SET>
            <XMLTAG>OPTIONALCOUNT</XMLTAG>
          </FIELD>
          <COLLECTION NAME="TC_VoucherStatisticsCollection">
            <TYPE>VoucherType</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildCountRequestXml(
  collectionType: string,
  options: RequestOptions = {}
): string {
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);

  // Fix: filter out undefined formulas
  const systemFilters = options.filters
    ? options.filters
        .filter((f): f is { name: string; formula: string } => !!f.formula)
        .map(f => `<SYSTEM TYPE="Formulae" NAME="${escapeXmlText(f.name)}">${escapeXmlText(f.formula)}</SYSTEM>`)
        .join("\n        ")
    : "";

  const filterTags = options.filters
    ? options.filters.map(f => `<FILTER>${escapeXmlText(f.name)}</FILTER>`).join("\n        ")
    : "";

  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>TC_CountCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${
          options.company ? `\n        <SVCURRENTCOMPANY>${escapeXmlText(options.company)}</SVCURRENTCOMPANY>` : ""
        }${fromDate ? `\n        <SVFROMDATE TYPE="Date">${fromDate}</SVFROMDATE>` : ""}${
          toDate ? `\n        <SVTODATE TYPE="Date">${toDate}</SVTODATE>` : ""
        }
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="TC_CountCollection">
            <TYPE>${escapeXmlText(collectionType)}</TYPE>
            <COMPUTE>TOTALCOUNT : $$NumItems:TC_TargetCollection</COMPUTE>
          </COLLECTION>
          <COLLECTION NAME="TC_TargetCollection">
            <TYPE>${escapeXmlText(collectionType)}</TYPE>
            ${filterTags}
          </COLLECTION>
          ${systemFilters}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

export function buildPeriodicVoucherStatisticsXml(
  options: RequestOptions & { voucherType?: string } = {}
): string {
  // Correct OptionalCount typo
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>PeriodicVoucherStatReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${
          options.company ? `\n        <SVCURRENTCOMPANY>${escapeXmlText(options.company)}</SVCURRENTCOMPANY>` : ""
        }${options.voucherType ? `\n        <VOUCHERTYPENAME>${escapeXmlText(options.voucherType)}</VOUCHERTYPENAME>` : ""}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="PeriodicVoucherStatReport">
            <FORMS>PeriodicVoucherStatForm</FORMS>
          </REPORT>
          <FORM NAME="PeriodicVoucherStatForm">
            <PARTS>PeriodicVoucherStatPart</PARTS>
          </FORM>
          <PART NAME="PeriodicVoucherStatPart">
            <LINES>PeriodicVoucherStatLine</LINES>
            <REPEAT>PeriodicVoucherStatLine : PeriodStatColl</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="PeriodicVoucherStatLine">
            <FIELDS>FFromDate, FToDate, FCancelled, FOptional, FTotal</FIELDS>
          </LINE>
          <FIELD NAME="FFromDate"><SET>$FROMDATE</SET><XMLTAG>FROMDATE</XMLTAG></FIELD>
          <FIELD NAME="FToDate"><SET>$TODATE</SET><XMLTAG>TODATE</XMLTAG></FIELD>
          <FIELD NAME="FCancelled"><SET>$CANCELLEDCOUNT</SET><XMLTAG>CANCELLEDCOUNT</XMLTAG></FIELD>
          <FIELD NAME="FOptional"><SET>$OPTIONALCOUNT</SET><XMLTAG>OPTIONALCOUNT</XMLTAG></FIELD>
          <FIELD NAME="FTotal"><SET>$TOTALCOUNT</SET><XMLTAG>TOTALCOUNT</XMLTAG></FIELD>
          <COLLECTION NAME="PeriodStatColl">
            <TYPE>PeriodStat</TYPE>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}
