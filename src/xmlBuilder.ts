import {
  RequestOptions,
  PaginatedRequestOptions,
  PostRequestOptions,
  Ledger,
  Group,
  Voucher,
  CostCentre,
  CostCategory,
  VoucherType,
  Company,
  Unit,
  StockGroup,
  StockCategory,
  Godown,
  StockItem,
  Employee,
  EmployeeGroup,
  GSTDetail,
  HSNDetail,
  Currency,
  Periodicity,
  GSTRegistration,
  PeriodicVoucherStatisticsOptions
} from "./types.js";
import { DEFAULT_TDL_FUNCTIONS } from "./constants.js";
import { escapeXml, formatAmountForTally, formatBoolForTally, formatDateForTally } from "./xmlUtils.js";

export { escapeXml, formatAmountForTally, formatBoolForTally, formatDateForTally } from "./xmlUtils.js";

/**
 * Builds the XML to query Tally for a collection of objects
 */
export function buildExportCollectionXml(
  collectionType: string,
  options: PaginatedRequestOptions = {}
): string {
  const collectionName = `TC_${collectionType}Collection`;
  
  const tallyType = options.collectionType || collectionType;
  const finalFetchList = options.fetchList || ["MasterId", "*", "CanDelete"];
  
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);
  const recordsPerPage = options.recordsPerPage || 1000;
  const pageNum = options.pageNum || 1;
  const start = recordsPerPage * (pageNum - 1);
  const paginationEnabled = options.pageNum !== undefined || options.recordsPerPage !== undefined;
  const nonPaginatedCollectionName = `${collectionName}_NonPaginated`;

  // Generate TDL filters and system declarations
  const filters = [...(options.filters || [])];
  if (paginationEnabled) {
    filters.push({
      name: "TC_PaginationFilter",
      formula: `##vLineIndex <= ${start + recordsPerPage} AND ##vLineIndex > ${start}`,
    });
  }
  const filterTags = filters.map(f => `<FILTERS>${escapeXml(f.name)}</FILTERS>`).join("\n");
  const systemFilters = filters
    ? filters.map(f => `<SYSTEM TYPE="Formulae" NAME="${escapeXml(f.name)}">${escapeXml(f.formula)}</SYSTEM>`).join("\n")
    : "";
  const computeTags = [
    ...(options.compute || []),
    ...(paginationEnabled ? ["LineIndex : ##vLineIndex"] : []),
  ].map(c => `<COMPUTE>${escapeXml(c)}</COMPUTE>`).join("\n");
  const computeVarTags = [
    ...(options.computeVar || []),
    ...(paginationEnabled ? ["vLineIndex: Number : IF $$IsEmpty:##vLineIndex THEN 1 ELSE ##vLineIndex + 1"] : []),
  ].map(c => `<COMPUTEVAR>${escapeXml(c)}</COMPUTEVAR>`).join("\n");
  const childOfTag = options.childOf ? `<CHILDOF>${escapeXml(options.childOf)}</CHILDOF>` : "";
  const belongsToTag = options.belongsTo ? `<BELONGSTO>${options.belongsTo}</BELONGSTO>` : "";
  const totalCountReportTags = paginationEnabled && !options.disableCountTag ? `
          <PART NAME="TC_ObjectsCount">
            <TOPLINES>TC_ObjectsCount</TOPLINES>
          </PART>
          <LINE NAME="TC_ObjectsCount">
            <FIELDS>TC_ObjectsCount</FIELDS>
          </LINE>
          <FIELD NAME="TC_ObjectsCount">
            <XMLTAG>TC_TotalCount</XMLTAG>
            <SET>$$NUMITEMS:${nonPaginatedCollectionName}</SET>
          </FIELD>
          <COLLECTION NAME="${nonPaginatedCollectionName}" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>${escapeXml(tallyType)}</TYPE>
            ${(options.filters || []).map(f => `<FILTERS>${escapeXml(f.name)}</FILTERS>`).join("\n")}
            ${childOfTag}
            ${belongsToTag}
          </COLLECTION>` : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>${collectionName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
        ${fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : ""}
        ${toDate ? `<SVTODATE>${toDate}</SVTODATE>` : ""}
      </STATICVARIABLES>
        <TDL>
        <TDLMESSAGE>
          ${totalCountReportTags}
          <COLLECTION NAME="${collectionName}" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>${escapeXml(tallyType)}</TYPE>
            ${finalFetchList.map(field => `<NATIVEMETHOD>${escapeXml(field)}</NATIVEMETHOD>`).join("\n")}
            ${computeTags}
            ${computeVarTags}
            ${childOfTag}
            ${belongsToTag}
            ${filterTags}
          </COLLECTION>
          ${systemFilters}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Builds XML to fetch Master Statistics using a TDL Report.
 * Uses Report/Form/Part/Line/Fields with REPEAT on the native STATObjects collection.
 * This avoids the crash caused by using COMPUTE tags on native system collections.
 */
export function buildMasterStatisticsXml(options: RequestOptions = {}): string {
  const reportName = "TC_MasterStatisticsReport";
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>${reportName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
        ${fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : ""}
        ${toDate ? `<SVTODATE>${toDate}</SVTODATE>` : ""}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="${reportName}">
            <FORMS>${reportName}</FORMS>
          </REPORT>
          <FORM NAME="${reportName}">
            <TOPPARTS>${reportName}</TOPPARTS>
          </FORM>
          <PART NAME="${reportName}">
            <TOPLINES>${reportName}</TOPLINES>
            <REPEAT>${reportName} : STATObjects</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="${reportName}">
            <FIELDS>TC_MSName</FIELDS>
            <FIELDS>TC_MSCount</FIELDS>
            <XMLTAG>TC_MASTERSTATISTICSREPORT</XMLTAG>
          </LINE>
          <FIELD NAME="TC_MSName">
            <XMLTAG>NAME</XMLTAG>
            <SET>$Name</SET>
          </FIELD>
          <FIELD NAME="TC_MSCount">
            <XMLTAG>COUNT</XMLTAG>
            <SET>if $$ISEMPTY:$StatVal then 0 else $StatVal</SET>
          </FIELD>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Builds XML to fetch Voucher Statistics using a TDL Report.
 * Uses Report/Form/Part/Line/Fields with REPEAT on the native STATVchType collection.
 * This avoids the crash caused by using COMPUTE tags on native system collections.
 */
export function buildVoucherStatisticsXml(options: RequestOptions = {}): string {
  const reportName = "TC_VoucherStatisticsReport";
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>${reportName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
        ${fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : ""}
        ${toDate ? `<SVTODATE>${toDate}</SVTODATE>` : ""}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="${reportName}">
            <FORMS>${reportName}</FORMS>
          </REPORT>
          <FORM NAME="${reportName}">
            <TOPPARTS>${reportName}</TOPPARTS>
          </FORM>
          <PART NAME="${reportName}">
            <TOPLINES>${reportName}</TOPLINES>
            <REPEAT>${reportName} : STATVchType</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="${reportName}">
            <FIELDS>TC_VSName</FIELDS>
            <FIELDS>TC_VSCount</FIELDS>
            <FIELDS>TC_VSCancelledCount</FIELDS>
            <FIELDS>TC_VSTotalCount</FIELDS>
            <FIELDS>TC_VSOptionalCount</FIELDS>
            <XMLTAG>TC_VOUCHERSTATISTICSREPORT</XMLTAG>
          </LINE>
          <FIELD NAME="TC_VSName">
            <XMLTAG>NAME</XMLTAG>
            <SET>$Name</SET>
          </FIELD>
          <FIELD NAME="TC_VSCount">
            <XMLTAG>COUNT</XMLTAG>
            <SET>if $$ISEMPTY:$StatVal then 0 else $StatVal</SET>
          </FIELD>
          <FIELD NAME="TC_VSCancelledCount">
            <XMLTAG>CANCELLEDCOUNT</XMLTAG>
            <SET>if $$ISEMPTY:$CancVal then 0 else $CancVal</SET>
          </FIELD>
          <FIELD NAME="TC_VSTotalCount">
            <XMLTAG>TOTALCOUNT</XMLTAG>
            <SET>if $$ISEMPTY:$MigVal then 0 else $MigVal</SET>
          </FIELD>
          <FIELD NAME="TC_VSOptionalCount">
            <XMLTAG>OPTIONALCOUNT</XMLTAG>
            <SET>if $$ISEMPTY:$$DirectOptionalVch:$Name then 0 else $$DirectOptionalVch:$Name</SET>
          </FIELD>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}



/**
 * Builds the XML to fetch Tally's License Information
 */
export function buildLicenseInfoRequestXml(): string {
  const collectionName = "TC_LicenseInfoCollection";
  const objectName = "TC_LicenseInfoObject";

  const formulas = [
    "SERIALNUMBER:$$LicenseInfo:SerialNumber",
    "REMOTESERIALNUMBER:$$LicenseInfo:RemoteSerialNumber",
    "ACCOUNTID:$$LicenseInfo:AccountID",
    "ADMINMAILID:$$LicenseInfo:AdminEmailID",
    "ISADMIN:$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsAdmin",
    "ISEDUCATIONALMODE:$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsEducationalMode",
    "ISSILVER:$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsAdmin",
    "ISGOLD:$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsAdmin",
    "PLANNAME:If $$LicenseInfo:IsEducationalMode Then \"Educational Version\" ELSE If $$LicenseInfo:IsSilver Then \"Silver\" ELSE If $$LicenseInfo:IsGold Then \"Gold\" else \"\"",
    "ISINDIAN:$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsIndian",
    "ISREMOTEACCESSMODE:$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsRemoteAccessMode",
    "ISLICCLIENTMODE:$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsLicClientMode",
    "APPLICATIONPATH:$$SysInfo:ApplicationPath",
    "DATAPATH:##SVCurrentPath",
    "USERLEVEL:$$cmpuserlevel",
    "USERNAME:$$cmpusername",
    "TALLYVERSION:if @@CapProductDetails contains \"Tally.ERP 9\" then $$SPrintf:@@CapProductDetails:@@VersionGetProductSeries:@@VersionReleaseString:@@VersionBuildString:@@ProductBitnessStr:($$String:@@MajorReleaseeFormula):($$String:@@MinorReleaseFormula):\"0\":@@CapBuildNumberFormula else $$SPrintf:@@CapProductDetails:@@VersionReleaseString:@@VersionBuildString:@@ProductBitnessStr:($$String:@@MajorReleaseeFormula):($$String:@@MinorReleaseFormula):\"0\":@@CapBuildNumberFormula",
    "TALLYSHORTVERSION:@@VersionReleaseString",
    "IsTallyPrime:$$TC_GetBooleanFromLogicField:$$IsProdTallyPrime",
  ];

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>COLLECTION</TYPE>
    <ID>${collectionName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="${collectionName}" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <OBJECTS>${objectName}</OBJECTS>
          </COLLECTION>
          <OBJECT NAME="${objectName}" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            ${formulas.map(f => `<LOCALFORMULA>${escapeXml(f)}</LOCALFORMULA>`).join("\n")}
          </OBJECT>
          ${DEFAULT_TDL_FUNCTIONS.map(f => `
          <FUNCTION NAME="${f.name}">
            ${f.parameters.map(p => `<Parameter>${escapeXml(p)}</Parameter>`).join("")}
            ${f.variables ? f.variables.map(v => `<VARIABLES>${escapeXml(v)}</VARIABLES>`).join("") : ""}
            <Returns>${f.returns}</Returns>
            ${f.actions.map(a => `<Action>${escapeXml(a)}</Action>`).join("")}
          </FUNCTION>`).join("\n")}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Builds XML to get current active company
 */
export function buildActiveCompanyRequestXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>FUNCTION</TYPE>
    <ID>$$CurrentSimpleCompany</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Builds XML to retrieve Last Alter IDs (for synchronization)
 */
export function buildLastAlterIdsRequestXml(options: RequestOptions = {}): string {
  const reportName = "TC_AlterIdsReport";
  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>${reportName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="${reportName}">
            <FORMS>${reportName}</FORMS>
          </REPORT>
          <FORM NAME="${reportName}">
            <TOPPARTS>${reportName}</TOPPARTS>
          </FORM>
          <PART NAME="${reportName}">
            <TOPLINES>${reportName}</TOPLINES>
            <REPEAT>${reportName} : TC_CompanyCollection</REPEAT>
          </PART>
          <LINE NAME="${reportName}">
            <FIELDS>TC_MastersLastId</FIELDS>
            <FIELDS>TC_VouchersLastId</FIELDS>
          </LINE>
          <FIELD NAME="TC_MastersLastId">
            <XMLTAG>MastersLastId</XMLTAG>
            <SET>if $$IsEmpty:$ALTMSTID THEN 0 else $ALTMSTID</SET>
          </FIELD>
          <FIELD NAME="TC_VouchersLastId">
            <XMLTAG>VouchersLastId</XMLTAG>
            <SET>if $$IsEmpty:$ALTVCHID THEN 0 else $ALTVCHID</SET>
          </FIELD>
          <COLLECTION NAME="TC_CompanyCollection">
            <TYPE>Company</TYPE>
            <NATIVEMETHOD>ALTMSTID,ALTVCHID</NATIVEMETHOD>
            <FILTERS>TC_CurCompFilter</FILTERS>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="TC_CurCompFilter">$Name=##SVCURRENTCOMPANY</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Maps standard JS models into raw Tally XML entries for import
 */
function ledgerToXml(ledger: Ledger): string {
  const action = ledger.masterId ? "Alter" : "Create";

  let languageListXml = "";
  if (ledger.languageNameList && ledger.languageNameList.length > 0) {
    languageListXml = ledger.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(ledger.name)}</NAME>
        ${ledger.alias ? `<NAME>${escapeXml(ledger.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }

  const paymentDetailsXml = ledger.paymentDetails
    ? ledger.paymentDetails.map(pay => `
    <PAYMENTDETAILS.LIST>
      <BANKNAME>${escapeXml(pay.bankName)}</BANKNAME>
      ${pay.city ? `<CITY>${escapeXml(pay.city)}</CITY>` : ""}
      ${pay.defaultTransactionType ? `<DEFAULTTRANSACTIONTYPE>${escapeXml(pay.defaultTransactionType)}</DEFAULTTRANSACTIONTYPE>` : ""}
      ${pay.inFavour ? `<PAYMENTFAVOURING>${escapeXml(pay.inFavour)}</PAYMENTFAVOURING>` : ""}
      ${pay.transactionName ? `<TRANSACTIONNAME>${escapeXml(pay.transactionName)}</TRANSACTIONNAME>` : ""}
      ${pay.chequeCrossComment ? `<CHEQUECROSSCOMMENT>${escapeXml(pay.chequeCrossComment)}</CHEQUECROSSCOMMENT>` : ""}
      <SETASDEFAULT>${formatBoolForTally(pay.setAsDefault)}</SETASDEFAULT>
      ${pay.bankAccountNo ? `<ACCOUNTNUMBER>${escapeXml(pay.bankAccountNo)}</ACCOUNTNUMBER>` : ""}
      ${pay.bankBranch ? `<BANKBRANCH>${escapeXml(pay.bankBranch)}</BANKBRANCH>` : ""}
      ${pay.ifsc ? `<IFSCODE>${escapeXml(pay.ifsc)}</IFSCODE>` : ""}
    </PAYMENTDETAILS.LIST>`).join("")
    : "";

  const mailingDetailsXml = ledger.mailingDetails
    ? ledger.mailingDetails.map(mail => `
    <LEDMAILINGDETAILS.LIST>
      ${mail.addressLines && mail.addressLines.length > 0 ? `
      <ADDRESS.LIST TYPE="String">
        ${mail.addressLines.map(line => `<ADDRESS>${escapeXml(line)}</ADDRESS>`).join("")}
      </ADDRESS.LIST>` : ""}
      ${mail.applicableFrom ? `<APPLICABLEFROM>${formatDateForTally(mail.applicableFrom)}</APPLICABLEFROM>` : ""}
      <MAILINGNAME>${escapeXml(mail.mailingName || ledger.name)}</MAILINGNAME>
      ${mail.country ? `<COUNTRY>${escapeXml(mail.country)}</COUNTRY>` : ""}
      ${mail.state ? `<STATE>${escapeXml(mail.state)}</STATE>` : ""}
      ${mail.pinCode ? `<PINCODE>${escapeXml(mail.pinCode)}</PINCODE>` : ""}
    </LEDMAILINGDETAILS.LIST>`).join("")
    : "";

  const gstRegDetailsXml = ledger.gstRegistrationDetails
    ? ledger.gstRegistrationDetails.map(reg => `
    <LEDGSTREGDETAILS.LIST>
      ${reg.applicableFrom ? `<APPLICABLEFROM>${formatDateForTally(reg.applicableFrom)}</APPLICABLEFROM>` : ""}
      ${reg.gstRegistrationType ? `<GSTREGISTRATIONTYPE>${escapeXml(reg.gstRegistrationType)}</GSTREGISTRATIONTYPE>` : ""}
      ${reg.state ? `<STATE>${escapeXml(reg.state)}</STATE>` : ""}
      ${reg.placeOfSupply ? `<PLACEOFSUPPLY>${escapeXml(reg.placeOfSupply)}</PLACEOFSUPPLY>` : ""}
      ${reg.isOtherTerritoryAssessee !== undefined ? `<ISOTHTERRITORYASSESSEE>${formatBoolForTally(reg.isOtherTerritoryAssessee)}</ISOTHTERRITORYASSESSEE>` : ""}
      <CONSIDERPURCHASEFOREXPORT>${formatBoolForTally(reg.considerPurchaseForExport)}</CONSIDERPURCHASEFOREXPORT>
      <ISTRANSPORTER>${formatBoolForTally(reg.isTransporter)}</ISTRANSPORTER>
      ${reg.transporterId ? `<TRANSPORTERID>${escapeXml(reg.transporterId)}</TRANSPORTERID>` : ""}
      ${reg.isCommonParty !== undefined ? `<ISCOMMONPARTY>${formatBoolForTally(reg.isCommonParty)}</ISCOMMONPARTY>` : ""}
      ${reg.gstin ? `<GSTIN>${escapeXml(reg.gstin)}</GSTIN>` : ""}
    </LEDGSTREGDETAILS.LIST>`).join("")
    : "";

  const gstDetailsXml = ledger.gstDetails
    ? ledger.gstDetails.map(gst => `
    <GSTDETAILS.LIST>
      ${gst.applicableFrom ? `<APPLICABLEFROM>${formatDateForTally(gst.applicableFrom)}</APPLICABLEFROM>` : ""}
      ${gst.calculationType ? `<CALCULATIONTYPE>${escapeXml(gst.calculationType)}</CALCULATIONTYPE>` : ""}
      <GSTCALCSLABONMRP>${formatBoolForTally(gst.calculateSlabOnMRP)}</GSTCALCSLABONMRP>
      ${gst.natureOfTransaction ? `<GSTNATUREOFTRANSACTION>${escapeXml(gst.natureOfTransaction)}</GSTNATUREOFTRANSACTION>` : ""}
      ${gst.isNonGSTGoods !== undefined ? `<ISNONGSTGOODS>${formatBoolForTally(gst.isNonGSTGoods)}</ISNONGSTGOODS>` : ""}
      ${gst.taxability ? `<TAXABILITY>${escapeXml(gst.taxability)}</TAXABILITY>` : ""}
      ${gst.sourceOfGSTDetails ? `<SRCOFGSTDETAILS>${escapeXml(gst.sourceOfGSTDetails)}</SRCOFGSTDETAILS>` : ""}
      ${gst.isReverseChargeApplicable !== undefined ? `<ISREVERSECHARGEAPPLICABLE>${formatBoolForTally(gst.isReverseChargeApplicable)}</ISREVERSECHARGEAPPLICABLE>` : ""}
      <GSTINELIGIBLEITC>${formatBoolForTally(gst.isInEligibleForITC)}</GSTINELIGIBLEITC>
      ${gst.includeExpForSlabCalc !== undefined ? `<INCLUDEEXPFORSLABCALC>${formatBoolForTally(gst.includeExpForSlabCalc)}</INCLUDEEXPFORSLABCALC>` : ""}
      ${gst.stateWiseDetails ? gst.stateWiseDetails.map(sw => `
      <STATEWISEDETAILS.LIST>
        ${sw.stateName ? `<STATENAME>${escapeXml(sw.stateName)}</STATENAME>` : ""}
        ${sw.rateDetails ? sw.rateDetails.map(rd => `
        <RATEDETAILS.LIST>
          ${rd.dutyHead ? `<GSTRATEDUTYHEAD>${escapeXml(rd.dutyHead)}</GSTRATEDUTYHEAD>` : ""}
          ${rd.valuationType ? `<GSTRATEVALUATIONTYPE>${escapeXml(rd.valuationType)}</GSTRATEVALUATIONTYPE>` : ""}
          <GSTRATE>${rd.gstRate}</GSTRATE>
        </RATEDETAILS.LIST>`).join("") : ""}
      </STATEWISEDETAILS.LIST>`).join("") : ""}
    </GSTDETAILS.LIST>`).join("")
    : "";

  const hsnDetailsXml = ledger.hsnDetails
    ? ledger.hsnDetails.map(hsn => `
    <HSNDETAILS.LIST>
      ${hsn.applicableFrom ? `<APPLICABLEFROM>${formatDateForTally(hsn.applicableFrom)}</APPLICABLEFROM>` : ""}
      ${hsn.hsnDescription ? `<HSN>${escapeXml(hsn.hsnDescription)}</HSN>` : ""}
      ${hsn.hsnCode ? `<HSNCODE>${escapeXml(hsn.hsnCode)}</HSNCODE>` : ""}
      ${hsn.hsnClassificationName ? `<HSNCLASSIFICATIONNAME>${escapeXml(hsn.hsnClassificationName)}</HSNCLASSIFICATIONNAME>` : ""}
      ${hsn.source ? `<SRCOFHSNDETAILS>${escapeXml(hsn.source)}</SRCOFHSNDETAILS>` : ""}
    </HSNDETAILS.LIST>`).join("")
    : "";

  const addressesXml = ledger.addresses
    ? ledger.addresses.map(addr => `
    <LEDMULTIADDRESSLIST.LIST>
      <MAILINGNAME>${escapeXml(addr.addressName)}</MAILINGNAME>
      ${addr.addressLines && addr.addressLines.length > 0 ? `
      <ADDRESS.LIST TYPE="String">
        ${addr.addressLines.map(line => `<ADDRESS>${escapeXml(line)}</ADDRESS>`).join("")}
      </ADDRESS.LIST>` : ""}
      ${addr.country ? `<COUNTRYNAME>${escapeXml(addr.country)}</COUNTRYNAME>` : ""}
      ${addr.state ? `<LEDSTATENAME>${escapeXml(addr.state)}</LEDSTATENAME>` : ""}
      ${addr.pinCode ? `<PINCODE>${escapeXml(addr.pinCode)}</PINCODE>` : ""}
      ${addr.contactPerson ? `<CONTACTPERSON>${escapeXml(addr.contactPerson)}</CONTACTPERSON>` : ""}
      ${addr.mobileNo ? `<MOBILENUMBER>${escapeXml(addr.mobileNo)}</MOBILENUMBER>` : ""}
      ${addr.phoneNumber ? `<PHONENUMBER>${escapeXml(addr.phoneNumber)}</PHONENUMBER>` : ""}
      ${addr.faxNumber ? `<FAXNUMBER>${escapeXml(addr.faxNumber)}</FAXNUMBER>` : ""}
      ${addr.email ? `<EMAIL>${escapeXml(addr.email)}</EMAIL>` : ""}
      ${addr.panNumber ? `<INCOMETAXNUMBER>${escapeXml(addr.panNumber)}</INCOMETAXNUMBER>` : ""}
      ${addr.vatNumber ? `<VATTINNUMBER>${escapeXml(addr.vatNumber)}</VATTINNUMBER>` : ""}
      ${addr.cstNumber ? `<INTERSTATESTNUMBER>${escapeXml(addr.cstNumber)}</INTERSTATESTNUMBER>` : ""}
      ${addr.exciseNatureOfPurchase ? `<EXCISENATUREOFPURCHASE>${escapeXml(addr.exciseNatureOfPurchase)}</EXCISENATUREOFPURCHASE>` : ""}
      ${addr.exciseRegistrationNo ? `<EXCISEREGNO>${escapeXml(addr.exciseRegistrationNo)}</EXCISEREGNO>` : ""}
      ${addr.exciseImportRegistrationNo ? `<EXCISEIMPORTSREGISTARTIONNO>${escapeXml(addr.exciseImportRegistrationNo)}</EXCISEIMPORTSREGISTARTIONNO>` : ""}
      ${addr.importExportCode ? `<IMPORTEREXPORTERCODE>${escapeXml(addr.importExportCode)}</IMPORTEREXPORTERCODE>` : ""}
      ${addr.gstDealerType ? `<GSTREGISTRATIONTYPE>${escapeXml(addr.gstDealerType)}</GSTREGISTRATIONTYPE>` : ""}
      ${addr.isOtherTerritoryAssessee !== undefined ? `<ISOTHTERRITORYASSESSEE>${formatBoolForTally(addr.isOtherTerritoryAssessee)}</ISOTHTERRITORYASSESSEE>` : ""}
      ${addr.gstin ? `<PARTYGSTIN>${escapeXml(addr.gstin)}</PARTYGSTIN>` : ""}
      ${addr.exciseJurisdictions ? addr.exciseJurisdictions.map(ex => `
      <EXCISEJURISDICTIONDETAILS.LIST>
        ${ex.applicableFrom ? `<APPLICABLEFROM>${formatDateForTally(ex.applicableFrom)}</APPLICABLEFROM>` : ""}
        ${ex.range ? `<RANGE>${escapeXml(ex.range)}</RANGE>` : ""}
        ${ex.division ? `<DIVISION>${escapeXml(ex.division)}</DIVISION>` : ""}
        ${ex.commissionerate ? `<COMMISSIONERATE>${escapeXml(ex.commissionerate)}</COMMISSIONERATE>` : ""}
      </EXCISEJURISDICTIONDETAILS.LIST>`).join("") : ""}
    </LEDMULTIADDRESSLIST.LIST>`).join("")
    : "";

  return `
  <LEDGER NAME="${escapeXml(ledger.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(ledger.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    <PARENT>${escapeXml(ledger.group)}</PARENT>
    ${ledger.openingBalance !== undefined ? `<OPENINGBALANCE>${formatAmountForTally(ledger.openingBalance)}</OPENINGBALANCE>` : ""}
    ${ledger.currency ? `<CURRENCY>${escapeXml(ledger.currency)}</CURRENCY>` : ""}
    ${ledger.taxType ? `<TAXTYPE>${escapeXml(ledger.taxType)}</TAXTYPE>` : ""}
    ${ledger.gstTaxType ? `<GSTTYPE>${escapeXml(ledger.gstTaxType)}</GSTTYPE>` : ""}
    ${ledger.rateOfTax !== undefined ? `<RATEOFTAXCALCULATION>${ledger.rateOfTax}</RATEOFTAXCALCULATION>` : ""}
    ${ledger.appropriateFor ? `<APPROPRIATEFOR>${escapeXml(ledger.appropriateFor)}</APPROPRIATEFOR>` : ""}
    ${ledger.isBillWise !== undefined ? `<ISBILLWISEON>${formatBoolForTally(ledger.isBillWise)}</ISBILLWISEON>` : ""}
    ${ledger.isCostCentresOn !== undefined ? `<ISCOSTCENTRESON>${formatBoolForTally(ledger.isCostCentresOn)}</ISCOSTCENTRESON>` : ""}
    ${ledger.isInterestOn !== undefined ? `<ISINTERESTON>${formatBoolForTally(ledger.isInterestOn)}</ISINTERESTON>` : ""}
    ${ledger.isCreditCheck !== undefined ? `<ISCREDITDAYSCHKON>${formatBoolForTally(ledger.isCreditCheck)}</ISCREDITDAYSCHKON>` : ""}
    ${ledger.creditLimit ? `<CREDITLIMIT>${escapeXml(ledger.creditLimit)}</CREDITLIMIT>` : ""}
    ${ledger.email ? `<EMAIL>${escapeXml(ledger.email)}</EMAIL>` : ""}
    ${ledger.emailCc ? `<EMAILCC>${escapeXml(ledger.emailCc)}</EMAILCC>` : ""}
    ${ledger.website ? `<WEBSITE>${escapeXml(ledger.website)}</WEBSITE>` : ""}
    ${ledger.panNumber ? `<INCOMETAXNUMBER>${escapeXml(ledger.panNumber)}</INCOMETAXNUMBER>` : ""}
    ${ledger.gstTypeOfSupply ? `<GSTTYPEOFSUPPLY>${escapeXml(ledger.gstTypeOfSupply)}</GSTTYPEOFSUPPLY>` : ""}
    ${ledger.bankName ? `<BANKINGCONFIGBANK>${escapeXml(ledger.bankName)}</BANKINGCONFIGBANK>` : ""}
    ${ledger.accountNumber ? `<BANKDETAILS>${escapeXml(ledger.accountNumber)}</BANKDETAILS>` : ""}
    ${ledger.bankBsrCode ? `<BANKBSRCODE>${escapeXml(ledger.bankBsrCode)}</BANKBSRCODE>` : ""}
    ${ledger.branchName ? `<BRANCHNAME>${escapeXml(ledger.branchName)}</BRANCHNAME>` : ""}
    ${ledger.ifsCode ? `<IFSCODE>${escapeXml(ledger.ifsCode)}</IFSCODE>` : ""}
    ${ledger.swiftCode ? `<SWIFTCODE>${escapeXml(ledger.swiftCode)}</SWIFTCODE>` : ""}
    ${paymentDetailsXml}
    ${mailingDetailsXml}
    ${gstRegDetailsXml}
    ${gstDetailsXml}
    ${hsnDetailsXml}
    ${addressesXml}
  </LEDGER>`;
}

function groupToXml(group: Group): string {
  const action = group.masterId ? "Alter" : "Create";

  let languageListXml = "";
  if (group.languageNameList && group.languageNameList.length > 0) {
    languageListXml = group.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(group.name)}</NAME>
        ${group.alias ? `<NAME>${escapeXml(group.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }

  return `
  <GROUP NAME="${escapeXml(group.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(group.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    <PARENT>${escapeXml(group.parent)}</PARENT>
    ${group.isRevenue !== undefined ? `<ISREVENUE>${formatBoolForTally(group.isRevenue)}</ISREVENUE>` : ""}
    ${group.isDeemedPositive !== undefined ? `<ISDEEMEDPOSITIVE>${formatBoolForTally(group.isDeemedPositive)}</ISDEEMEDPOSITIVE>` : ""}
    ${group.affectGrossProfit !== undefined ? `<AFFECTSGROSSPROFIT>${formatBoolForTally(group.affectGrossProfit)}</AFFECTSGROSSPROFIT>` : ""}
    ${group.isSubledger !== undefined ? `<ISSUBLEDGER>${formatBoolForTally(group.isSubledger)}</ISSUBLEDGER>` : ""}
    ${group.sortPosition !== undefined ? `<SORTPOSITION>${group.sortPosition}</SORTPOSITION>` : ""}
    ${group.addlAllocType ? `<ADDLALLOCTYPE>${escapeXml(group.addlAllocType)}</ADDLALLOCTYPE>` : ""}
    ${group.isCalculable !== undefined ? `<BASICGROUPISCALCULABLE>${formatBoolForTally(group.isCalculable)}</BASICGROUPISCALCULABLE>` : ""}
    ${group.isAddable !== undefined ? `<ISADDABLE>${formatBoolForTally(group.isAddable)}</ISADDABLE>` : ""}
  </GROUP>`;
}

function costCentreToXml(cc: CostCentre): string {
  const action = cc.masterId ? "Alter" : "Create";

  let languageListXml = "";
  if (cc.languageNameList && cc.languageNameList.length > 0) {
    languageListXml = cc.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(cc.name)}</NAME>
        ${cc.alias ? `<NAME>${escapeXml(cc.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }

  return `
  <COSTCENTRE NAME="${escapeXml(cc.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(cc.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    ${cc.category ? `<CATEGORY>${escapeXml(cc.category)}</CATEGORY>` : ""}
    ${cc.parent ? `<PARENT>${escapeXml(cc.parent)}</PARENT>` : ""}
    ${cc.emailId ? `<EMAILID>${escapeXml(cc.emailId)}</EMAILID>` : ""}
    ${cc.showOpeningBal !== undefined ? `<REVENUELEDFOROPBAL>${formatBoolForTally(cc.showOpeningBal)}</REVENUELEDFOROPBAL>` : ""}
  </COSTCENTRE>`;
}

function costCategoryToXml(cat: CostCategory): string {
  const action = cat.masterId ? "Alter" : "Create";

  let languageListXml = "";
  if (cat.languageNameList && cat.languageNameList.length > 0) {
    languageListXml = cat.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(cat.name)}</NAME>
        ${cat.alias ? `<NAME>${escapeXml(cat.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }

  return `
  <COSTCATEGORY NAME="${escapeXml(cat.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(cat.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    ${cat.allocateRevenue !== undefined ? `<ALLOCATEREVENUE>${formatBoolForTally(cat.allocateRevenue)}</ALLOCATEREVENUE>` : ""}
    ${cat.allocateNonRevenue !== undefined ? `<ALLOCATENONREVENUE>${formatBoolForTally(cat.allocateNonRevenue)}</ALLOCATENONREVENUE>` : ""}
  </COSTCATEGORY>`;
}

function voucherTypeToXml(vt: VoucherType): string {
  const action = vt.masterId ? "Alter" : "Create";

  let languageListXml = "";
  if (vt.languageNameList && vt.languageNameList.length > 0) {
    languageListXml = vt.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(vt.name)}</NAME>
        ${vt.alias ? `<NAME>${escapeXml(vt.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }

  const voucherClassesXml = vt.voucherClasses
    ? vt.voucherClasses.map(vc => `
    <VOUCHERCLASSLIST.LIST>
      <CLASSNAME>${escapeXml(vc.className)}</CLASSNAME>
      ${vc.posCardLedger ? `<POSCARDLEDGER>${escapeXml(vc.posCardLedger)}</POSCARDLEDGER>` : ""}
      ${vc.posCashLedger ? `<POSCASHLEDGER>${escapeXml(vc.posCashLedger)}</POSCASHLEDGER>` : ""}
      ${vc.posGiftLedger ? `<POSGIFTLEDGER>${escapeXml(vc.posGiftLedger)}</POSGIFTLEDGER>` : ""}
      ${vc.posChequeLedger ? `<POSCHEQUELEDGER>${escapeXml(vc.posChequeLedger)}</POSCHEQUELEDGER>` : ""}
      ${vc.forJobCosting !== undefined ? `<FORJOBCOSTING>${formatBoolForTally(vc.forJobCosting)}</FORJOBCOSTING>` : ""}
      ${vc.useforInterest !== undefined ? `<USEFORINTEREST>${formatBoolForTally(vc.useforInterest)}</USEFORINTEREST>` : ""}
      ${vc.useforGainLoss !== undefined ? `<USEFORGAINLOSS>${formatBoolForTally(vc.useforGainLoss)}</USEFORGAINLOSS>` : ""}
      ${vc.useforGodownTransfer !== undefined ? `<USEFORGODOWNTRANSFER>${formatBoolForTally(vc.useforGodownTransfer)}</USEFORGODOWNTRANSFER>` : ""}
      ${vc.useforCompound !== undefined ? `<USEFORCOMPOUND>${formatBoolForTally(vc.useforCompound)}</USEFORCOMPOUND>` : ""}
      ${vc.classforVAT !== undefined ? `<CLASSFORVAT>${formatBoolForTally(vc.classforVAT)}</CLASSFORVAT>` : ""}
      ${vc.useforFBT !== undefined ? `<USEFORFBT>${formatBoolForTally(vc.useforFBT)}</USEFORFBT>` : ""}
      ${vc.posEnableCardLedger !== undefined ? `<POSENABLECARDLEDGER>${formatBoolForTally(vc.posEnableCardLedger)}</POSENABLECARDLEDGER>` : ""}
      ${vc.posEnableCashLedger !== undefined ? `<POSENABLECASHLEDGER>${formatBoolForTally(vc.posEnableCashLedger)}</POSENABLECASHLEDGER>` : ""}
      ${vc.posEnableGiftLedger !== undefined ? `<POSENABLEGIFTLEDGER>${formatBoolForTally(vc.posEnableGiftLedger)}</POSENABLEGIFTLEDGER>` : ""}
      ${vc.posEnableChequeLedger !== undefined ? `<POSENABLECHEQUELEDGER>${formatBoolForTally(vc.posEnableChequeLedger)}</POSENABLECHEQUELEDGER>` : ""}
      ${vc.useforExciseCommercialInvoice !== undefined ? `<USEFOREXCISECOMMERCIALINVOICE>${formatBoolForTally(vc.useforExciseCommercialInvoice)}</USEFOREXCISECOMMERCIALINVOICE>` : ""}
      ${vc.useforServiceTax !== undefined ? `<USEFORSERVICETAX>${formatBoolForTally(vc.useforServiceTax)}</USEFORSERVICETAX>` : ""}
      ${vc.classforExcise !== undefined ? `<CLASSFOREXCISE>${formatBoolForTally(vc.classforExcise)}</CLASSFOREXCISE>` : ""}
      ${vc.classforDealerExciseShortage !== undefined ? `<CLASSFORDEALEREXCISESHORTAGE>${formatBoolForTally(vc.classforDealerExciseShortage)}</CLASSFORDEALEREXCISESHORTAGE>` : ""}
      ${vc.posEnableOnAccountLedger !== undefined ? `<POSENABLEONACCOUNTLEDGER>${formatBoolForTally(vc.posEnableOnAccountLedger)}</POSENABLEONACCOUNTLEDGER>` : ""}
      ${vc.useBankAllocforcc !== undefined ? `<USEBANKALLOCFORCC>${formatBoolForTally(vc.useBankAllocforcc)}</USEBANKALLOCFORCC>` : ""}
      ${vc.isDefaultClass !== undefined ? `<ISDEFAULTCLASS>${formatBoolForTally(vc.isDefaultClass)}</ISDEFAULTCLASS>` : ""}
      ${vc.adjDiffinFirstLedger !== undefined ? `<ADJDIFFINFIRSTLEDGER>${formatBoolForTally(vc.adjDiffinFirstLedger)}</ADJDIFFINFIRSTLEDGER>` : ""}
      ${vc.adjDiffinFirstLedgerItem !== undefined ? `<ADJDIFFINFIRSTLEDGERITEM>${formatBoolForTally(vc.adjDiffinFirstLedgerItem)}</ADJDIFFINFIRSTLEDGERITEM>` : ""}
      ${vc.ledgersforInventory ? vc.ledgersforInventory.map(l => `
      <LEDGERFORINVENTORYLIST.LIST>
        <NAME>${escapeXml(l.name)}</NAME>
        ${l.roundType ? `<ROUNDTYPE>${escapeXml(l.roundType)}</ROUNDTYPE>` : ""}
        ${l.gstClassificationNature ? `<GSTCLASSIFICATIONNATURE>${escapeXml(l.gstClassificationNature)}</GSTCLASSIFICATIONNATURE>` : ""}
        ${l.methodType ? `<METHODTYPE>${escapeXml(l.methodType)}</METHODTYPE>` : ""}
        ${l.classRate ? `<CLASSRATE>${escapeXml(l.classRate)}</CLASSRATE>` : ""}
        <LEDGERFROMITEM>${formatBoolForTally(l.ledgerFromItem)}</LEDGERFROMITEM>
        <REMOVEZEROENTRIES>${formatBoolForTally(l.removeZeroEntries)}</REMOVEZEROENTRIES>
        ${l.roundLimit !== undefined ? `<ROUNDLIMIT>${l.roundLimit}</ROUNDLIMIT>` : ""}
      </LEDGERFORINVENTORYLIST.LIST>`).join("") : ""}
      ${vc.ledgerEntries ? vc.ledgerEntries.map(l => `
      <LEDGERENTRIESLIST.LIST>
        <NAME>${escapeXml(l.name)}</NAME>
        ${l.roundType ? `<ROUNDTYPE>${escapeXml(l.roundType)}</ROUNDTYPE>` : ""}
        ${l.gstClassificationNature ? `<GSTCLASSIFICATIONNATURE>${escapeXml(l.gstClassificationNature)}</GSTCLASSIFICATIONNATURE>` : ""}
        ${l.methodType ? `<METHODTYPE>${escapeXml(l.methodType)}</METHODTYPE>` : ""}
        ${l.classRate ? `<CLASSRATE>${escapeXml(l.classRate)}</CLASSRATE>` : ""}
        <LEDGERFROMITEM>${formatBoolForTally(l.ledgerFromItem)}</LEDGERFROMITEM>
        <REMOVEZEROENTRIES>${formatBoolForTally(l.removeZeroEntries)}</REMOVEZEROENTRIES>
        ${l.roundLimit !== undefined ? `<ROUNDLIMIT>${l.roundLimit}</ROUNDLIMIT>` : ""}
      </LEDGERENTRIESLIST.LIST>`).join("") : ""}
      ${vc.stockEntries ? vc.stockEntries.map(se => `
      <DEFAULTACCALLOCFORITEM.LIST>
        <STOCKITEMNAME>${escapeXml(se.stockItemName)}</STOCKITEMNAME>
        <LEDGERFROMITEM>${formatBoolForTally(se.ledgerFromItem)}</LEDGERFROMITEM>
        ${se.ledgerEntries ? se.ledgerEntries.map(l => `
        <DEFAULTACCALLOCFORITEM.LIST>
          <NAME>${escapeXml(l.name)}</NAME>
          ${l.roundType ? `<ROUNDTYPE>${escapeXml(l.roundType)}</ROUNDTYPE>` : ""}
          ${l.gstClassificationNature ? `<GSTCLASSIFICATIONNATURE>${escapeXml(l.gstClassificationNature)}</GSTCLASSIFICATIONNATURE>` : ""}
          ${l.methodType ? `<METHODTYPE>${escapeXml(l.methodType)}</METHODTYPE>` : ""}
          ${l.classRate ? `<CLASSRATE>${escapeXml(l.classRate)}</CLASSRATE>` : ""}
          <LEDGERFROMITEM>${formatBoolForTally(l.ledgerFromItem)}</LEDGERFROMITEM>
          <REMOVEZEROENTRIES>${formatBoolForTally(l.removeZeroEntries)}</REMOVEZEROENTRIES>
          ${l.roundLimit !== undefined ? `<ROUNDLIMIT>${l.roundLimit}</ROUNDLIMIT>` : ""}
        </DEFAULTACCALLOCFORITEM.LIST>`).join("") : ""}
      </DEFAULTACCALLOCFORITEM.LIST>`).join("") : ""}
    </VOUCHERCLASSLIST.LIST>`).join("")
    : "";

  return `
  <VOUCHERTYPE NAME="${escapeXml(vt.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(vt.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    <PARENT>${escapeXml(vt.parent)}</PARENT>
    ${vt.numberingMethod ? `<NUMBERINGMETHOD>${escapeXml(vt.numberingMethod)}</NUMBERINGMETHOD>` : ""}
    ${vt.useZeroEntries !== undefined ? `<USEZEROENTRIES>${formatBoolForTally(vt.useZeroEntries)}</USEZEROENTRIES>` : ""}
    ${vt.isActive !== undefined ? `<ISACTIVE>${formatBoolForTally(vt.isActive)}</ISACTIVE>` : ""}
    ${vt.printAfterSave !== undefined ? `<PRINTAFTERSAVE>${formatBoolForTally(vt.printAfterSave)}</PRINTAFTERSAVE>` : ""}
    ${vt.useforPOSInvoice !== undefined ? `<USEFORPOSINVOICE>${formatBoolForTally(vt.useforPOSInvoice)}</USEFORPOSINVOICE>` : ""}
    ${vt.vchPrintBankName ? `<VCHPRINTBANKNAME>${escapeXml(vt.vchPrintBankName)}</VCHPRINTBANKNAME>` : ""}
    ${vt.vchPrintTitle ? `<VCHPRINTTITLE>${escapeXml(vt.vchPrintTitle)}</VCHPRINTTitle>` : ""}
    ${vt.taxUnitName ? `<TAXUNITNAME>${escapeXml(vt.taxUnitName)}</TAXUNITNAME>` : ""}
    ${vt.vchPrintJurisdiction ? `<VCHPRINTJURISDICTION>${escapeXml(vt.vchPrintJurisdiction)}</VCHPRINTJURISDICTION>` : ""}
    ${vt.isOptional !== undefined ? `<ISOPTIONAL>${formatBoolForTally(vt.isOptional)}</ISOPTIONAL>` : ""}
    ${vt.commonNarration !== undefined ? `<COMMONNARRATION>${formatBoolForTally(vt.commonNarration)}</COMMONNARRATION>` : ""}
    ${vt.multiNarration !== undefined ? `<MULTINARRATION>${formatBoolForTally(vt.multiNarration)}</MULTINARRATION>` : ""}
    ${vt.isDefaultAllocationEnabled !== undefined ? `<ISDEFAULTALLOCENABLED>${formatBoolForTally(vt.isDefaultAllocationEnabled)}</ISDEFAULTALLOCENABLED>` : ""}
    ${vt.effectStock !== undefined ? `<AFFECTSSTOCK>${formatBoolForTally(vt.effectStock)}</AFFECTSSTOCK>` : ""}
    ${vt.asMfgJrnl !== undefined ? `<ASMFGJRNL>${formatBoolForTally(vt.asMfgJrnl)}</ASMFGJRNL>` : ""}
    ${vt.useforJobwork !== undefined ? `<USEFORJOBWORK>${formatBoolForTally(vt.useforJobwork)}</USEFORJOBWORK>` : ""}
    ${vt.isforJobworkIn !== undefined ? `<ISFORJOBWORKIN>${formatBoolForTally(vt.isforJobworkIn)}</ISFORJOBWORKIN>` : ""}
    ${vt.defaultVoucherCategory ? `<DEFAULTVOUCHERCATEGORY>${escapeXml(vt.defaultVoucherCategory)}</DEFAULTVOUCHERCATEGORY>` : ""}
    ${vt.coreVoucherType ? `<COREVOUCHERTYPE>${escapeXml(vt.coreVoucherType)}</COREVOUCHERTYPE>` : ""}
    ${voucherClassesXml}
  </VOUCHERTYPE>`;
}

function voucherToXml(voucher: Voucher): string {
  const action = voucher.masterId ? "Alter" : "Create";
  const dateStr = formatDateForTally(voucher.date);

  const ledgerEntriesXml = voucher.ledgerEntries
    ? voucher.ledgerEntries.map(e => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${escapeXml(e.ledgerName)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${formatBoolForTally(e.isDeemedPositive)}</ISDEEMEDPOSITIVE>
        ${e.isPartyLedger !== undefined ? `<ISPARTYLEDGER>${formatBoolForTally(e.isPartyLedger)}</ISPARTYLEDGER>` : ""}
        <AMOUNT>${formatAmountForTally(e.amount)}</AMOUNT>
        ${e.billAllocations ? e.billAllocations.map(b => `
        <BILLALLOCATIONS.LIST>
          <NAME>${escapeXml(b.name)}</NAME>
          ${b.billType ? `<BILLTYPE>${escapeXml(b.billType)}</BILLTYPE>` : ""}
          ${b.dueDate ? `<BILLCREDITPERIOD>${escapeXml(typeof b.dueDate === "object" && "text" in b.dueDate ? b.dueDate.text || b.dueDate.date : b.dueDate as any)}</BILLCREDITPERIOD>` : ""}
          <AMOUNT>${formatAmountForTally(b.amount)}</AMOUNT>
        </BILLALLOCATIONS.LIST>`).join("") : ""}
        ${e.costCentreAllocations ? e.costCentreAllocations.map(c => `
        <CATEGORYALLOCATIONS.LIST>
          ${c.category ? `<CATEGORY>${escapeXml(c.category)}</CATEGORY>` : ""}
          <COSTCENTREALLOCATIONS.LIST>
            <NAME>${escapeXml(c.name)}</NAME>
            <AMOUNT>${formatAmountForTally(c.amount)}</AMOUNT>
          </COSTCENTREALLOCATIONS.LIST>
        </CATEGORYALLOCATIONS.LIST>`).join("") : ""}
      </ALLLEDGERENTRIES.LIST>`).join("")
    : "";

  const inventoryXml = voucher.inventoryAllocations
    ? voucher.inventoryAllocations.map(inv => `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${escapeXml(inv.stockItemName)}</STOCKITEMNAME>
        <RATE>${escapeXml(inv.rate)}</RATE>
        <ACTUALQUANTITY>${escapeXml(inv.actualQuantity ?? inv.quantity)}</ACTUALQUANTITY>
        <BILLEDQUANTITY>${escapeXml(inv.billedQuantity ?? inv.quantity)}</BILLEDQUANTITY>
        <AMOUNT>${formatAmountForTally(inv.amount)}</AMOUNT>
        <ISDEEMEDPOSITIVE>${formatBoolForTally(inv.isDeemedPositive)}</ISDEEMEDPOSITIVE>
        ${inv.batchAllocations ? inv.batchAllocations.map(b => `
        <BATCHALLOCATIONS.LIST>
          ${b.batchName ? `<BATCHNAME>${escapeXml(b.batchName)}</BATCHNAME>` : ""}
          <GODOWNNAME>${escapeXml(b.godownName)}</GODOWNNAME>
          ${b.orderNo ? `<ORDERNO>${escapeXml(b.orderNo)}</ORDERNO>` : ""}
          ${b.trackingNumber ? `<TRACKINGNUMBER>${escapeXml(b.trackingNumber)}</TRACKINGNUMBER>` : ""}
          ${b.actualQuantity !== undefined ? `<ACTUALQTY>${escapeXml(b.actualQuantity as any)}</ACTUALQTY>` : ""}
          ${b.billedQuantity !== undefined ? `<BILLEDQTY>${escapeXml(b.billedQuantity as any)}</BILLEDQTY>` : ""}
          ${b.rate !== undefined ? `<RATE>${escapeXml(b.rate as any)}</RATE>` : ""}
          ${b.amount !== undefined ? `<AMOUNT>${formatAmountForTally(b.amount)}</AMOUNT>` : ""}
        </BATCHALLOCATIONS.LIST>`).join("") : ""}
        ${inv.accountingAllocations ? inv.accountingAllocations.map(a => `
        <ACCOUNTINGALLOCATIONS.LIST>
          <LEDGERNAME>${escapeXml(a.ledgerName)}</LEDGERNAME>
          ${a.isDeemedPositive !== undefined ? `<ISDEEMEDPOSITIVE>${formatBoolForTally(a.isDeemedPositive)}</ISDEEMEDPOSITIVE>` : ""}
          <AMOUNT>${formatAmountForTally(a.amount)}</AMOUNT>
        </ACCOUNTINGALLOCATIONS.LIST>`).join("") : ""}
        ${inv.gstRateDetails ? inv.gstRateDetails.map(g => `
        <GSTRATEDETAILS.LIST>
          ${g.dutyHead ? `<GSTRATEDUTYHEAD>${escapeXml(g.dutyHead)}</GSTRATEDUTYHEAD>` : ""}
          ${g.valuationType ? `<GSTRATEVALUATIONTYPE>${escapeXml(g.valuationType)}</GSTRATEVALUATIONTYPE>` : ""}
          ${g.rate !== undefined ? `<GSTRATE>${g.rate}</GSTRATE>` : ""}
        </GSTRATEDETAILS.LIST>`).join("") : ""}
        ${inv.ledgers ? inv.ledgers.map(l => `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(l.ledgerName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${formatBoolForTally(l.isDeemedPositive)}</ISDEEMEDPOSITIVE>
          <AMOUNT>${formatAmountForTally(l.amount)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`).join("") : ""}
      </ALLINVENTORYENTRIES.LIST>`).join("")
    : "";

  return `
  <VOUCHER VCHTYPE="${escapeXml(voucher.voucherType)}" ACTION="${action}">
    <DATE>${dateStr}</DATE>
    <VOUCHERTYPENAME>${escapeXml(voucher.voucherType)}</VOUCHERTYPENAME>
    ${voucher.voucherNumber ? `<VOUCHERNUMBER>${escapeXml(voucher.voucherNumber)}</VOUCHERNUMBER>` : ""}
    ${voucher.partyName ? `<PARTYLEDGERNAME>${escapeXml(voucher.partyName)}</PARTYLEDGERNAME>` : ""}
    ${voucher.referenceDate ? `<REFERENCEDATE>${formatDateForTally(voucher.referenceDate)}</REFERENCEDATE>` : ""}
    ${voucher.effectiveDate ? `<EFFECTIVEDATE>${formatDateForTally(voucher.effectiveDate)}</EFFECTIVEDATE>` : ""}
    ${voucher.partyGSTIN ? `<PARTYGSTIN>${escapeXml(voucher.partyGSTIN)}</PARTYGSTIN>` : ""}
    ${voucher.partyGSTRegistrationType ? `<GSTREGISTRATIONTYPE>${escapeXml(voucher.partyGSTRegistrationType)}</GSTREGISTRATIONTYPE>` : ""}
    ${voucher.gstRegistration ? `<GSTREGISTRATION>${escapeXml(voucher.gstRegistration)}</GSTREGISTRATION>` : ""}
    ${voucher.placeOfSupply ? `<PLACEOFSUPPLY>${escapeXml(voucher.placeOfSupply)}</PLACEOFSUPPLY>` : ""}
    ${voucher.consigneeName ? `<CONSIGNEENAME>${escapeXml(voucher.consigneeName)}</CONSIGNEENAME>` : ""}
    ${voucher.consigneeGSTIN ? `<CONSIGNEEGSTIN>${escapeXml(voucher.consigneeGSTIN)}</CONSIGNEEGSTIN>` : ""}
    ${voucher.consigneeState ? `<CONSIGNEESTATENAME>${escapeXml(voucher.consigneeState)}</CONSIGNEESTATENAME>` : ""}
    ${voucher.voucherGSTClass ? `<VCHGSTCLASS>${escapeXml(voucher.voucherGSTClass)}</VCHGSTCLASS>` : ""}
    ${voucher.isInvoice !== undefined ? `<ISINVOICE>${formatBoolForTally(voucher.isInvoice)}</ISINVOICE>` : ""}
    ${voucher.isOptional !== undefined ? `<ISOPTIONAL>${formatBoolForTally(voucher.isOptional)}</ISOPTIONAL>` : ""}
    ${voucher.viewType ? `<VOUCHERVIEWTYPE>${escapeXml(voucher.viewType)}</VOUCHERVIEWTYPE>` : ""}
    ${voucher.narration ? `<NARRATION>${escapeXml(voucher.narration)}</NARRATION>` : ""}
    ${voucher.reference ? `<REFERENCE>${escapeXml(voucher.reference)}</REFERENCE>` : ""}
    ${voucher.ewayBillDetails ? `
    <EWAYBILLDETAILS.LIST>
      ${voucher.ewayBillDetails.billNumber ? `<BILLNUMBER>${escapeXml(voucher.ewayBillDetails.billNumber)}</BILLNUMBER>` : ""}
      ${voucher.ewayBillDetails.billDate ? `<BILLDATE>${formatDateForTally(voucher.ewayBillDetails.billDate)}</BILLDATE>` : ""}
      ${voucher.ewayBillDetails.billStatus ? `<BILLSTATUS>${escapeXml(voucher.ewayBillDetails.billStatus)}</BILLSTATUS>` : ""}
      ${voucher.ewayBillDetails.transporterName ? `<TRANSPORTERNAME>${escapeXml(voucher.ewayBillDetails.transporterName)}</TRANSPORTERNAME>` : ""}
      ${voucher.ewayBillDetails.transporterId ? `<TRANSPORTERID>${escapeXml(voucher.ewayBillDetails.transporterId)}</TRANSPORTERID>` : ""}
      ${voucher.ewayBillDetails.distance !== undefined ? `<DISTANCE>${voucher.ewayBillDetails.distance}</DISTANCE>` : ""}
      ${voucher.ewayBillDetails.vehicleNumber ? `<VEHICLENUMBER>${escapeXml(voucher.ewayBillDetails.vehicleNumber)}</VEHICLENUMBER>` : ""}
      ${voucher.ewayBillDetails.vehicleType ? `<VEHICLETYPE>${escapeXml(voucher.ewayBillDetails.vehicleType)}</VEHICLETYPE>` : ""}
    </EWAYBILLDETAILS.LIST>` : ""}
    ${ledgerEntriesXml}
    ${inventoryXml}
  </VOUCHER>`;
}

function gstDetailsListToXml(gstDetails: GSTDetail[] | undefined): string {
  if (!gstDetails) return "";
  return gstDetails.map(gst => `
    <GSTDETAILS.LIST>
      ${gst.applicableFrom ? `<APPLICABLEFROM>${formatDateForTally(gst.applicableFrom)}</APPLICABLEFROM>` : ""}
      ${gst.calculationType ? `<CALCULATIONTYPE>${escapeXml(gst.calculationType)}</CALCULATIONTYPE>` : ""}
      <GSTCALCSLABONMRP>${formatBoolForTally(gst.calculateSlabOnMRP)}</GSTCALCSLABONMRP>
      ${gst.natureOfTransaction ? `<GSTNATUREOFTRANSACTION>${escapeXml(gst.natureOfTransaction)}</GSTNATUREOFTRANSACTION>` : ""}
      ${gst.isNonGSTGoods !== undefined ? `<ISNONGSTGOODS>${formatBoolForTally(gst.isNonGSTGoods)}</ISNONGSTGOODS>` : ""}
      ${gst.taxability ? `<TAXABILITY>${escapeXml(gst.taxability)}</TAXABILITY>` : ""}
      ${gst.sourceOfGSTDetails ? `<SRCOFGSTDETAILS>${escapeXml(gst.sourceOfGSTDetails)}</SRCOFGSTDETAILS>` : ""}
      ${gst.isReverseChargeApplicable !== undefined ? `<ISREVERSECHARGEAPPLICABLE>${formatBoolForTally(gst.isReverseChargeApplicable)}</ISREVERSECHARGEAPPLICABLE>` : ""}
      <GSTINELIGIBLEITC>${formatBoolForTally(gst.isInEligibleForITC)}</GSTINELIGIBLEITC>
      ${gst.includeExpForSlabCalc !== undefined ? `<INCLUDEEXPFORSLABCALC>${formatBoolForTally(gst.includeExpForSlabCalc)}</INCLUDEEXPFORSLABCALC>` : ""}
      ${gst.stateWiseDetails ? gst.stateWiseDetails.map(sw => `
      <STATEWISEDETAILS.LIST>
        ${sw.stateName ? `<STATENAME>${escapeXml(sw.stateName)}</STATENAME>` : ""}
        ${sw.rateDetails ? sw.rateDetails.map(rd => `
        <RATEDETAILS.LIST>
          ${rd.dutyHead ? `<GSTRATEDUTYHEAD>${escapeXml(rd.dutyHead)}</GSTRATEDUTYHEAD>` : ""}
          ${rd.valuationType ? `<GSTRATEVALUATIONTYPE>${escapeXml(rd.valuationType)}</GSTRATEVALUATIONTYPE>` : ""}
          <GSTRATE>${rd.gstRate}</GSTRATE>
        </RATEDETAILS.LIST>`).join("") : ""}
      </STATEWISEDETAILS.LIST>`).join("") : ""}
    </GSTDETAILS.LIST>`).join("");
}

function hsnDetailsListToXml(hsnDetails: HSNDetail[] | undefined): string {
  if (!hsnDetails) return "";
  return hsnDetails.map(hsn => `
    <HSNDETAILS.LIST>
      ${hsn.applicableFrom ? `<APPLICABLEFROM>${formatDateForTally(hsn.applicableFrom)}</APPLICABLEFROM>` : ""}
      ${hsn.hsnDescription ? `<HSN>${escapeXml(hsn.hsnDescription)}</HSN>` : ""}
      ${hsn.hsnCode ? `<HSNCODE>${escapeXml(hsn.hsnCode)}</HSNCODE>` : ""}
      ${hsn.hsnClassificationName ? `<HSNCLASSIFICATIONNAME>${escapeXml(hsn.hsnClassificationName)}</HSNCLASSIFICATIONNAME>` : ""}
      ${hsn.source ? `<SRCOFHSNDETAILS>${escapeXml(hsn.source)}</SRCOFHSNDETAILS>` : ""}
    </HSNDETAILS.LIST>`).join("");
}

function companyToXml(company: Company): string {
  const action = company.masterId ? "Alter" : "Create";
  return `
  <COMPANY NAME="${escapeXml(company.name)}" ACTION="${action}">
    <NAME>${escapeXml(company.name)}</NAME>
    ${company.startingFrom ? `<STARTINGFROM>${formatDateForTally(company.startingFrom)}</STARTINGFROM>` : ""}
    ${company.booksBeginningFrom ? `<BOOKSFROM>${formatDateForTally(company.booksBeginningFrom)}</BOOKSFROM>` : ""}
    ${company.formalName ? `<BASICCOMPANYFORMALNAME>${escapeXml(company.formalName)}</BASICCOMPANYFORMALNAME>` : ""}
    ${company.state ? `<STATENAME>${escapeXml(company.state)}</STATENAME>` : ""}
    ${company.country ? `<COUNTRYNAME>${escapeXml(company.country)}</COUNTRYNAME>` : ""}
    ${company.pinCode ? `<PINCODE>${escapeXml(company.pinCode)}</PINCODE>` : ""}
    ${company.phoneNumber ? `<PHONENUMBER>${escapeXml(company.phoneNumber)}</PHONENUMBER>` : ""}
    ${company.mobileNumber ? `<MOBILENO>${escapeXml(company.mobileNumber)}</MOBILENO>` : ""}
    ${company.address ? `<REMOTEFULLLISTNAME>${escapeXml(company.address)}</REMOTEFULLLISTNAME>` : ""}
    ${company.faxNumber ? `<FAXNUMBER>${escapeXml(company.faxNumber)}</FAXNUMBER>` : ""}
    ${company.email ? `<EMAIL>${escapeXml(company.email)}</EMAIL>` : ""}
    ${company.website ? `<WEBSITE>${escapeXml(company.website)}</WEBSITE>` : ""}
    ${company.tanNumber ? `<TANUMBER>${escapeXml(company.tanNumber)}</TANUMBER>` : ""}
    ${company.tanRegNumber ? `<TANREGNO>${escapeXml(company.tanRegNumber)}</TANREGNO>` : ""}
    ${company.pan ? `<INCOMETAXNUMBER>${escapeXml(company.pan)}</INCOMETAXNUMBER>` : ""}
    ${company.cin ? `<CORPORATEIDENTITYNO>${escapeXml(company.cin)}</CORPORATEIDENTITYNO>` : ""}
    ${company.isInventoryOn !== undefined ? `<ISINVENTORYON>${formatBoolForTally(company.isInventoryOn)}</ISINVENTORYON>` : ""}
    ${company.integrateAccountswithInventory !== undefined ? `<ISINTEGRATED>${formatBoolForTally(company.integrateAccountswithInventory)}</ISINTEGRATED>` : ""}
    ${company.isBillWiseOn !== undefined ? `<ISBILLWISEON>${formatBoolForTally(company.isBillWiseOn)}</ISBILLWISEON>` : ""}
    ${company.isCostCentersOn !== undefined ? `<ISCOSTCENTRESON>${formatBoolForTally(company.isCostCentersOn)}</ISCOSTCENTRESON>` : ""}
    ${company.isTDSOn !== undefined ? `<ISTDSON>${formatBoolForTally(company.isTDSOn)}</ISTDSON>` : ""}
    ${company.isTCSOn !== undefined ? `<ISTCSON>${formatBoolForTally(company.isTCSOn)}</ISTCSON>` : ""}
    ${company.isGSTOn !== undefined ? `<ISGSTON>${formatBoolForTally(company.isGSTOn)}</ISGSTON>` : ""}
    ${company.isPayrollOn !== undefined ? `<ISPAYROLLON>${formatBoolForTally(company.isPayrollOn)}</ISPAYROLLON>` : ""}
    ${company.isInterestOn !== undefined ? `<ISINTERESTON>${formatBoolForTally(company.isInterestOn)}</ISINTERESTON>` : ""}
  </COMPANY>`;
}

function unitToXml(unit: Unit): string {
  const action = unit.masterId ? "Alter" : "Create";
  return `
  <UNIT NAME="${escapeXml(unit.name)}" ACTION="${action}">
    <NAME>${escapeXml(unit.name)}</NAME>
    ${unit.formalName ? `<ORIGINALNAME>${escapeXml(unit.formalName)}</ORIGINALNAME>` : ""}
    ${unit.baseUnit ? `<BASEUNITS>${escapeXml(unit.baseUnit)}</BASEUNITS>` : ""}
    ${unit.additionalUnits ? `<ADDITIONALUNITS>${escapeXml(unit.additionalUnits)}</ADDITIONALUNITS>` : ""}
    ${unit.uqc ? `<GSTREPUOM>${escapeXml(unit.uqc)}</GSTREPUOM>` : ""}
    ${unit.decimalPlaces !== undefined ? `<DECIMALPLACES>${unit.decimalPlaces}</DECIMALPLACES>` : ""}
    ${unit.isSimpleUnit !== undefined ? `<ISSIMPLEUNIT>${formatBoolForTally(unit.isSimpleUnit)}</ISSIMPLEUNIT>` : ""}
    ${unit.isGstExcluded !== undefined ? `<ISGSTEXCLUDED>${formatBoolForTally(unit.isGstExcluded)}</ISGSTEXCLUDED>` : ""}
    ${unit.conversion !== undefined ? `<CONVERSION>${unit.conversion}</CONVERSION>` : ""}
  </UNIT>`;
}

function stockGroupToXml(sg: StockGroup): string {
  const action = sg.masterId ? "Alter" : "Create";
  let languageListXml = "";
  if (sg.languageNameList && sg.languageNameList.length > 0) {
    languageListXml = sg.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(sg.name)}</NAME>
        ${sg.alias ? `<NAME>${escapeXml(sg.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }
  return `
  <STOCKGROUP NAME="${escapeXml(sg.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(sg.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    ${sg.parent ? `<PARENT>${escapeXml(sg.parent)}</PARENT>` : ""}
    ${sg.isAddable !== undefined ? `<ISADDABLE>${formatBoolForTally(sg.isAddable)}</ISADDABLE>` : ""}
    ${sg.gstApplicability ? `<GSTAPPLICABLE>${escapeXml(sg.gstApplicability)}</GSTAPPLICABLE>` : ""}
    ${sg.baseUnit ? `<BASEUNITS>${escapeXml(sg.baseUnit)}</BASEUNITS>` : ""}
    ${gstDetailsListToXml(sg.gstDetails)}
  </STOCKGROUP>`;
}

function stockCategoryToXml(sc: StockCategory): string {
  const action = sc.masterId ? "Alter" : "Create";
  let languageListXml = "";
  if (sc.languageNameList && sc.languageNameList.length > 0) {
    languageListXml = sc.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(sc.name)}</NAME>
        ${sc.alias ? `<NAME>${escapeXml(sc.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }
  return `
  <STOCKCATEGORY NAME="${escapeXml(sc.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(sc.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    ${sc.parent ? `<PARENT>${escapeXml(sc.parent)}</PARENT>` : ""}
  </STOCKCATEGORY>`;
}

function godownToXml(gd: Godown): string {
  const action = gd.masterId ? "Alter" : "Create";
  let languageListXml = "";
  if (gd.languageNameList && gd.languageNameList.length > 0) {
    languageListXml = gd.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(gd.name)}</NAME>
        ${gd.alias ? `<NAME>${escapeXml(gd.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }
  return `
  <GODOWN NAME="${escapeXml(gd.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(gd.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    ${gd.parent ? `<PARENT>${escapeXml(gd.parent)}</PARENT>` : ""}
  </GODOWN>`;
}

function stockItemToXml(si: StockItem): string {
  const action = si.masterId ? "Alter" : "Create";
  let languageListXml = "";
  if (si.languageNameList && si.languageNameList.length > 0) {
    languageListXml = si.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("");
  } else {
    languageListXml = `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(si.name)}</NAME>
        ${si.alias ? `<NAME>${escapeXml(si.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;
  }

  const mailingNamesXml = si.mailingNames && si.mailingNames.length > 0
    ? `
    <MAILINGNAME.LIST TYPE="String">
      ${si.mailingNames.map(n => `<MAILINGNAME>${escapeXml(n)}</MAILINGNAME>`).join("")}
    </MAILINGNAME.LIST>`
    : "";

  const batchesXml = si.openingBatchAllocations && si.openingBatchAllocations.length > 0
    ? si.openingBatchAllocations.map(ba => `
    <BATCHALLOCATIONS.LIST>
      ${ba.batchName ? `<BATCHNAME>${escapeXml(ba.batchName)}</BATCHNAME>` : ""}
      <GODOWNNAME>${escapeXml(ba.godownName)}</GODOWNNAME>
      ${ba.name ? `<NAME>${escapeXml(ba.name)}</NAME>` : ""}
      ${ba.manufacturingDate ? `<MFDON>${formatDateForTally(ba.manufacturingDate)}</MFDON>` : ""}
      ${ba.expiryPeriod ? `<EXPIRYPERIOD>${escapeXml(ba.expiryPeriod)}</EXPIRYPERIOD>` : ""}
      ${ba.quantity !== undefined ? `<OPENINGBALANCE>${ba.quantity}</OPENINGBALANCE>` : ""}
      ${ba.rate !== undefined ? `<OPENINGRATE>${ba.rate}</OPENINGRATE>` : ""}
      ${ba.value !== undefined ? `<OPENINGVALUE>${ba.value}</OPENINGVALUE>` : ""}
    </BATCHALLOCATIONS.LIST>`).join("")
    : "";

  const componentsXml = si.components && si.components.length > 0
    ? si.components.map(comp => `
    <MULTICOMPONENTLIST.LIST>
      <COMPONENTLISTNAME>${escapeXml(comp.name)}</COMPONENTLISTNAME>
      <COMPONENTBASICQTY>${comp.baseQuantity}</COMPONENTBASICQTY>
      ${comp.componentListItems ? comp.componentListItems.map(item => `
      <MULTICOMPONENTITEMLIST.LIST>
        <NATUREOFITEM>${escapeXml(item.natureOfComponent)}</NATUREOFITEM>
        <STOCKITEMNAME>${escapeXml(item.itemName)}</STOCKITEMNAME>
        ${item.defaultGodown ? `<GODOWNNAME>${escapeXml(item.defaultGodown)}</GODOWNNAME>` : ""}
        <ACTUALQTY>${item.actualQuantity}</ACTUALQTY>
      </MULTICOMPONENTITEMLIST.LIST>`).join("") : ""}
    </MULTICOMPONENTLIST.LIST>`).join("")
    : "";

  return `
  <STOCKITEM NAME="${escapeXml(si.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(si.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    ${mailingNamesXml}
    <PARENT>${escapeXml(si.stockGroup || "")}</PARENT>
    ${si.stockCategory ? `<CATEGORY>${escapeXml(si.stockCategory)}</CATEGORY>` : ""}
    ${si.gstApplicable ? `<GSTAPPLICABLE>${escapeXml(si.gstApplicable)}</GSTAPPLICABLE>` : ""}
    ${si.gstTypeOfSupply ? `<GSTTYPEOFSUPPLY>${escapeXml(si.gstTypeOfSupply)}</GSTTYPEOFSUPPLY>` : ""}
    ${si.tcsApplicable ? `<TCSAPPLICABLE>${escapeXml(si.tcsApplicable)}</TCSAPPLICABLE>` : ""}
    ${si.description ? `<DESCRIPTION>${escapeXml(si.description)}</DESCRIPTION>` : ""}
    ${si.narration ? `<NARRATION>${escapeXml(si.narration)}</NARRATION>` : ""}
    ${si.costingMethod ? `<COSTINGMETHOD>${escapeXml(si.costingMethod)}</COSTINGMETHOD>` : ""}
    ${si.valuationMethod ? `<VALUATIONMETHOD>${escapeXml(si.valuationMethod)}</VALUATIONMETHOD>` : ""}
    ${si.isCostTracking !== undefined ? `<ISCOSTTRACKINGON>${formatBoolForTally(si.isCostTracking)}</ISCOSTTRACKINGON>` : ""}
    ${si.isCostCentresOn !== undefined ? `<ISCOSTCENTRESON>${formatBoolForTally(si.isCostCentresOn)}</ISCOSTCENTRESON>` : ""}
    ${si.maintainInBranches !== undefined ? `<ISBATCHWISEON>${formatBoolForTally(si.maintainInBranches)}</ISBATCHWISEON>` : ""}
    ${si.useExpiryDates !== undefined ? `<ISPERISHABLEON>${formatBoolForTally(si.useExpiryDates)}</ISPERISHABLEON>` : ""}
    ${si.trackDateOfManufacturing !== undefined ? `<HASMFGDATE>${formatBoolForTally(si.trackDateOfManufacturing)}</HASMFGDATE>` : ""}
    <BASEUNITS>${escapeXml(si.baseUnit)}</BASEUNITS>
    ${si.additionalUnits ? `<ADDITIONALUNITS>${escapeXml(si.additionalUnits)}</ADDITIONALUNITS>` : ""}
    ${si.inclusiveOfTax !== undefined ? `<INCLUSIVETAX>${formatBoolForTally(si.inclusiveOfTax)}</INCLUSIVETAX>` : ""}
    ${si.denominator !== undefined ? `<DENOMINATOR>${si.denominator}</DENOMINATOR>` : ""}
    ${si.conversion !== undefined ? `<CONVERSION>${si.conversion}</CONVERSION>` : ""}
    ${si.rateOfDuty ? `<BASICRATEOFEXCISE>${escapeXml(si.rateOfDuty)}</BASICRATEOFEXCISE>` : ""}
    ${si.openingBalance !== undefined ? `<OPENINGBALANCE>${si.openingBalance}</OPENINGBALANCE>` : ""}
    ${si.openingRate !== undefined ? `<OPENINGRATE>${si.openingRate}</OPENINGRATE>` : ""}
    ${si.openingValue !== undefined ? `<OPENINGVALUE>${si.openingValue}</OPENINGVALUE>` : ""}
    ${gstDetailsListToXml(si.gstDetails)}
    ${hsnDetailsListToXml(si.hsnDetails)}
    ${batchesXml}
    ${componentsXml}
  </STOCKITEM>`;
}

function employeeToXml(emp: Employee): string {
  return costCentreToXml(emp);
}

function employeeGroupToXml(eg: EmployeeGroup): string {
  return costCentreToXml(eg);
}

function currencyToXml(cur: Currency): string {
  const action = cur.masterId ? "Alter" : "Create";
  return `
  <CURRENCY NAME="${escapeXml(cur.name)}" ACTION="${action}">
    <ORIGINALNAME>${escapeXml(cur.name)}</ORIGINALNAME>
    ${cur.formalName ? `<MAILINGNAME>${escapeXml(cur.formalName)}</MAILINGNAME>` : ""}
  </CURRENCY>`;
}

function gstRegistrationToXml(reg: GSTRegistration): string {
  const action = reg.masterId ? "Alter" : "Create";
  const languageListXml = reg.languageNameList && reg.languageNameList.length > 0
    ? reg.languageNameList.map(lang => `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        ${lang.names.map(n => `<NAME>${escapeXml(n)}</NAME>`).join("")}
      </NAME.LIST>
      ${lang.languageId !== undefined ? `<LANGUAGEID>${lang.languageId}</LANGUAGEID>` : ""}
    </LANGUAGENAME.LIST>`).join("")
    : `
    <LANGUAGENAME.LIST>
      <NAME.LIST TYPE="String">
        <NAME>${escapeXml(reg.name)}</NAME>
        ${reg.alias ? `<NAME>${escapeXml(reg.alias)}</NAME>` : ""}
      </NAME.LIST>
    </LANGUAGENAME.LIST>`;

  const detailsXml = reg.registrationDetails
    ? reg.registrationDetails.map(detail => `
    <GSTREGISTRATIONDETAILS.LIST>
      ${detail.applicableFrom ? `<FROMDATE>${formatDateForTally(detail.applicableFrom)}</FROMDATE>` : ""}
      ${detail.gstRegistrationType ? `<REGISTRATIONTYPE>${escapeXml(detail.gstRegistrationType)}</REGISTRATIONTYPE>` : ""}
      ${detail.state ? `<STATE>${escapeXml(detail.state)}</STATE>` : ""}
      ${detail.placeOfSupply ? `<PLACEOFSUPPLY>${escapeXml(detail.placeOfSupply)}</PLACEOFSUPPLY>` : ""}
      ${detail.isOtherTerritoryAssessee !== undefined ? `<ISOTHTERRITORYASSESSEE>${formatBoolForTally(detail.isOtherTerritoryAssessee)}</ISOTHTERRITORYASSESSEE>` : ""}
      ${detail.isStateCessOn !== undefined ? `<ISSTATECESSON>${formatBoolForTally(detail.isStateCessOn)}</ISSTATECESSON>` : ""}
    </GSTREGISTRATIONDETAILS.LIST>`).join("")
    : "";

  return `
  <GSTREGISTRATION NAME="${escapeXml(reg.name)}" ACTION="${action}">
    <NAME.LIST>
      <NAME>${escapeXml(reg.name)}</NAME>
    </NAME.LIST>
    ${languageListXml}
    <STATENAME>${escapeXml(reg.stateName)}</STATENAME>
    ${reg.priorStateName ? `<PRIORSTATENAME>${escapeXml(reg.priorStateName)}</PRIORSTATENAME>` : ""}
    ${reg.gstin ? `<GSTREGNUMBER>${escapeXml(reg.gstin)}</GSTREGNUMBER>` : ""}
    ${reg.eWayApplicableType ? `<EWAYBILLAPPLICABLETYPE>${escapeXml(reg.eWayApplicableType)}</EWAYBILLAPPLICABLETYPE>` : ""}
    ${reg.gstUserName ? `<GSTNUSERNAME>${escapeXml(reg.gstUserName)}</GSTNUSERNAME>` : ""}
    ${reg.eSignMethod ? `<ESIGNMETHOD>${escapeXml(reg.eSignMethod)}</ESIGNMETHOD>` : ""}
    ${reg.isOtherTerritoryAssessee !== undefined ? `<ISOTHTERRITORYASSESSEE>${formatBoolForTally(reg.isOtherTerritoryAssessee)}</ISOTHTERRITORYASSESSEE>` : ""}
    ${reg.isEwayBillApplicable !== undefined ? `<ISEWAYBILLPRINTAPPLICABLE>${formatBoolForTally(reg.isEwayBillApplicable)}</ISEWAYBILLPRINTAPPLICABLE>` : ""}
    ${reg.isEwayBillApplicableForIntra !== undefined ? `<ISEWAYBILLAPPLICABLEFORINTRA>${formatBoolForTally(reg.isEwayBillApplicableForIntra)}</ISEWAYBILLAPPLICABLEFORINTRA>` : ""}
    ${detailsXml}
  </GSTREGISTRATION>`;
}

/**
 * Builds the POST XML wrapper for importing multiple Masters/Vouchers into Tally
 */
export function buildPostXml(
  type: "Ledger" | "Group" | "Voucher" | "CostCentre" | "CostCategory" | "VoucherType" | "Company" | "Unit" | "StockGroup" | "StockCategory" | "Godown" | "StockItem" | "Employee" | "EmployeeGroup" | "Currency" | "GSTRegistration",
  objects: any[],
  options: PostRequestOptions = {}
): string {
  let innerXml = "";
  if (type === "Ledger") {
    innerXml = objects.map(o => ledgerToXml(o)).join("");
  } else if (type === "Group") {
    innerXml = objects.map(o => groupToXml(o)).join("");
  } else if (type === "Voucher") {
    innerXml = objects.map(o => voucherToXml(o)).join("");
  } else if (type === "CostCentre") {
    innerXml = objects.map(o => costCentreToXml(o)).join("");
  } else if (type === "CostCategory") {
    innerXml = objects.map(o => costCategoryToXml(o)).join("");
  } else if (type === "VoucherType") {
    innerXml = objects.map(o => voucherTypeToXml(o)).join("");
  } else if (type === "Company") {
    innerXml = objects.map(o => companyToXml(o)).join("");
  } else if (type === "Unit") {
    innerXml = objects.map(o => unitToXml(o)).join("");
  } else if (type === "StockGroup") {
    innerXml = objects.map(o => stockGroupToXml(o)).join("");
  } else if (type === "StockCategory") {
    innerXml = objects.map(o => stockCategoryToXml(o)).join("");
  } else if (type === "Godown") {
    innerXml = objects.map(o => godownToXml(o)).join("");
  } else if (type === "StockItem") {
    innerXml = objects.map(o => stockItemToXml(o)).join("");
  } else if (type === "Employee") {
    innerXml = objects.map(o => employeeToXml(o)).join("");
  } else if (type === "EmployeeGroup") {
    innerXml = objects.map(o => employeeGroupToXml(o)).join("");
  } else if (type === "Currency") {
    innerXml = objects.map(o => currencyToXml(o)).join("");
  } else if (type === "GSTRegistration") {
    innerXml = objects.map(o => gstRegistrationToXml(o)).join("");
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>IMPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>All Masters</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
        ${options.stopAtFirstError ? "<SVIMPBEHAVIOUREXCP>Stop Import at First Exception</SVIMPBEHAVIOUREXCP>" : "<SVIMPBEHAVIOUREXCP>Ignore Exceptions and Import</SVIMPBEHAVIOUREXCP>"}
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        ${innerXml}
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

function getPeriodicityValue(p: Periodicity): string {
  switch (p) {
    case "Month": return "Month";
    case "Day": return "Day";
    case "Week": return "Week";
    case "Fortnight": return "Fortnight";
    case "Three Month": return "3 Month";
    case "Six Month": return "6 Month";
    case "Year": return "Year";
    default: return "Month";
  }
}

/**
 * Builds the XML to dynamically retrieve the exact item count of a collection.
 */
export function buildCountRequestXml(
  collectionType: string,
  options: RequestOptions = {}
): string {
  const reportName = "TC_CountReport";
  const collectionName = `TC_${collectionType}Collection`;
  const tallyType = options.collectionType || collectionType;
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);

  // Generate TDL filters and system declarations
  const filterTags = options.filters ? options.filters.map(f => `<FILTERS>${escapeXml(f.name)}</FILTERS>`).join("\n") : "";
  const systemFilters = options.filters
    ? options.filters.map(f => `<SYSTEM TYPE="Formulae" NAME="${escapeXml(f.name)}">${escapeXml(f.formula)}</SYSTEM>`).join("\n")
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>${reportName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
        ${fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : ""}
        ${toDate ? `<SVTODATE>${toDate}</SVTODATE>` : ""}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="${reportName}">
            <FORMS>${reportName}</FORMS>
          </REPORT>
          <FORM NAME="${reportName}">
            <TOPPARTS>${reportName}</TOPPARTS>
          </FORM>
          <PART NAME="${reportName}">
            <TOPLINES>${reportName}</TOPLINES>
          </PART>
          <LINE NAME="${reportName}">
            <FIELDS>TC_CountField</FIELDS>
          </LINE>
          <FIELD NAME="TC_CountField">
            <XMLTAG>TC_TotalCount</XMLTAG>
            <SET>$$NUMITEMS:${collectionName}</SET>
          </FIELD>
          <COLLECTION NAME="${collectionName}" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>${escapeXml(tallyType)}</TYPE>
            ${options.childOf ? `<CHILDOF>${escapeXml(options.childOf)}</CHILDOF>` : ""}
            ${options.belongsTo ? `<BELONGSTO>${options.belongsTo}</BELONGSTO>` : ""}
            ${filterTags}
          </COLLECTION>
          ${systemFilters}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

/**
 * Builds XML for auto-column statistical reports showing voucher counts partitioned by date periods.
 */
export function buildPeriodicVoucherStatisticsXml(
  periodicity: Periodicity,
  options: PeriodicVoucherStatisticsOptions = {}
): string {
  const reportName = "TC_AutoColumnStats";
  const periodicityVal = getPeriodicityValue(periodicity);
  const fromDate = formatDateForTally(options.fromDate);
  const toDate = formatDateForTally(options.toDate);

  const filterTag = options.voucherType ? `<FILTERS>TC_VchTypeFilter</FILTERS>` : "";
  const systemFilter = options.voucherType
    ? `<SYSTEM TYPE="Formulae" NAME="TC_VchTypeFilter">$Name="${escapeXml(options.voucherType)}"</SYSTEM>`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>${reportName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
        ${fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : ""}
        ${toDate ? `<SVTODATE>${toDate}</SVTODATE>` : ""}
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="${reportName}">
            <FORMS>${reportName}</FORMS>
            <REPEAT> SVFromDate, SVToDate</REPEAT>
            <VARIABLE>DoSetAutoColumn,SVPeriodicity</VARIABLE>
            <SET>DoSetAutoColumn:No</SET>
            <SET>SVPeriodicity:"${periodicityVal}"</SET>
            <SET>DSPRepeatCollection:"Period Collection"</SET>
          </REPORT>
          <FORM NAME="${reportName}">
            <TOPPARTS>${reportName}</TOPPARTS>
            <OPTION>TC_SETAUTOOPTION:$$SetAutoColumns:SVFromDATE,SVTODATE</OPTION>
          </FORM>
          <FORM NAME="TC_SETAUTOOPTION" ISOPTION="Yes" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
          </FORM>
          <PART NAME="${reportName}">
            <TOPLINES>${reportName}</TOPLINES>
            <REPEAT>${reportName} : TC_VchTypeCollection</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </PART>
          <LINE NAME="${reportName}">
            <FIELDS>TC_VchTypeName</FIELDS>
            <FIELDS>TC_VchTypeTotalCount</FIELDS>
            <FIELDS>TC_VchTypeCount</FIELDS>
            <FIELDS>TC_VchTypeOptCount</FIELDS>
            <FIELDS>TC_VchTypeCancCount</FIELDS>
            <XMLTAG>VchTypeStat</XMLTAG>
            <OPTION>TC_AutoColumnStatsRepeat:$MigVal&gt;0</OPTION>
          </LINE>
          <LINE NAME="TC_AutoColumnStatsRepeat" ISOPTION="Yes" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <FIELDS>TC_VchTypePeriodStat</FIELDS>
            <REPEAT>TC_VchTypePeriodStat</REPEAT>
            <SCROLLED>Vertical</SCROLLED>
          </LINE>
          <FIELD NAME="TC_VchTypeName">
            <XMLTAG>Name</XMLTAG>
            <SET>$Name</SET>
          </FIELD>
          <FIELD NAME="TC_VchTypeTotalCount">
            <XMLTAG>TotalCount</XMLTAG>
            <SET>$MigVal</SET>
          </FIELD>
          <FIELD NAME="TC_VchTypeCount">
            <XMLTAG>Count</XMLTAG>
            <SET>$StatVal</SET>
          </FIELD>
          <FIELD NAME="TC_VchTypePeriodStat">
            <XMLTAG>PeriodStat</XMLTAG>
            <FIELDS>TC_VchTypeFromDate</FIELDS>
            <FIELDS>TC_VchTypeToDate</FIELDS>
            <FIELDS>TC_VchTypeCancCount</FIELDS>
            <FIELDS>TC_VchTypeOptCount</FIELDS>
            <FIELDS>TC_VchTypeTotalPeriodCount</FIELDS>
          </FIELD>
          <FIELD NAME="TC_VchTypeFromDate">
            <XMLTAG>FromDate</XMLTAG>
            <SET>$$TC_TransformDateToXSD:##SVFromDate</SET>
            <INVISIBLE>$$ISEmpty:$$value</INVISIBLE>
          </FIELD>
          <FIELD NAME="TC_VchTypeToDate">
            <XMLTAG>ToDate</XMLTAG>
            <SET>$$TC_TransformDateToXSD:##SVToDate</SET>
            <USE>$$ISEmpty:$$value</USE>
          </FIELD>
          <FIELD NAME="TC_VchTypeTotalPeriodCount">
            <XMLTAG>TotalCount</XMLTAG>
            <SET>$StatVal</SET>
          </FIELD>
          <FIELD NAME="TC_VchTypeOptCount">
            <XMLTAG>OtionalCount</XMLTAG>
            <SET>$$DirectOptionalVch:$Name</SET>
          </FIELD>
          <FIELD NAME="TC_VchTypeCancCount">
            <XMLTAG>CancelledCount</XMLTAG>
            <SET>$CancVal</SET>
          </FIELD>
          <COLLECTION NAME="TC_VchTypeCollection" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>VoucherTypes</TYPE>
            ${filterTag}
          </COLLECTION>
          ${systemFilter}
          ${DEFAULT_TDL_FUNCTIONS.map(f => `
          <FUNCTION NAME="${f.name}">
            ${f.parameters.map(p => `<Parameter>${escapeXml(p)}</Parameter>`).join("")}
            ${f.variables ? f.variables.map(v => `<VARIABLES>${escapeXml(v)}</VARIABLES>`).join("") : ""}
            <Returns>${f.returns}</Returns>
            ${f.actions.map(a => `<Action>${escapeXml(a)}</Action>`).join("")}
          </FUNCTION>`).join("\n")}
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}
