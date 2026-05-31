import { XMLParser } from "fast-xml-parser";
import {
  LicenseInfo,
  LastAlterIds,
  PostResponse,
  Ledger,
  Group,
  Voucher,
  Company,
  CostCentre,
  CostCategory,
  VoucherType,
  Unit,
  StockGroup,
  StockCategory,
  Godown,
  StockItem,
  Employee,
  EmployeeGroup,
  MasterStatistics,
  VoucherStatistics,
  Currency,
  PeriodicVoucherStat,
  AutoColVoucherTypeStat,
  GSTRegistration,
  AttendanceType,
  Budget
} from "./types.js";
import { asArray, cleanResponseXml, getSingleValue, parseTallyBoolean, parseTallyNumeric } from "./xmlUtils.js";

export { asArray, cleanResponseXml, getSingleValue, parseTallyBoolean, parseTallyNumeric } from "./xmlUtils.js";

// Setup XML parser with optimized configurations
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => {
    return [
      "OBJECT",
      "ALLLEDGERENTRIES.LIST",
      "LEDGERENTRIES.LIST",
      "ALLINVENTORYENTRIES.LIST",
      "INVENTORYENTRIES.LIST",
      "ACCOUNTINGALLOCATIONS.LIST",
      "BILLALLOCATIONS.LIST",
      "CATEGORYALLOCATIONS.LIST",
      "COSTCENTREALLOCATIONS.LIST",
      "GSTRATEDETAILS.LIST",
      "EWAYBILLDETAILS.LIST",
      "NAME.LIST",
      "TALLYMESSAGE",
      "VOUCHER",
      "LEDGER",
      "GROUP",
      "COMPANY",
      "UNIT",
      "STOCKITEM",
      "COSTCENTRE",
      "COSTCATEGORY",
      "VOUCHERTYPE",
      "STOCKGROUP",
      "STOCKCATEGORY",
      "GODOWN",
      "LEDMULTIADDRESSLIST.LIST",
      "LEDMAILINGDETAILS.LIST",
      "LEDGSTREGDETAILS.LIST",
      "GSTDETAILS.LIST",
      "STATEWISEDETAILS.LIST",
      "RATEDETAILS.LIST",
      "HSNDETAILS.LIST",
      "PAYMENTDETAILS.LIST",
      "EXCISEJURISDICTIONDETAILS.LIST",
      "ADDRESS.LIST",
      "ADDRESS",
      "NAME",
      "VOUCHERCLASSLIST.LIST",
      "LEDGERFORINVENTORYLIST.LIST",
      "LEDGERENTRIESLIST.LIST",
      "DEFAULTACCALLOCFORITEM.LIST",
      "BATCHALLOCATIONS.LIST",
      "MULTICOMPONENTLIST.LIST",
      "MULTICOMPONENTITEMLIST.LIST",
      "MAILINGNAME.LIST",
      "STATOBJECTS",
      "STATVchType",
      "TC_MASTERSTATISTICSREPORT",
      "TC_VOUCHERSTATISTICSREPORT",
      "CURRENCY",
      "GSTREGISTRATION",
      "GSTREGISTRATIONDETAILS.LIST",
      "TAXUNIT",
      "VCHTYPESTAT",
      "PERIODSTAT",
      "ATTENDANCE",
      "BUDGET",
    ].includes(name);
  },
});

/**
 * Parses raw XML into standard JS Object
 */
export function parseRawXml(xml: string): any {
  const cleaned = cleanResponseXml(xml);
  return xmlParser.parse(cleaned);
}

/**
 * Checks if the response indicates an error and parses it
 */
export function checkTallyError(parsedObj: any): string | null {
  const envelope = parsedObj?.ENVELOPE;
  if (!envelope) return "Invalid XML response";

  // Check for LineError inside import/data responses
  const lineError = envelope?.BODY?.DATA?.LINEERROR;
  if (lineError) {
    return Array.isArray(lineError) ? lineError.join("; ") : String(lineError);
  }

  // Check for Header errors or Failure Response
  const headerStatus = envelope?.HEADER?.STATUS;
  if (headerStatus && String(headerStatus).toLowerCase() === "failure") {
    return "Tally request failed";
  }

  return null;
}

/**
 * Parses language name list and aliases robustly from the Tally XML response,
 * handling the fast-xml-parser array configuration for NAME.LIST.
 */
function parseLanguageNameList(item: any): { languageNameList?: any[]; alias?: string } {
  const result: any = {};
  if (item["LANGUAGENAME.LIST"]) {
    const langList = Array.isArray(item["LANGUAGENAME.LIST"]) ? item["LANGUAGENAME.LIST"] : [item["LANGUAGENAME.LIST"]];
    result.languageNameList = langList.map((lang: any) => {
      let namesList: string[] = [];
      const nameListObj = lang["NAME.LIST"];
      if (nameListObj) {
        const listArr = Array.isArray(nameListObj) ? nameListObj : [nameListObj];
        for (const nameObj of listArr) {
          const nVal = nameObj?.NAME;
          if (nVal !== undefined && nVal !== null) {
            if (Array.isArray(nVal)) {
              namesList.push(...nVal.map((n: any) => String(getSingleValue(n))));
            } else {
              namesList.push(String(getSingleValue(nVal)));
            }
          }
        }
      }
      return {
        names: namesList,
        languageId: lang.LANGUAGEID ? Number(getSingleValue(lang.LANGUAGEID)) : undefined,
      };
    });
    if (result.languageNameList.length > 0 && result.languageNameList[0].names.length > 1) {
      result.alias = result.languageNameList[0].names[1];
    }
  }
  return result;
}

/**
 * Parses the active company name from $$CurrentSimpleCompany
 */
export function parseActiveCompany(xml: string): string {
  const parsed = parseRawXml(xml);
  const result = parsed?.ENVELOPE?.BODY?.DATA?.RESULT;
  if (!result) {
    throw new Error("No active company found in Tally");
  }
  return String(getSingleValue(result));
}

/**
 * Parses License information from license response
 */
export function parseLicenseInfo(xml: string): LicenseInfo {
  const parsed = parseRawXml(xml);
  const collection = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION;
  if (!collection) {
    throw new Error("Failed to parse license info from Tally response");
  }

  let obj = collection.OBJECT;
  if (Array.isArray(obj)) {
    obj = obj.find((o: any) => o["@_NAME"] === "TC_LicenseInfoObject");
  } else if (obj && obj["@_NAME"] !== "TC_LicenseInfoObject") {
    obj = null;
  }

  if (!obj) {
    const directObj = collection.TC_LICENSEINFOOBJECT;
    if (directObj) {
      obj = Array.isArray(directObj) ? directObj[0] : directObj;
    }
  }

  if (!obj) {
    throw new Error("Failed to parse license info from Tally response");
  }

  return {
    serialNumber: String(getSingleValue(obj.SERIALNUMBER) || "").trim(),
    remoteSerialNumber: String(getSingleValue(obj.REMOTESERIALNUMBER) || ""),
    accountId: String(getSingleValue(obj.ACCOUNTID) || ""),
    adminMailId: String(getSingleValue(obj.ADMINMAILID) || ""),
    isAdmin: String(getSingleValue(obj.ISADMIN)) === "true",
    isEducationalMode: String(getSingleValue(obj.ISEDUCATIONALMODE)) === "true",
    isSilver: String(getSingleValue(obj.ISSILVER)) === "true",
    isGold: String(getSingleValue(obj.ISGOLD)) === "true",
    planName: String(getSingleValue(obj.PLANNAME) || ""),
    isIndian: String(getSingleValue(obj.ISINDIAN)) === "true",
    isRemoteAccessMode: String(getSingleValue(obj.ISREMOTEACCESSMODE)) === "true",
    isLicClientMode: String(getSingleValue(obj.ISLICCLIENTMODE)) === "true",
    applicationPath: String(getSingleValue(obj.APPLICATIONPATH) || ""),
    dataPath: String(getSingleValue(obj.DATAPATH) || ""),
    userLevel: String(getSingleValue(obj.USERLEVEL) || ""),
    userName: String(getSingleValue(obj.USERNAME) || ""),
    tallyVersion: String(getSingleValue(obj.TALLYVERSION) || ""),
    tallyShortVersion: String(getSingleValue(obj.TALLYSHORTVERSION) || ""),
    isTallyPrime: String(getSingleValue(obj.IsTallyPrime ?? obj.ISTALLYPRIME)) === "true",
    isTallyPrimeEditLog: false,
    isTallyPrimeServer: false,
  };
}

/**
 * Parses Alter IDs
 */
export function parseLastAlterIds(xml: string): LastAlterIds {
  const parsed = parseRawXml(xml);
  const data = parsed?.ENVELOPE?.BODY?.DATA;
  
  // AlterIdsReport output
  const mastersLastId = Number(getSingleValue(data?.TC_ALTERIDSREPORT?.MastersLastId || 0));
  const vouchersLastId = Number(getSingleValue(data?.TC_ALTERIDSREPORT?.VouchersLastId || 0));

  return { mastersLastId, vouchersLastId };
}

/**
 * Extracts and maps lists of Ledgers, Groups, Companies, CostCentres, CostCategories, VoucherTypes
 */
export function parseExportCollection<T>(
  xml: string,
  type: "Ledger" | "Group" | "Company" | "Voucher" | "CostCentre" | "CostCategory" | "VoucherType" | "Unit" | "StockGroup" | "StockCategory" | "Godown" | "StockItem" | "Employee" | "EmployeeGroup" | "Currency" | "GSTRegistration" | "AttendanceType" | "Budget"
): T[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE;
  const collection = envelope?.BODY?.DATA?.COLLECTION || envelope;
  if (!collection) return [];

  let xmlTagName = type.toUpperCase();
  if (type === "Employee" || type === "EmployeeGroup") {
    xmlTagName = "COSTCENTRE";
  }
  if (type === "GSTRegistration") {
    xmlTagName = "TAXUNIT";
  }
  if (type === "AttendanceType") {
    xmlTagName = "ATTENDANCE";
  }
  
  // collection elements are always arrays because we registered them in isArray
  const rawList = collection[xmlTagName] || collection[type.toUpperCase()] || envelope?.BODY?.DATA?.[xmlTagName] || envelope?.BODY?.DATA?.[type.toUpperCase()] || [];
  
  return rawList.map((item: any) => {
    const base: any = {
      guid: getSingleValue(item.GUID),
      remoteId: getSingleValue(item.REMOTEALTGUID),
      masterId: item.MASTERID ? Number(getSingleValue(item.MASTERID)) : undefined,
      alterId: item.ALTERID ? Number(getSingleValue(item.ALTERID)) : undefined,
      enteredBy: getSingleValue(item.ENTEREDBY),
      alteredBy: getSingleValue(item.ALTEREDBY),
      canDelete: item.CANDELETE ? String(getSingleValue(item.CANDELETE)) === "Yes" : undefined,
    };

    if (type === "Ledger") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.group = String(getSingleValue(item.PARENT) || getSingleValue(item.GROUP) || "");
      base.openingBalance = parseTallyNumeric(item.OPENINGBALANCE);
      base.closingBalance = parseTallyNumeric(item.CLOSINGBALANCE);
      base.currency = getSingleValue(item.CURRENCY);
      base.taxType = getSingleValue(item.TAXTYPE);
      base.gstTaxType = getSingleValue(item.GSTTYPE);
      base.rateOfTax = parseTallyNumeric(item.RATEOFTAXCALCULATION);
      base.appropriateFor = getSingleValue(item.APPROPRIATEFOR);
      base.isBillWise = item.ISBILLWISEON ? String(getSingleValue(item.ISBILLWISEON)) === "Yes" : undefined;
      base.isCostCentresOn = item.ISCOSTCENTRESON ? String(getSingleValue(item.ISCOSTCENTRESON)) === "Yes" : undefined;
      base.isInterestOn = item.ISINTERESTON ? String(getSingleValue(item.ISINTERESTON)) === "Yes" : undefined;
      base.isCreditCheck = item.ISCREDITDAYSCHKON ? String(getSingleValue(item.ISCREDITDAYSCHKON)) === "Yes" : undefined;
      base.creditLimit = getSingleValue(item.CREDITLIMIT);
      base.email = getSingleValue(item.EMAIL);
      base.emailCc = getSingleValue(item.EMAILCC);
      base.website = getSingleValue(item.WEBSITE);
      base.panNumber = getSingleValue(item.INCOMETAXNUMBER);
      base.gstTypeOfSupply = getSingleValue(item.GSTTYPEOFSUPPLY);
      base.bankName = getSingleValue(item.BANKINGCONFIGBANK);
      base.accountNumber = getSingleValue(item.BANKDETAILS);
      base.bankBsrCode = getSingleValue(item.BANKBSRCODE);
      base.branchName = getSingleValue(item.BRANCHNAME);
      base.ifsCode = getSingleValue(item.IFSCODE);
      base.swiftCode = getSingleValue(item.SWIFTCODE);
      base.updatedAt = getSingleValue(item.UPDATEDDATETIME);
      base.phone = getSingleValue(item.LEDGERPHONE);
      base.mobile = getSingleValue(item.LEDGERMOBILE);
      base.contact = getSingleValue(item.LEDGERCONTACT);
      base.partyGstin = getSingleValue(item.PARTYGSTIN);
      
      // parse language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }

      // parse payment details
      if (item["PAYMENTDETAILS.LIST"]) {
        const payList = Array.isArray(item["PAYMENTDETAILS.LIST"]) ? item["PAYMENTDETAILS.LIST"] : [item["PAYMENTDETAILS.LIST"]];
        base.paymentDetails = payList.map((pay: any) => ({
          bankName: String(getSingleValue(pay.BANKNAME)),
          city: getSingleValue(pay.CITY),
          defaultTransactionType: getSingleValue(pay.DEFAULTTRANSACTIONTYPE),
          inFavour: getSingleValue(pay.PAYMENTFAVOURING),
          transactionName: getSingleValue(pay.TRANSACTIONNAME),
          chequeCrossComment: getSingleValue(pay.CHEQUECROSSCOMMENT),
          setAsDefault: pay.SETASDEFAULT ? String(getSingleValue(pay.SETASDEFAULT)) === "Yes" : undefined,
          bankAccountNo: getSingleValue(pay.ACCOUNTNUMBER),
          bankBranch: getSingleValue(pay.BANKBRANCH),
          ifsc: getSingleValue(pay.IFSCODE),
        }));
      }

      // parse mailing details
      if (item["LEDMAILINGDETAILS.LIST"]) {
        const mailList = Array.isArray(item["LEDMAILINGDETAILS.LIST"]) ? item["LEDMAILINGDETAILS.LIST"] : [item["LEDMAILINGDETAILS.LIST"]];
        base.mailingDetails = mailList.map((mail: any) => {
          const addList = mail["ADDRESS.LIST"]?.ADDRESS || [];
          return {
            addressLines: Array.isArray(addList) ? addList.map((line: any) => String(getSingleValue(line))) : [String(getSingleValue(addList))],
            applicableFrom: getSingleValue(mail.APPLICABLEFROM),
            mailingName: getSingleValue(mail.MAILINGNAME),
            country: getSingleValue(mail.COUNTRY),
            state: getSingleValue(mail.STATE),
            pinCode: getSingleValue(mail.PINCODE),
          };
        });
      }

      // parse gst registration details
      if (item["LEDGSTREGDETAILS.LIST"]) {
        const regList = Array.isArray(item["LEDGSTREGDETAILS.LIST"]) ? item["LEDGSTREGDETAILS.LIST"] : [item["LEDGSTREGDETAILS.LIST"]];
        base.gstRegistrationDetails = regList.map((reg: any) => ({
          applicableFrom: getSingleValue(reg.APPLICABLEFROM),
          gstRegistrationType: getSingleValue(reg.GSTREGISTRATIONTYPE),
          state: getSingleValue(reg.STATE),
          placeOfSupply: getSingleValue(reg.PLACEOFSUPPLY),
          isOtherTerritoryAssessee: reg.ISOTHTERRITORYASSESSEE ? String(getSingleValue(reg.ISOTHTERRITORYASSESSEE)) === "Yes" : undefined,
          considerPurchaseForExport: reg.CONSIDERPURCHASEFOREXPORT ? String(getSingleValue(reg.CONSIDERPURCHASEFOREXPORT)) === "Yes" : undefined,
          isTransporter: reg.ISTRANSPORTER ? String(getSingleValue(reg.ISTRANSPORTER)) === "Yes" : undefined,
          transporterId: getSingleValue(reg.TRANSPORTERID),
          isCommonParty: reg.ISCOMMONPARTY ? String(getSingleValue(reg.ISCOMMONPARTY)) === "Yes" : undefined,
          gstin: getSingleValue(reg.GSTIN),
        }));
      }

      // parse gst details
      if (item["GSTDETAILS.LIST"]) {
        const gstList = Array.isArray(item["GSTDETAILS.LIST"]) ? item["GSTDETAILS.LIST"] : [item["GSTDETAILS.LIST"]];
        base.gstDetails = gstList.map((gst: any) => {
          const mappingGst: any = {
            applicableFrom: getSingleValue(gst.APPLICABLEFROM),
            calculationType: getSingleValue(gst.CALCULATIONTYPE),
            calculateSlabOnMRP: gst.GSTCALCSLABONMRP ? String(getSingleValue(gst.GSTCALCSLABONMRP)) === "Yes" : undefined,
            natureOfTransaction: getSingleValue(gst.GSTNATUREOFTRANSACTION),
            isNonGSTGoods: gst.ISNONGSTGOODS ? String(getSingleValue(gst.ISNONGSTGOODS)) === "Yes" : undefined,
            taxability: getSingleValue(gst.TAXABILITY),
            sourceOfGSTDetails: getSingleValue(gst.SRCOFGSTDETAILS),
            isReverseChargeApplicable: gst.ISREVERSECHARGEAPPLICABLE ? String(getSingleValue(gst.ISREVERSECHARGEAPPLICABLE)) === "Yes" : undefined,
            isInEligibleForITC: gst.GSTINELIGIBLEITC ? String(getSingleValue(gst.GSTINELIGIBLEITC)) === "Yes" : undefined,
            includeExpForSlabCalc: gst.INCLUDEEXPFORSLABCALC ? String(getSingleValue(gst.INCLUDEEXPFORSLABCALC)) === "Yes" : undefined,
          };
          if (gst["STATEWISEDETAILS.LIST"]) {
            const swList = Array.isArray(gst["STATEWISEDETAILS.LIST"]) ? gst["STATEWISEDETAILS.LIST"] : [gst["STATEWISEDETAILS.LIST"]];
            mappingGst.stateWiseDetails = swList.map((sw: any) => {
              const swMapping: any = {
                stateName: getSingleValue(sw.STATENAME),
              };
              if (sw["RATEDETAILS.LIST"]) {
                const rdList = Array.isArray(sw["RATEDETAILS.LIST"]) ? sw["RATEDETAILS.LIST"] : [sw["RATEDETAILS.LIST"]];
                swMapping.rateDetails = rdList.map((rd: any) => ({
                  dutyHead: getSingleValue(rd.GSTRATEDUTYHEAD),
                  valuationType: getSingleValue(rd.GSTRATEVALUATIONTYPE),
                  gstRate: parseTallyNumeric(rd.GSTRATE) ?? 0,
                }));
              }
              return swMapping;
            });
          }
          return mappingGst;
        });
      }

      // parse hsn details
      if (item["HSNDETAILS.LIST"]) {
        const hsnList = Array.isArray(item["HSNDETAILS.LIST"]) ? item["HSNDETAILS.LIST"] : [item["HSNDETAILS.LIST"]];
        base.hsnDetails = hsnList.map((hsn: any) => ({
          applicableFrom: getSingleValue(hsn.APPLICABLEFROM),
          hsnDescription: getSingleValue(hsn.HSN),
          hsnCode: getSingleValue(hsn.HSNCODE),
          hsnClassificationName: getSingleValue(hsn.HSNCLASSIFICATIONNAME),
          source: getSingleValue(hsn.SRCOFHSNDETAILS),
        }));
      }

      // parse multiple addresses
      if (item["LEDMULTIADDRESSLIST.LIST"]) {
        const addrList = Array.isArray(item["LEDMULTIADDRESSLIST.LIST"]) ? item["LEDMULTIADDRESSLIST.LIST"] : [item["LEDMULTIADDRESSLIST.LIST"]];
        base.addresses = addrList.map((addr: any) => {
          const addList = addr["ADDRESS.LIST"]?.ADDRESS || [];
          const mappingAddr: any = {
            addressName: String(getSingleValue(addr.MAILINGNAME)),
            addressLines: Array.isArray(addList) ? addList.map((line: any) => String(getSingleValue(line))) : [String(getSingleValue(addList))],
            country: getSingleValue(addr.COUNTRYNAME),
            state: getSingleValue(addr.LEDSTATENAME),
            pinCode: getSingleValue(addr.PINCODE),
            contactPerson: getSingleValue(addr.CONTACTPERSON),
            mobileNo: getSingleValue(addr.MOBILENUMBER),
            phoneNumber: getSingleValue(addr.PHONENUMBER),
            faxNumber: getSingleValue(addr.FAXNUMBER),
            email: getSingleValue(addr.EMAIL),
            panNumber: getSingleValue(addr.INCOMETAXNUMBER),
            vatNumber: getSingleValue(addr.VATTINNUMBER),
            cstNumber: getSingleValue(addr.INTERSTATESTNUMBER),
            exciseNatureOfPurchase: getSingleValue(addr.EXCISENATUREOFPURCHASE),
            exciseRegistrationNo: getSingleValue(addr.EXCISEREGNO),
            exciseImportRegistrationNo: getSingleValue(addr.EXCISEIMPORTSREGISTARTIONNO),
            importExportCode: getSingleValue(addr.IMPORTEREXPORTERCODE),
            gstDealerType: getSingleValue(addr.GSTREGISTRATIONTYPE),
            isOtherTerritoryAssessee: addr.ISOTHTERRITORYASSESSEE ? String(getSingleValue(addr.ISOTHTERRITORYASSESSEE)) === "Yes" : undefined,
            gstin: getSingleValue(addr.PARTYGSTIN),
          };
          if (addr["EXCISEJURISDICTIONDETAILS.LIST"]) {
            const exList = Array.isArray(addr["EXCISEJURISDICTIONDETAILS.LIST"]) ? addr["EXCISEJURISDICTIONDETAILS.LIST"] : [addr["EXCISEJURISDICTIONDETAILS.LIST"]];
            mappingAddr.exciseJurisdictions = exList.map((ex: any) => ({
              applicableFrom: getSingleValue(ex.APPLICABLEFROM),
              range: getSingleValue(ex.RANGE),
              division: getSingleValue(ex.DIVISION),
              commissionerate: getSingleValue(ex.COMMISSIONERATE),
            }));
          }
          return mappingAddr;
        });
      }

      // Highly optimized single-pass flattening fallback for state and partyGstin
      const flatObj = flattenObject(item);
      if (!base.partyGstin) {
        base.partyGstin = getOptimizedValue(flatObj, "gstin") || undefined;
      }
      if (!base.state) {
        base.state = getOptimizedValue(flatObj, "state") || undefined;
      }
    } else if (type === "Group") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.parent = String(getSingleValue(item.PARENT) || "");
      base.reservedName = getSingleValue(item.RESERVEDNAME);
      base.isRevenue = item.ISREVENUE ? String(getSingleValue(item.ISREVENUE)) === "Yes" : undefined;
      base.isDeemedPositive = item.ISDEEMEDPOSITIVE ? String(getSingleValue(item.ISDEEMEDPOSITIVE)) === "Yes" : undefined;
      base.affectGrossProfit = item.AFFECTSGROSSPROFIT ? String(getSingleValue(item.AFFECTSGROSSPROFIT)) === "Yes" : undefined;
      base.isSubledger = item.ISSUBLEDGER ? String(getSingleValue(item.ISSUBLEDGER)) === "Yes" : undefined;
      base.sortPosition = parseTallyNumeric(item.SORTPOSITION);
      base.addlAllocType = getSingleValue(item.ADDLALLOCTYPE);
      base.isCalculable = item.BASICGROUPISCALCULABLE ? String(getSingleValue(item.BASICGROUPISCALCULABLE)) === "Yes" : undefined;
      base.isAddable = item.ISADDABLE ? String(getSingleValue(item.ISADDABLE)) === "Yes" : undefined;

      // parse language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    } else if (type === "Company") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.startingFrom = getSingleValue(item.STARTINGFROM);
      base.booksBeginningFrom = getSingleValue(item.BOOKSFROM || item.BOOKSBEGINNINGFROM);
      base.formalName = getSingleValue(item.BASICCOMPANYFORMALNAME);
      base.state = getSingleValue(item.STATENAME);
      base.country = getSingleValue(item.COUNTRYNAME);
      base.pinCode = getSingleValue(item.PINCODE);
      base.phoneNumber = getSingleValue(item.PHONENUMBER);
      base.mobileNumber = getSingleValue(item.MOBILENO);
      base.address = getSingleValue(item.REMOTEFULLLISTNAME);
      base.faxNumber = getSingleValue(item.FAXNUMBER);
      base.email = getSingleValue(item.EMAIL);
      base.website = getSingleValue(item.WEBSITE);
      base.tanNumber = getSingleValue(item.TANUMBER);
      base.tanRegNumber = getSingleValue(item.TANREGNO);
      base.pan = getSingleValue(item.INCOMETAXNUMBER);
      base.cin = getSingleValue(item.CORPORATEIDENTITYNO);
      base.isInventoryOn = item.ISINVENTORYON ? String(getSingleValue(item.ISINVENTORYON)) === "Yes" : undefined;
      base.integrateAccountswithInventory = item.ISINTEGRATED ? String(getSingleValue(item.ISINTEGRATED)) === "Yes" : undefined;
      base.isBillWiseOn = item.ISBILLWISEON ? String(getSingleValue(item.ISBILLWISEON)) === "Yes" : undefined;
      base.isCostCentersOn = item.ISCOSTCENTRESON ? String(getSingleValue(item.ISCOSTCENTRESON)) === "Yes" : undefined;
      base.isTDSOn = item.ISTDSON ? String(getSingleValue(item.ISTDSON)) === "Yes" : undefined;
      base.isTCSOn = item.ISTCSON ? String(getSingleValue(item.ISTCSON)) === "Yes" : undefined;
      base.isGSTOn = item.ISGSTON ? String(getSingleValue(item.ISGSTON)) === "Yes" : undefined;
      base.isPayrollOn = item.ISPAYROLLON ? String(getSingleValue(item.ISPAYROLLON)) === "Yes" : undefined;
      base.isInterestOn = item.ISINTERESTON ? String(getSingleValue(item.ISINTERESTON)) === "Yes" : undefined;
    } else if (type === "CostCentre") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.category = getSingleValue(item.CATEGORY);
      base.parent = getSingleValue(item.PARENT);
      base.emailId = getSingleValue(item.EMAILID);
      base.showOpeningBal = item.REVENUELEDFOROPBAL ? String(getSingleValue(item.REVENUELEDFOROPBAL)) === "Yes" : undefined;

      // parse language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    } else if (type === "CostCategory") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.allocateRevenue = item.ALLOCATEREVENUE ? String(getSingleValue(item.ALLOCATEREVENUE)) === "Yes" : undefined;
      base.allocateNonRevenue = item.ALLOCATENONREVENUE ? String(getSingleValue(item.ALLOCATENONREVENUE)) === "Yes" : undefined;

      // parse language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    } else if (type === "VoucherType") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.parent = getSingleValue(item.PARENT);
      base.numberingMethod = getSingleValue(item.NUMBERINGMETHOD);
      base.useZeroEntries = item.USEZEROENTRIES ? String(getSingleValue(item.USEZEROENTRIES)) === "Yes" : undefined;
      base.isActive = item.ISACTIVE ? String(getSingleValue(item.ISACTIVE)) === "Yes" : undefined;
      base.printAfterSave = item.PRINTAFTERSAVE ? String(getSingleValue(item.PRINTAFTERSAVE)) === "Yes" : undefined;
      base.useforPOSInvoice = item.USEFORPOSINVOICE ? String(getSingleValue(item.USEFORPOSINVOICE)) === "Yes" : undefined;
      base.vchPrintBankName = getSingleValue(item.VCHPRINTBANKNAME);
      base.vchPrintTitle = getSingleValue(item.VCHPRINTTITLE);
      base.taxUnitName = getSingleValue(item.TAXUNITNAME);
      base.vchPrintJurisdiction = getSingleValue(item.VCHPRINTJURISDICTION);
      base.isOptional = item.ISOPTIONAL ? String(getSingleValue(item.ISOPTIONAL)) === "Yes" : undefined;
      base.commonNarration = item.COMMONNARRATION ? String(getSingleValue(item.COMMONNARRATION)) === "Yes" : undefined;
      base.multiNarration = item.MULTINARRATION ? String(getSingleValue(item.MULTINARRATION)) === "Yes" : undefined;
      base.isDefaultAllocationEnabled = item.ISDEFAULTALLOCENABLED ? String(getSingleValue(item.ISDEFAULTALLOCENABLED)) === "Yes" : undefined;
      base.effectStock = item.AFFECTSSTOCK ? String(getSingleValue(item.AFFECTSSTOCK)) === "Yes" : undefined;
      base.asMfgJrnl = item.ASMFGJRNL ? String(getSingleValue(item.ASMFGJRNL)) === "Yes" : undefined;
      base.useforJobwork = item.USEFORJOBWORK ? String(getSingleValue(item.USEFORJOBWORK)) === "Yes" : undefined;
      base.isforJobworkIn = item.ISFORJOBWORKIN ? String(getSingleValue(item.ISFORJOBWORKIN)) === "Yes" : undefined;
      base.defaultVoucherCategory = getSingleValue(item.DEFAULTVOUCHERCATEGORY);
      base.coreVoucherType = getSingleValue(item.COREVOUCHERTYPE);

      // parse language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }

      if (item["VOUCHERCLASSLIST.LIST"]) {
        const classes = Array.isArray(item["VOUCHERCLASSLIST.LIST"])
          ? item["VOUCHERCLASSLIST.LIST"]
          : [item["VOUCHERCLASSLIST.LIST"]];
        base.voucherClasses = classes.map((vc: any) => {
          const mappingClass: any = {
            className: String(getSingleValue(vc.CLASSNAME)),
            posCardLedger: getSingleValue(vc.POSCARDLEDGER),
            posCashLedger: getSingleValue(vc.POSCASHLEDGER),
            posGiftLedger: getSingleValue(vc.POSGIFTLEDGER),
            posChequeLedger: getSingleValue(vc.POSCHEQUELEDGER),
            forJobCosting: vc.FORJOBCOSTING ? String(getSingleValue(vc.FORJOBCOSTING)) === "Yes" : undefined,
            useforInterest: vc.USEFORINTEREST ? String(getSingleValue(vc.USEFORINTEREST)) === "Yes" : undefined,
            useforGainLoss: vc.USEFORGAINLOSS ? String(getSingleValue(vc.USEFORGAINLOSS)) === "Yes" : undefined,
            useforGodownTransfer: vc.USEFORGODOWNTRANSFER ? String(getSingleValue(vc.USEFORGODOWNTRANSFER)) === "Yes" : undefined,
            useforCompound: vc.USEFORCOMPOUND ? String(getSingleValue(vc.USEFORCOMPOUND)) === "Yes" : undefined,
            classforVAT: vc.CLASSFORVAT ? String(getSingleValue(vc.CLASSFORVAT)) === "Yes" : undefined,
            useforFBT: vc.USEFORFBT ? String(getSingleValue(vc.USEFORFBT)) === "Yes" : undefined,
            posEnableCardLedger: vc.POSENABLECARDLEDGER ? String(getSingleValue(vc.POSENABLECARDLEDGER)) === "Yes" : undefined,
            posEnableCashLedger: vc.POSENABLECASHLEDGER ? String(getSingleValue(vc.POSENABLECASHLEDGER)) === "Yes" : undefined,
            posEnableGiftLedger: vc.POSENABLEGIFTLEDGER ? String(getSingleValue(vc.POSENABLEGIFTLEDGER)) === "Yes" : undefined,
            posEnableChequeLedger: vc.POSENABLECHEQUELEDGER ? String(getSingleValue(vc.POSENABLECHEQUELEDGER)) === "Yes" : undefined,
            useforExciseCommercialInvoice: vc.USEFOREXCISECOMMERCIALINVOICE ? String(getSingleValue(vc.USEFOREXCISECOMMERCIALINVOICE)) === "Yes" : undefined,
            useforServiceTax: vc.USEFORSERVICETAX ? String(getSingleValue(vc.USEFORSERVICETAX)) === "Yes" : undefined,
            classforExcise: vc.CLASSFOREXCISE ? String(getSingleValue(vc.CLASSFOREXCISE)) === "Yes" : undefined,
            classforDealerExciseShortage: vc.CLASSFORDEALEREXCISESHORTAGE ? String(getSingleValue(vc.CLASSFORDEALEREXCISESHORTAGE)) === "Yes" : undefined,
            posEnableOnAccountLedger: vc.POSENABLEONACCOUNTLEDGER ? String(getSingleValue(vc.POSENABLEONACCOUNTLEDGER)) === "Yes" : undefined,
            useBankAllocforcc: vc.USEBANKALLOCFORCC ? String(getSingleValue(vc.USEBANKALLOCFORCC)) === "Yes" : undefined,
            isDefaultClass: vc.ISDEFAULTCLASS ? String(getSingleValue(vc.ISDEFAULTCLASS)) === "Yes" : undefined,
            adjDiffinFirstLedger: vc.ADJDIFFINFIRSTLEDGER ? String(getSingleValue(vc.ADJDIFFINFIRSTLEDGER)) === "Yes" : undefined,
            adjDiffinFirstLedgerItem: vc.ADJDIFFINFIRSTLEDGERITEM ? String(getSingleValue(vc.ADJDIFFINFIRSTLEDGERITEM)) === "Yes" : undefined,
          };
          if (vc["LEDGERFORINVENTORYLIST.LIST"]) {
            const ledList = Array.isArray(vc["LEDGERFORINVENTORYLIST.LIST"])
              ? vc["LEDGERFORINVENTORYLIST.LIST"]
              : [vc["LEDGERFORINVENTORYLIST.LIST"]];
            mappingClass.ledgersforInventory = ledList.map((l: any) => ({
              name: String(getSingleValue(l.NAME)),
              roundType: getSingleValue(l.ROUNDTYPE),
              gstClassificationNature: getSingleValue(l.GSTCLASSIFICATIONNATURE),
              methodType: getSingleValue(l.METHODTYPE),
              classRate: getSingleValue(l.CLASSRATE),
              ledgerFromItem: String(getSingleValue(l.LEDGERFROMITEM)) === "Yes",
              removeZeroEntries: String(getSingleValue(l.REMOVEZEROENTRIES)) === "Yes",
              roundLimit: parseTallyNumeric(l.ROUNDLIMIT),
            }));
          }
          if (vc["LEDGERENTRIESLIST.LIST"]) {
            const ledList = Array.isArray(vc["LEDGERENTRIESLIST.LIST"])
              ? vc["LEDGERENTRIESLIST.LIST"]
              : [vc["LEDGERENTRIESLIST.LIST"]];
            mappingClass.ledgerEntries = ledList.map((l: any) => ({
              name: String(getSingleValue(l.NAME)),
              roundType: getSingleValue(l.ROUNDTYPE),
              gstClassificationNature: getSingleValue(l.GSTCLASSIFICATIONNATURE),
              methodType: getSingleValue(l.METHODTYPE),
              classRate: getSingleValue(l.CLASSRATE),
              ledgerFromItem: String(getSingleValue(l.LEDGERFROMITEM)) === "Yes",
              removeZeroEntries: String(getSingleValue(l.REMOVEZEROENTRIES)) === "Yes",
              roundLimit: parseTallyNumeric(l.ROUNDLIMIT),
            }));
          }
          if (vc["DEFAULTACCALLOCFORITEM.LIST"]) {
            const stockList = Array.isArray(vc["DEFAULTACCALLOCFORITEM.LIST"])
              ? vc["DEFAULTACCALLOCFORITEM.LIST"]
              : [vc["DEFAULTACCALLOCFORITEM.LIST"]];
            mappingClass.stockEntries = stockList.map((se: any) => {
              const seMapping: any = {
                stockItemName: String(getSingleValue(se.STOCKITEMNAME)),
                ledgerFromItem: String(getSingleValue(se.LEDGERFROMITEM)) === "Yes",
              };
              if (se["DEFAULTACCALLOCFORITEM.LIST"]) {
                const subL = Array.isArray(se["DEFAULTACCALLOCFORITEM.LIST"])
                  ? se["DEFAULTACCALLOCFORITEM.LIST"]
                  : [se["DEFAULTACCALLOCFORITEM.LIST"]];
                seMapping.ledgerEntries = subL.map((l: any) => ({
                  name: String(getSingleValue(l.NAME)),
                  roundType: getSingleValue(l.ROUNDTYPE),
                  gstClassificationNature: getSingleValue(l.GSTCLASSIFICATIONNATURE),
                  methodType: getSingleValue(l.METHODTYPE),
                  classRate: getSingleValue(l.CLASSRATE),
                  ledgerFromItem: String(getSingleValue(l.LEDGERFROMITEM)) === "Yes",
                  removeZeroEntries: String(getSingleValue(l.REMOVEZEROENTRIES)) === "Yes",
                  roundLimit: parseTallyNumeric(l.ROUNDLIMIT),
                }));
              }
              return seMapping;
            });
          }
          return mappingClass;
        });
      }
    } else if (type === "Voucher") {
      base.date = getSingleValue(item.DATE);
      base.voucherType = getSingleValue(item.VOUCHERTYPENAME);
      base.voucherNumber = getSingleValue(item.VOUCHERNUMBER);
      base.narration = getSingleValue(item.NARRATION);
      base.reference = getSingleValue(item.REFERENCE);
      base.referenceDate = getSingleValue(item.REFERENCEDATE);
      base.partyName = getSingleValue(item.PARTYLEDGERNAME);
      base.partyGSTIN = getSingleValue(item.PARTYGSTIN);
      base.partyGSTRegistrationType = getSingleValue(item.GSTREGISTRATIONTYPE);
      base.gstRegistration = getSingleValue(item.GSTREGISTRATION);
      base.placeOfSupply = getSingleValue(item.PLACEOFSUPPLY);
      base.consigneeName = getSingleValue(item.CONSIGNEENAME);
      base.consigneeGSTIN = getSingleValue(item.CONSIGNEEGSTIN);
      base.consigneeState = getSingleValue(item.CONSIGNEESTATENAME);
      base.voucherGSTClass = getSingleValue(item.VCHGSTCLASS);
      base.isInvoice = parseTallyBoolean(item.ISINVOICE);
      base.isOptional = parseTallyBoolean(item.ISOPTIONAL);
      base.effectiveDate = getSingleValue(item.EFFECTIVEDATE);
      base.viewType = getSingleValue(item.VOUCHERVIEWTYPE);

      if (item["EWAYBILLDETAILS.LIST"]) {
        const eway = asArray(item["EWAYBILLDETAILS.LIST"])[0] as any;
        base.ewayBillDetails = {
          billNumber: getSingleValue(eway.BILLNUMBER),
          billDate: getSingleValue(eway.BILLDATE),
          billStatus: getSingleValue(eway.BILLSTATUS),
          consignorPlace: getSingleValue(eway.CONSIGNORPLACE),
          consignorState: getSingleValue(eway.CONSIGNORSTATE),
          consigneePlace: getSingleValue(eway.CONSIGNEEPLACE),
          consigneeState: getSingleValue(eway.CONSIGNEESTATE),
          transporterName: getSingleValue(eway.TRANSPORTERNAME),
          transporterId: getSingleValue(eway.TRANSPORTERID),
          distance: parseTallyNumeric(eway.DISTANCE),
          vehicleNumber: getSingleValue(eway.VEHICLENUMBER),
          vehicleType: getSingleValue(eway.VEHICLETYPE),
        };
      }

      // Parse Ledger Entries
      const ledgerEntriesNode = item["ALLLEDGERENTRIES.LIST"] || item["LEDGERENTRIES.LIST"];
      if (ledgerEntriesNode) {
        const rawEntries = asArray(ledgerEntriesNode);
        
        base.ledgerEntries = rawEntries.map((e: any) => ({
          ledgerName: String(getSingleValue(e.LEDGERNAME)),
          amount: parseTallyNumeric(e.AMOUNT) ?? 0,
          isDeemedPositive: parseTallyBoolean(e.ISDEEMEDPOSITIVE) ?? false,
          isPartyLedger: parseTallyBoolean(e.ISPARTYLEDGER),
          billAllocations: e["BILLALLOCATIONS.LIST"] ? asArray(e["BILLALLOCATIONS.LIST"]).map((b: any) => ({
            name: String(getSingleValue(b.NAME) || ""),
            billType: getSingleValue(b.BILLTYPE),
            amount: parseTallyNumeric(b.AMOUNT) ?? 0,
            dueDate: getSingleValue(b.BILLCREDITPERIOD),
          })) : undefined,
          costCentreAllocations: e["CATEGORYALLOCATIONS.LIST"] ? asArray(e["CATEGORYALLOCATIONS.LIST"]).flatMap((cat: any) => {
            const category = getSingleValue(cat.CATEGORY);
            return asArray(cat["COSTCENTREALLOCATIONS.LIST"]).map((cc: any) => ({
              category,
              name: String(getSingleValue(cc.NAME) || ""),
              amount: parseTallyNumeric(cc.AMOUNT) ?? 0,
            }));
          }) : undefined,
        }));
      }

      // Parse Inventory Entries
      const inventoryEntriesNode = item["ALLINVENTORYENTRIES.LIST"] || item["INVENTORYENTRIES.LIST"];
      if (inventoryEntriesNode) {
        const rawInv = asArray(inventoryEntriesNode);
        
        base.inventoryAllocations = rawInv.map((inv: any) => ({
          stockItemName: String(getSingleValue(inv.STOCKITEMNAME)),
          quantity: getSingleValue(inv.ACTUALQUANTITY ?? inv.BILLEDQUANTITY),
          actualQuantity: getSingleValue(inv.ACTUALQUANTITY),
          billedQuantity: getSingleValue(inv.BILLEDQUANTITY),
          rate: getSingleValue(inv.RATE),
          amount: parseTallyNumeric(inv.AMOUNT) ?? 0,
          isDeemedPositive: parseTallyBoolean(inv.ISDEEMEDPOSITIVE) ?? false,
          accountingAllocations: inv["ACCOUNTINGALLOCATIONS.LIST"] ? asArray(inv["ACCOUNTINGALLOCATIONS.LIST"]).map((a: any) => ({
            ledgerName: String(getSingleValue(a.LEDGERNAME) || ""),
            amount: parseTallyNumeric(a.AMOUNT) ?? 0,
            isDeemedPositive: parseTallyBoolean(a.ISDEEMEDPOSITIVE),
          })) : undefined,
          batchAllocations: inv["BATCHALLOCATIONS.LIST"] ? asArray(inv["BATCHALLOCATIONS.LIST"]).map((b: any) => ({
            godownName: String(getSingleValue(b.GODOWNNAME) || ""),
            batchName: getSingleValue(b.BATCHNAME),
            orderNo: getSingleValue(b.ORDERNO),
            trackingNumber: getSingleValue(b.TRACKINGNUMBER),
            actualQuantity: getSingleValue(b.ACTUALQTY ?? b.ACTUALQUANTITY),
            billedQuantity: getSingleValue(b.BILLEDQTY ?? b.BILLEDQUANTITY),
            rate: getSingleValue(b.RATE),
            amount: b.AMOUNT ? parseTallyNumeric(b.AMOUNT) : undefined,
          })) : undefined,
          gstRateDetails: inv["GSTRATEDETAILS.LIST"] ? asArray(inv["GSTRATEDETAILS.LIST"]).map((g: any) => ({
            dutyHead: getSingleValue(g.GSTRATEDUTYHEAD),
            valuationType: getSingleValue(g.GSTRATEVALUATIONTYPE),
            rate: parseTallyNumeric(g.GSTRATE),
          })) : undefined,
        }));
        base.allInventoryEntries = base.inventoryAllocations;
      }
    } else if (type === "Unit") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.formalName = getSingleValue(item.ORIGINALNAME);
      base.baseUnit = getSingleValue(item.BASEUNITS);
      base.additionalUnits = getSingleValue(item.ADDITIONALUNITS);
      base.uqc = getSingleValue(item.GSTREPUOM);
      base.decimalPlaces = parseTallyNumeric(item.DECIMALPLACES);
      base.isSimpleUnit = item.ISSIMPLEUNIT ? String(getSingleValue(item.ISSIMPLEUNIT)) === "Yes" : undefined;
      base.isGstExcluded = item.ISGSTEXCLUDED ? String(getSingleValue(item.ISGSTEXCLUDED)) === "Yes" : undefined;
      base.conversion = parseTallyNumeric(item.CONVERSION);
    } else if (type === "StockGroup") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.parent = getSingleValue(item.PARENT);
      base.isAddable = item.ISADDABLE ? String(getSingleValue(item.ISADDABLE)) === "Yes" : undefined;
      base.gstApplicability = getSingleValue(item.GSTAPPLICABLE);
      base.baseUnit = getSingleValue(item.BASEUNITS);
      
      // language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }

      // gst details
      if (item["GSTDETAILS.LIST"]) {
        const gstList = Array.isArray(item["GSTDETAILS.LIST"]) ? item["GSTDETAILS.LIST"] : [item["GSTDETAILS.LIST"]];
        base.gstDetails = gstList.map((gst: any) => {
          const mappingGst: any = {
            applicableFrom: getSingleValue(gst.APPLICABLEFROM),
            calculationType: getSingleValue(gst.CALCULATIONTYPE),
            calculateSlabOnMRP: gst.GSTCALCSLABONMRP ? String(getSingleValue(gst.GSTCALCSLABONMRP)) === "Yes" : undefined,
            natureOfTransaction: getSingleValue(gst.GSTNATUREOFTRANSACTION),
            isNonGSTGoods: gst.ISNONGSTGOODS ? String(getSingleValue(gst.ISNONGSTGOODS)) === "Yes" : undefined,
            taxability: getSingleValue(gst.TAXABILITY),
            sourceOfGSTDetails: getSingleValue(gst.SRCOFGSTDETAILS),
            isReverseChargeApplicable: gst.ISREVERSECHARGEAPPLICABLE ? String(getSingleValue(gst.ISREVERSECHARGEAPPLICABLE)) === "Yes" : undefined,
            isInEligibleForITC: gst.GSTINELIGIBLEITC ? String(getSingleValue(gst.GSTINELIGIBLEITC)) === "Yes" : undefined,
            includeExpForSlabCalc: gst.INCLUDEEXPFORSLABCALC ? String(getSingleValue(gst.INCLUDEEXPFORSLABCALC)) === "Yes" : undefined,
          };
          if (gst["STATEWISEDETAILS.LIST"]) {
            const swList = Array.isArray(gst["STATEWISEDETAILS.LIST"]) ? gst["STATEWISEDETAILS.LIST"] : [gst["STATEWISEDETAILS.LIST"]];
            mappingGst.stateWiseDetails = swList.map((sw: any) => {
              const swMapping: any = {
                stateName: getSingleValue(sw.STATENAME),
              };
              if (sw["RATEDETAILS.LIST"]) {
                const rdList = Array.isArray(sw["RATEDETAILS.LIST"]) ? sw["RATEDETAILS.LIST"] : [sw["RATEDETAILS.LIST"]];
                swMapping.rateDetails = rdList.map((rd: any) => ({
                  dutyHead: getSingleValue(rd.GSTRATEDUTYHEAD),
                  valuationType: getSingleValue(rd.GSTRATEVALUATIONTYPE),
                  gstRate: parseTallyNumeric(rd.GSTRATE) ?? 0,
                }));
              }
              return swMapping;
            });
          }
          return mappingGst;
        });
      }
    } else if (type === "StockCategory") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.parent = getSingleValue(item.PARENT);
      
      // language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    } else if (type === "Godown") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.parent = getSingleValue(item.PARENT);
      
      // language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    } else if (type === "StockItem") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.baseUnit = String(getSingleValue(item.BASEUNITS) || "");
      base.stockGroup = getSingleValue(item.PARENT);
      base.stockCategory = getSingleValue(item.CATEGORY);
      base.gstApplicable = getSingleValue(item.GSTAPPLICABLE);
      base.gstTypeOfSupply = getSingleValue(item.GSTTYPEOFSUPPLY);
      base.tcsApplicable = getSingleValue(item.TCSAPPLICABLE);
      base.description = getSingleValue(item.DESCRIPTION);
      base.narration = getSingleValue(item.NARRATION);
      base.costingMethod = getSingleValue(item.COSTINGMETHOD);
      base.valuationMethod = getSingleValue(item.VALUATIONMETHOD);
      base.isCostTracking = item.ISCOSTTRACKINGON ? String(getSingleValue(item.ISCOSTTRACKINGON)) === "Yes" : undefined;
      base.isCostCentresOn = item.ISCOSTCENTRESON ? String(getSingleValue(item.ISCOSTCENTRESON)) === "Yes" : undefined;
      base.maintainInBranches = item.ISBATCHWISEON ? String(getSingleValue(item.ISBATCHWISEON)) === "Yes" : undefined;
      base.useExpiryDates = item.ISPERISHABLEON ? String(getSingleValue(item.ISPERISHABLEON)) === "Yes" : undefined;
      base.trackDateOfManufacturing = item.HASMFGDATE ? String(getSingleValue(item.HASMFGDATE)) === "Yes" : undefined;
      base.additionalUnits = getSingleValue(item.ADDITIONALUNITS);
      base.inclusiveOfTax = item.INCLUSIVETAX ? String(getSingleValue(item.INCLUSIVETAX)) === "Yes" : undefined;
      base.denominator = item.DENOMINATOR ? parseTallyNumeric(item.DENOMINATOR) : undefined;
      base.conversion = item.CONVERSION ? parseTallyNumeric(item.CONVERSION) : undefined;
      base.rateOfDuty = getSingleValue(item.BASICRATEOFEXCISE);
      base.openingBalance = item.OPENINGBALANCE ? parseTallyNumeric(item.OPENINGBALANCE) : undefined;
      base.openingRate = item.OPENINGRATE ? parseTallyNumeric(item.OPENINGRATE) : undefined;
      base.openingValue = item.OPENINGVALUE ? parseTallyNumeric(item.OPENINGVALUE) : undefined;

      // language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }

      // parse mailing names
      if (item["MAILINGNAME.LIST"]) {
        const mailList = Array.isArray(item["MAILINGNAME.LIST"]) ? item["MAILINGNAME.LIST"] : [item["MAILINGNAME.LIST"]];
        const names: string[] = [];
        for (const m of mailList) {
          if (m && typeof m === "object") {
            const mVal = m.MAILINGNAME;
            if (Array.isArray(mVal)) {
              names.push(...mVal.map(x => String(getSingleValue(x))));
            } else if (mVal !== undefined) {
              names.push(String(getSingleValue(mVal)));
            }
          } else if (m !== undefined) {
            names.push(String(getSingleValue(m)));
          }
        }
        base.mailingNames = names;
      }

      // gst details
      if (item["GSTDETAILS.LIST"]) {
        const gstList = Array.isArray(item["GSTDETAILS.LIST"]) ? item["GSTDETAILS.LIST"] : [item["GSTDETAILS.LIST"]];
        base.gstDetails = gstList.map((gst: any) => {
          const mappingGst: any = {
            applicableFrom: getSingleValue(gst.APPLICABLEFROM),
            calculationType: getSingleValue(gst.CALCULATIONTYPE),
            calculateSlabOnMRP: gst.GSTCALCSLABONMRP ? String(getSingleValue(gst.GSTCALCSLABONMRP)) === "Yes" : undefined,
            natureOfTransaction: getSingleValue(gst.GSTNATUREOFTRANSACTION),
            isNonGSTGoods: gst.ISNONGSTGOODS ? String(getSingleValue(gst.ISNONGSTGOODS)) === "Yes" : undefined,
            taxability: getSingleValue(gst.TAXABILITY),
            sourceOfGSTDetails: getSingleValue(gst.SRCOFGSTDETAILS),
            isReverseChargeApplicable: gst.ISREVERSECHARGEAPPLICABLE ? String(getSingleValue(gst.ISREVERSECHARGEAPPLICABLE)) === "Yes" : undefined,
            isInEligibleForITC: gst.GSTINELIGIBLEITC ? String(getSingleValue(gst.GSTINELIGIBLEITC)) === "Yes" : undefined,
            includeExpForSlabCalc: gst.INCLUDEEXPFORSLABCALC ? String(getSingleValue(gst.INCLUDEEXPFORSLABCALC)) === "Yes" : undefined,
          };
          if (gst["STATEWISEDETAILS.LIST"]) {
            const swList = Array.isArray(gst["STATEWISEDETAILS.LIST"]) ? gst["STATEWISEDETAILS.LIST"] : [gst["STATEWISEDETAILS.LIST"]];
            mappingGst.stateWiseDetails = swList.map((sw: any) => {
              const swMapping: any = {
                stateName: getSingleValue(sw.STATENAME),
              };
              if (sw["RATEDETAILS.LIST"]) {
                const rdList = Array.isArray(sw["RATEDETAILS.LIST"]) ? sw["RATEDETAILS.LIST"] : [sw["RATEDETAILS.LIST"]];
                swMapping.rateDetails = rdList.map((rd: any) => ({
                  dutyHead: getSingleValue(rd.GSTRATEDUTYHEAD),
                  valuationType: getSingleValue(rd.GSTRATEVALUATIONTYPE),
                  gstRate: parseTallyNumeric(rd.GSTRATE) || 0,
                }));
              }
              return swMapping;
            });
          }
          return mappingGst;
        });
      }

      // hsn details
      if (item["HSNDETAILS.LIST"]) {
        const hsnList = Array.isArray(item["HSNDETAILS.LIST"]) ? item["HSNDETAILS.LIST"] : [item["HSNDETAILS.LIST"]];
        base.hsnDetails = hsnList.map((hsn: any) => ({
          applicableFrom: getSingleValue(hsn.APPLICABLEFROM),
          hsnDescription: getSingleValue(hsn.HSN),
          hsnCode: getSingleValue(hsn.HSNCODE),
          hsnClassificationName: getSingleValue(hsn.HSNCLASSIFICATIONNAME),
          source: getSingleValue(hsn.SRCOFHSNDETAILS),
        }));
      }

      // opening batch allocations
      if (item["BATCHALLOCATIONS.LIST"]) {
        const batchList = Array.isArray(item["BATCHALLOCATIONS.LIST"]) ? item["BATCHALLOCATIONS.LIST"] : [item["BATCHALLOCATIONS.LIST"]];
        base.openingBatchAllocations = batchList.map((ba: any) => ({
          batchName: getSingleValue(ba.BATCHNAME),
          godownName: String(getSingleValue(ba.GODOWNNAME) || ""),
          name: getSingleValue(ba.NAME),
          manufacturingDate: getSingleValue(ba.MFDON),
          expiryPeriod: getSingleValue(ba.EXPIRYPERIOD),
          quantity: ba.OPENINGBALANCE ? parseTallyNumeric(ba.OPENINGBALANCE) : undefined,
          rate: ba.OPENINGRATE ? parseTallyNumeric(ba.OPENINGRATE) : undefined,
          value: ba.OPENINGVALUE ? parseTallyNumeric(ba.OPENINGVALUE) : undefined,
        }));
      }

      // components BOM
      if (item["MULTICOMPONENTLIST.LIST"]) {
        const compList = Array.isArray(item["MULTICOMPONENTLIST.LIST"]) ? item["MULTICOMPONENTLIST.LIST"] : [item["MULTICOMPONENTLIST.LIST"]];
        base.components = compList.map((comp: any) => {
          const mappingComp: any = {
            name: String(getSingleValue(comp.COMPONENTLISTNAME)),
            baseQuantity: parseTallyNumeric(comp.COMPONENTBASICQTY) || 1,
          };
          if (comp["MULTICOMPONENTITEMLIST.LIST"]) {
            const itemList = Array.isArray(comp["MULTICOMPONENTITEMLIST.LIST"])
              ? comp["MULTICOMPONENTITEMLIST.LIST"]
              : [comp["MULTICOMPONENTITEMLIST.LIST"]];
            mappingComp.componentListItems = itemList.map((item: any) => ({
              natureOfComponent: String(getSingleValue(item.NATUREOFITEM)),
              itemName: String(getSingleValue(item.STOCKITEMNAME)),
              defaultGodown: getSingleValue(item.GODOWNNAME),
              actualQuantity: parseTallyNumeric(item.ACTUALQTY) || 0,
            }));
          }
          return mappingComp;
        });
      }
    } else if (type === "Employee" || type === "EmployeeGroup") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.category = getSingleValue(item.CATEGORY);
      base.parent = getSingleValue(item.PARENT);
      base.emailId = getSingleValue(item.EMAILID);
      base.showOpeningBal = item.REVENUELEDFOROPBAL ? String(getSingleValue(item.REVENUELEDFOROPBAL)) === "Yes" : undefined;

      // language name list / alias
      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    } else if (type === "Currency") {
      base.name = item.ORIGINALNAME ? String(getSingleValue(item.ORIGINALNAME)) : (item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : ""));
      base.formalName = getSingleValue(item.MAILINGNAME);
    } else if (type === "GSTRegistration") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.stateName = String(getSingleValue(item.STATENAME) || "");
      base.priorStateName = getSingleValue(item.PRIORSTATENAME);
      base.gstin = getSingleValue(item.GSTREGNUMBER);
      base.eWayApplicableType = getSingleValue(item.EWAYBILLAPPLICABLETYPE);
      base.gstUserName = getSingleValue(item.GSTNUSERNAME);
      base.eSignMethod = getSingleValue(item.ESIGNMETHOD);
      base.isOtherTerritoryAssessee = item.ISOTHTERRITORYASSESSEE ? String(getSingleValue(item.ISOTHTERRITORYASSESSEE)) === "Yes" : undefined;
      base.isEwayBillApplicable = item.ISEWAYBILLPRINTAPPLICABLE ? String(getSingleValue(item.ISEWAYBILLPRINTAPPLICABLE)) === "Yes" : undefined;
      base.isEwayBillApplicableForIntra = item.ISEWAYBILLAPPLICABLEFORINTRA ? String(getSingleValue(item.ISEWAYBILLAPPLICABLEFORINTRA)) === "Yes" : undefined;

      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }

      if (item["GSTREGISTRATIONDETAILS.LIST"]) {
        const detailList = Array.isArray(item["GSTREGISTRATIONDETAILS.LIST"]) ? item["GSTREGISTRATIONDETAILS.LIST"] : [item["GSTREGISTRATIONDETAILS.LIST"]];
        base.registrationDetails = detailList.map((detail: any) => ({
          applicableFrom: getSingleValue(detail.FROMDATE),
          gstRegistrationType: getSingleValue(detail.REGISTRATIONTYPE),
          state: getSingleValue(detail.STATE),
          placeOfSupply: getSingleValue(detail.PLACEOFSUPPLY),
          isOtherTerritoryAssessee: detail.ISOTHTERRITORYASSESSEE ? String(getSingleValue(detail.ISOTHTERRITORYASSESSEE)) === "Yes" : undefined,
          isStateCessOn: detail.ISSTATECESSON ? String(getSingleValue(detail.ISSTATECESSON)) === "Yes" : undefined,
        }));
      }
    } else if (type === "AttendanceType") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.parent = String(getSingleValue(item.PARENT) || "");
      base.attendanceType = getSingleValue(item.ATTENDANCEONPRODUCTION);
      base.unit = getSingleValue(item.BASEUNITS);

      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    } else if (type === "Budget") {
      base.name = item["@_NAME"] ? String(getSingleValue(item["@_NAME"])) : (item.NAME ? String(getSingleValue(item.NAME)) : "");
      base.parent = String(getSingleValue(item.PARENT) || "");
      base.startingFrom = item.STARTINGFROM ? String(getSingleValue(item.STARTINGFROM)) : undefined;
      base.endingAt = item.ENDINGAT ? String(getSingleValue(item.ENDINGAT)) : undefined;

      const langData = parseLanguageNameList(item);
      if (langData.languageNameList) base.languageNameList = langData.languageNameList;
      if (langData.alias) base.alias = langData.alias;
      if ((!base.name || base.name === "undefined") && base.languageNameList?.[0]?.names?.[0]) {
        base.name = base.languageNameList[0].names[0];
      }
    }

    return base as T;
  });
}

/**
 * Parses POST import responses
 */
export function parsePostResponse(xml: string): PostResponse[] {
  const parsed = parseRawXml(xml);
  const error = checkTallyError(parsed);
  if (error) {
    return [{ status: "failure", message: error }];
  }

  const envelope = parsed?.ENVELOPE;
  const customResults = envelope?.BODY?.DATA?.RESULTS?.RESULT || envelope?.RESULTS?.RESULT;
  if (customResults) {
    const resultItems = Array.isArray(customResults) ? customResults : [customResults];
    return resultItems.map((item: any) => {
      const error = getSingleValue(item.ERROR);
      return {
        status: error ? "failure" : "success",
        message: error ? String(error) : "Imported successfully",
        objectType: getSingleValue(item.OBJECTTYPE),
        name: getSingleValue(item.NAME),
        masterId: item.MASTERID ? Number(getSingleValue(item.MASTERID)) : undefined,
        guid: getSingleValue(item.GUID),
        remoteId: getSingleValue(item.REMOTEID),
        error: error ? String(error) : undefined,
      } as PostResponse;
    });
  }

  const importResult = envelope?.BODY?.DATA?.IMPORTRESULT;
  if (!importResult) {
    return [{ status: "failure", message: "Failed to parse import result" }];
  }

  const created = Number(getSingleValue(importResult.CREATED) || 0);
  const altered = Number(getSingleValue(importResult.ALTERED) || 0);
  const deleted = Number(getSingleValue(importResult.DELETED) || 0);
  const lastVchId = importResult.LASTVCHID ? Number(getSingleValue(importResult.LASTVCHID)) : undefined;

  let msg = "Imported successfully";
  if (created > 0) msg = "Created successfully";
  else if (altered > 0) msg = "Altered successfully";
  else if (deleted > 0) msg = "Deleted successfully";

  return [{
    status: "success",
    message: msg,
    masterId: lastVchId,
  }];
}

/**
 * Parses Master Statistics from a TDL Report response.
 * The report response wraps each item in a TC_MASTERSTATISTICSREPORT tag.
 */
export function parseMasterStatistics(xml: string): MasterStatistics[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE;
  if (!envelope) return [];

  const rawList = envelope["TC_MASTERSTATISTICSREPORT"] || envelope?.BODY?.DATA?.["TC_MASTERSTATISTICSREPORT"] || [];
  const items = Array.isArray(rawList) ? rawList : [rawList];

  return items
    .filter((item: any) => item && item.NAME !== undefined)
    .map((item: any) => ({
      name: String(getSingleValue(item.NAME) || ""),
      count: parseTallyNumeric(item.COUNT) || 0,
    }));
}

/**
 * Parses Voucher Statistics from a TDL Report response.
 * The report response wraps each item in a TC_VOUCHERSTATISTICSREPORT tag.
 */
export function parseVoucherStatistics(xml: string): VoucherStatistics[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE;
  if (!envelope) return [];

  const rawList = envelope["TC_VOUCHERSTATISTICSREPORT"] || envelope?.BODY?.DATA?.["TC_VOUCHERSTATISTICSREPORT"] || [];
  const items = Array.isArray(rawList) ? rawList : [rawList];

  return items
    .filter((item: any) => item && item.NAME !== undefined)
    .map((item: any) => ({
      name: String(getSingleValue(item.NAME) || ""),
      count: parseTallyNumeric(item.COUNT) || 0,
      cancelledCount: parseTallyNumeric(item.CANCELLEDCOUNT) || 0,
      totalCount: parseTallyNumeric(item.TOTALCOUNT) || 0,
      optionalCount: parseTallyNumeric(item.OPTIONALCOUNT) || 0,
    }));
}

/**
 * Parses the count response from a count request.
 */
export function parseCountResponse(xml: string): number {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE;
  if (!envelope) return 0;

  // Inspect direct fields or inside BODY.DATA (just in case)
  const directCount = envelope.TC_TOTALCOUNT ?? envelope.TC_TotalCount ?? envelope.TOTALCOUNT ?? envelope.COUNT;
  if (directCount !== undefined) {
    return parseTallyNumeric(directCount) || 0;
  }

  const dataCount = envelope.BODY?.DATA?.TC_TOTALCOUNT ?? envelope.BODY?.DATA?.TC_TotalCount ?? envelope.BODY?.DATA?.TOTALCOUNT ?? envelope.BODY?.DATA?.COUNT;
  if (dataCount !== undefined) {
    return parseTallyNumeric(dataCount) || 0;
  }

  return 0;
}

/**
 * Parses AutoColumn Voucher Statistics from a TDL Report response.
 */
export function parsePeriodicVoucherStatistics(xml: string): AutoColVoucherTypeStat[] {
  const parsed = parseRawXml(xml);
  const envelope = parsed?.ENVELOPE;
  if (!envelope) return [];

  // VCHTYPESTAT could be directly under ENVELOPE or under BODY.DATA depending on Tally response structure
  const rawList = envelope["VCHTYPESTAT"] || envelope?.BODY?.DATA?.["VCHTYPESTAT"] || [];
  const items = Array.isArray(rawList) ? rawList : [rawList];

  return items
    .filter((item: any) => item && item.NAME !== undefined)
    .map((item: any) => {
      const rawPeriodStats = item.PERIODSTAT || [];
      const periodStatsList = Array.isArray(rawPeriodStats) ? rawPeriodStats : [rawPeriodStats];

      const periodStats: PeriodicVoucherStat[] = periodStatsList.map((ps: any) => ({
        fromDate: String(getSingleValue(ps.FROMDATE) || ""),
        toDate: String(getSingleValue(ps.TODATE) || ""),
        cancelledCount: parseTallyNumeric(ps.CANCELLEDCOUNT) || 0,
        optionalCount: parseTallyNumeric(ps.OTIONALCOUNT) || 0,
        totalCount: parseTallyNumeric(ps.TOTALCOUNT) || 0,
      }));

      return {
        name: String(getSingleValue(item.NAME) || ""),
        totalCount: parseTallyNumeric(item.TOTALCOUNT) || 0,
        periodStats,
      };
    });
}

const PATH_LOOKUPS: Record<string, string[]> = {
  name: ["@_name", "name"],
  parent: ["parent", "group"],
  phone: ["ledgerphone", "phonenumber", "phone"],
  mobile: ["ledgermobile", "mobilenumber", "mobile"],
  contact: ["ledgercontact", "contactperson", "contact"],
  gstin: ["ledgstregdetails.list.gstin", "ledmultiaddresslist.list.gstin", "partygstin", "ledgstin", "gstregnumber"],
  email: ["email", "emailaddress"],
  state: ["ledmailingdetails.list.state", "ledgstregdetails.list.state", "ledmultiaddresslist.list.state", "statename", "priorstatename", "ledstate"],
  pincode: ["ledmailingdetails.list.pincode", "ledmultiaddresslist.list.pincode", "pincode", "oldpincode"]
};

function flattenObject(obj: any, prefix = "", result: Record<string, string> = {}): Record<string, string> {
  if (obj === null || obj === undefined) return result;
  
  if (typeof obj !== "object") {
    result[prefix.toLowerCase()] = String(obj).trim();
    return result;
  }
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      flattenObject(item, prefix ? `${prefix}.${index}` : String(index), result);
      flattenObject(item, prefix, result);
    });
    return result;
  }
  
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const newPrefix = prefix ? `${prefix}.${key}` : key;
    
    if (val && typeof val === "object") {
      if (val["#text"] !== undefined) {
        result[newPrefix.toLowerCase()] = String(val["#text"]).trim();
      } else {
        flattenObject(val, newPrefix, result);
      }
    } else if (val !== null && val !== undefined) {
      result[newPrefix.toLowerCase()] = String(val).trim();
    }
  }
  
  return result;
}

function getOptimizedValue(flatObj: Record<string, string>, field: string): string {
  const normalizedField = field.toLowerCase();
  const candidatePaths = PATH_LOOKUPS[normalizedField] || [normalizedField];
  
  for (const path of candidatePaths) {
    if (flatObj[path]) return flatObj[path];
  }
  
  for (const path of candidatePaths) {
    const suffix = `.${path}`;
    for (const flatKey of Object.keys(flatObj)) {
      if (flatKey === path || flatKey.endsWith(suffix)) {
        return flatObj[flatKey];
      }
    }
  }
  
  return "";
}

