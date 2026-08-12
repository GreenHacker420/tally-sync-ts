import {
  RequestOptions,
  PaginatedRequestOptions,
  PostRequestOptions,
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
  Periodicity,
  AutoColVoucherTypeStat,
  GSTRegistration,
  PaginatedResponse,
  PeriodicVoucherStatisticsOptions,
  TallyObjectMap,
  TallyObjectType,
  AttendanceType,
  Budget
} from "./types.js";
import { FetchTallyTransport, TallyTransport } from "./transport.js";
import {
  buildExportCollectionXml,
  buildLicenseInfoRequestXml,
  buildActiveCompanyRequestXml,
  buildLastAlterIdsRequestXml,
  buildPostXml,
  buildMasterStatisticsXml,
  buildVoucherStatisticsXml,
  buildCountRequestXml,
  buildPeriodicVoucherStatisticsXml,
  escapeXml,
  formatDateForTally
} from "./xmlBuilder.js";
import {
  parseActiveCompany,
  parseLicenseInfo,
  parseLastAlterIds,
  parseExportCollection,
  parsePostResponse,
  checkTallyError,
  parseRawXml,
  parseMasterStatistics,
  parseVoucherStatistics,
  parseCountResponse,
  parsePeriodicVoucherStatistics
} from "./xmlParser.js";

export class TallyClient {
  private transport: TallyTransport;

  constructor(baseURL = "http://localhost", port = 9000, timeoutMinutes = 3, transport?: TallyTransport) {
    this.transport = transport || new FetchTallyTransport({ baseURL, port, timeoutMinutes });
  }

  public setupTallyService(url: string, port: number): void {
    if (this.transport instanceof FetchTallyTransport) {
      this.transport.setup(url, port);
      return;
    }
    this.transport = new FetchTallyTransport({ baseURL: url, port });
  }

  public async sendRequest(xml: string, requestType = "Generic Request"): Promise<string> {
    return this.transport.send(xml, requestType);
  }

  public async check(): Promise<boolean> {
    try {
      const xml = buildActiveCompanyRequestXml();
      const resp = await this.sendRequest(xml, "Check Connection");
      const parsed = parseRawXml(resp);
      return checkTallyError(parsed) === null;
    } catch {
      return false;
    }
  }

  public async getActiveCompany(): Promise<string> {
    const xml = buildActiveCompanyRequestXml();
    const resp = await this.sendRequest(xml, "Get Active Company");
    return parseActiveCompany(resp);
  }

  public async getLicenseInfo(): Promise<LicenseInfo> {
    const xml = buildLicenseInfoRequestXml();
    const resp = await this.sendRequest(xml, "Get License Info");
    return parseLicenseInfo(resp);
  }

  public async getLastAlterIds(options: RequestOptions = {}): Promise<LastAlterIds> {
    const xml = buildLastAlterIdsRequestXml(options);
    const resp = await this.sendRequest(xml, "Get Last Alter IDs");
    return parseLastAlterIds(resp);
  }

  public async getLedgers(options: PaginatedRequestOptions = {}): Promise<Ledger[]> {
    const xml = buildExportCollectionXml("Ledger", options);
    const resp = await this.sendRequest(xml, "Get Ledgers");
    return parseExportCollection<Ledger>(resp, "Ledger");
  }

  public async getGroups(options: PaginatedRequestOptions = {}): Promise<Group[]> {
    const xml = buildExportCollectionXml("Group", options);
    const resp = await this.sendRequest(xml, "Get Groups");
    return parseExportCollection<Group>(resp, "Group");
  }

  public async getCompanies(options: PaginatedRequestOptions = {}): Promise<Company[]> {
    const xml = buildExportCollectionXml("Company", options);
    const resp = await this.sendRequest(xml, "Get Companies");
    return parseExportCollection<Company>(resp, "Company");
  }

  public async getVouchers(options: PaginatedRequestOptions = {}): Promise<Voucher[]> {
    const xml = buildExportCollectionXml("Voucher", options);
    const resp = await this.sendRequest(xml, "Get Vouchers");
    return parseExportCollection<Voucher>(resp, "Voucher");
  }

  public async getCostCentres(options: PaginatedRequestOptions = {}): Promise<CostCentre[]> {
    const xml = buildExportCollectionXml("CostCentre", options);
    const resp = await this.sendRequest(xml, "Get Cost Centres");
    return parseExportCollection<CostCentre>(resp, "CostCentre");
  }

  public async getCostCategories(options: PaginatedRequestOptions = {}): Promise<CostCategory[]> {
    const xml = buildExportCollectionXml("CostCategory", options);
    const resp = await this.sendRequest(xml, "Get Cost Categories");
    return parseExportCollection<CostCategory>(resp, "CostCategory");
  }

  public async getVoucherTypes(options: PaginatedRequestOptions = {}): Promise<VoucherType[]> {
    const xml = buildExportCollectionXml("VoucherType", options);
    const resp = await this.sendRequest(xml, "Get Voucher Types");
    return parseExportCollection<VoucherType>(resp, "VoucherType");
  }

  public async postLedgers(ledgers: Ledger[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Ledger", ledgers, options);
    const resp = await this.sendRequest(xml, "Post Ledgers");
    return parsePostResponse(resp);
  }

  public async postGroups(groups: Group[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Group", groups, options);
    const resp = await this.sendRequest(xml, "Post Groups");
    return parsePostResponse(resp);
  }

  public async postVouchers(vouchers: Voucher[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Voucher", vouchers, options);
    const resp = await this.sendRequest(xml, "Post Vouchers");
    return parsePostResponse(resp);
  }

  public async postCostCentres(costCentres: CostCentre[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("CostCentre", costCentres, options);
    const resp = await this.sendRequest(xml, "Post Cost Centres");
    return parsePostResponse(resp);
  }

  public async postCostCategories(costCategories: CostCategory[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("CostCategory", costCategories, options);
    const resp = await this.sendRequest(xml, "Post Cost Categories");
    return parsePostResponse(resp);
  }

  public async postVoucherTypes(voucherTypes: VoucherType[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("VoucherType", voucherTypes, options);
    const resp = await this.sendRequest(xml, "Post Voucher Types");
    return parsePostResponse(resp);
  }

  public async getCurrencies(options: PaginatedRequestOptions = {}): Promise<Currency[]> {
    const xml = buildExportCollectionXml("Currency", options);
    const resp = await this.sendRequest(xml, "Get Currencies");
    return parseExportCollection<Currency>(resp, "Currency");
  }

  public async getGSTRegistrations(options: PaginatedRequestOptions = {}): Promise<GSTRegistration[]> {
    const filters = [...(options.filters || [])];
    if (!filters.some(f => f.name === "TaxUnitForGST")) {
      filters.push({ name: "TaxUnitForGST" });
    }
    const xml = buildExportCollectionXml("GSTRegistration", {
      ...options,
      collectionType: "TAXUNIT",
      filters,
    });
    const resp = await this.sendRequest(xml, "Get GST Registrations");
    return parseExportCollection<GSTRegistration>(resp, "GSTRegistration");
  }

  public async postCurrencies(currencies: Currency[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Currency", currencies, options);
    const resp = await this.sendRequest(xml, "Post Currencies");
    return parsePostResponse(resp);
  }

  public async postGSTRegistrations(registrations: GSTRegistration[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("GSTRegistration", registrations, options);
    const resp = await this.sendRequest(xml, "Post GST Registrations");
    return parsePostResponse(resp);
  }

  public async getUnits(options: PaginatedRequestOptions = {}): Promise<Unit[]> {
    const xml = buildExportCollectionXml("Unit", options);
    const resp = await this.sendRequest(xml, "Get Units");
    return parseExportCollection<Unit>(resp, "Unit");
  }

  public async getStockGroups(options: PaginatedRequestOptions = {}): Promise<StockGroup[]> {
    const xml = buildExportCollectionXml("StockGroup", options);
    const resp = await this.sendRequest(xml, "Get Stock Groups");
    return parseExportCollection<StockGroup>(resp, "StockGroup");
  }

  public async getStockCategories(options: PaginatedRequestOptions = {}): Promise<StockCategory[]> {
    const xml = buildExportCollectionXml("StockCategory", options);
    const resp = await this.sendRequest(xml, "Get Stock Categories");
    return parseExportCollection<StockCategory>(resp, "StockCategory");
  }

  public async getGodowns(options: PaginatedRequestOptions = {}): Promise<Godown[]> {
    const xml = buildExportCollectionXml("Godown", options);
    const resp = await this.sendRequest(xml, "Get Godowns");
    return parseExportCollection<Godown>(resp, "Godown");
  }

  public async getStockItems(options: PaginatedRequestOptions = {}): Promise<StockItem[]> {
    const xml = buildExportCollectionXml("StockItem", options);
    const resp = await this.sendRequest(xml, "Get Stock Items");
    return parseExportCollection<StockItem>(resp, "StockItem");
  }

  public async getEmployees(options: PaginatedRequestOptions = {}): Promise<Employee[]> {
    const filters = [...(options.filters || [])];
    filters.push({ name: "TC_IsEmployee", formula: "$ISEMPLOYEE = Yes" });
    filters.push({ name: "TC_IsNotEmployeeGroup", formula: "$ISEMPLOYEEGROUP = No" });
    const xml = buildExportCollectionXml("Employee", { ...options, filters });
    const resp = await this.sendRequest(xml, "Get Employees");
    return parseExportCollection<Employee>(resp, "Employee");
  }

  public async getEmployeeGroups(options: PaginatedRequestOptions = {}): Promise<EmployeeGroup[]> {
    const filters = [...(options.filters || [])];
    filters.push({ name: "TC_IsEmployee", formula: "$ISEMPLOYEE = Yes" });
    filters.push({ name: "TC_IsEmployeeGroup", formula: "$ISEMPLOYEEGROUP = Yes" });
    const xml = buildExportCollectionXml("EmployeeGroup", { ...options, filters });
    const resp = await this.sendRequest(xml, "Get Employee Groups");
    return parseExportCollection<EmployeeGroup>(resp, "EmployeeGroup");
  }

  public async postCompanies(companies: Company[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Company", companies, options);
    const resp = await this.sendRequest(xml, "Post Companies");
    return parsePostResponse(resp);
  }

  public async postUnits(units: Unit[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Unit", units, options);
    const resp = await this.sendRequest(xml, "Post Units");
    return parsePostResponse(resp);
  }

  public async postStockGroups(stockGroups: StockGroup[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("StockGroup", stockGroups, options);
    const resp = await this.sendRequest(xml, "Post Stock Groups");
    return parsePostResponse(resp);
  }

  public async postStockCategories(stockCategories: StockCategory[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("StockCategory", stockCategories, options);
    const resp = await this.sendRequest(xml, "Post Stock Categories");
    return parsePostResponse(resp);
  }

  public async postGodowns(godowns: Godown[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Godown", godowns, options);
    const resp = await this.sendRequest(xml, "Post Godowns");
    return parsePostResponse(resp);
  }

  public async postStockItems(stockItems: StockItem[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("StockItem", stockItems, options);
    const resp = await this.sendRequest(xml, "Post Stock Items");
    return parsePostResponse(resp);
  }

  public async postEmployees(employees: Employee[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Employee", employees, options);
    const resp = await this.sendRequest(xml, "Post Employees");
    return parsePostResponse(resp);
  }

  public async postEmployeeGroups(employeeGroups: EmployeeGroup[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("EmployeeGroup", employeeGroups, options);
    const resp = await this.sendRequest(xml, "Post Employee Groups");
    return parsePostResponse(resp);
  }

  public async getMasterStatistics(options: RequestOptions = {}): Promise<MasterStatistics[]> {
    const xml = buildMasterStatisticsXml(options);
    const resp = await this.sendRequest(xml, "Get Master Statistics");
    return parseMasterStatistics(resp);
  }

  public async getVoucherStatistics(options: RequestOptions = {}): Promise<VoucherStatistics[]> {
    const xml = buildVoucherStatisticsXml(options);
    const resp = await this.sendRequest(xml, "Get Voucher Statistics");
    return parseVoucherStatistics(resp);
  }

  public async getObjectsCount(collectionType: string, options: RequestOptions = {}): Promise<number> {
    const xml = buildCountRequestXml(collectionType, options);
    const resp = await this.sendRequest(xml, "Get Objects Count");
    return parseCountResponse(resp);
  }

  public async getObjects<TType extends TallyObjectType>(
    collectionType: TType,
    options: PaginatedRequestOptions = {}
  ): Promise<TallyObjectMap[TType][]> {
    const xml = buildExportCollectionXml(collectionType, options);
    const resp = await this.sendRequest(xml, `Get ${collectionType}`);
    return parseExportCollection<TallyObjectMap[TType]>(resp, collectionType);
  }

  public async postObjects<TType extends TallyObjectType>(
    collectionType: TType,
    objects: TallyObjectMap[TType][],
    options: PostRequestOptions = {}
  ): Promise<PostResponse[]> {
    const xml = buildPostXml(collectionType, objects, options);
    const resp = await this.sendRequest(xml, `Post ${collectionType}`);
    return parsePostResponse(resp);
  }

  public async getPaginatedObjects<T>(
    collectionType: Parameters<typeof parseExportCollection>[1],
    options: PaginatedRequestOptions = {}
  ): Promise<PaginatedResponse<T>> {
    const pageNum = options.pageNum || 1;
    const recordsPerPage = options.recordsPerPage || 1000;
    const totalCount = options.disableCountTag ? 0 : await this.getObjectsCount(collectionType, options);
    const xml = buildExportCollectionXml(collectionType, { ...options, pageNum, recordsPerPage, disableCountTag: true });
    const resp = await this.sendRequest(xml, `Get Paginated ${collectionType}`);
    const objects = parseExportCollection<T>(resp, collectionType);

    return {
      totalCount,
      pageNum,
      recordsPerPage,
      totalPages: totalCount > 0 ? Math.ceil(totalCount / recordsPerPage) : 0,
      objects,
    };
  }

  public async getPeriodicVoucherStatistics(
    periodicity: Periodicity,
    options: PeriodicVoucherStatisticsOptions = {}
  ): Promise<AutoColVoucherTypeStat[]> {
    const xml = buildPeriodicVoucherStatisticsXml(periodicity, options);
    const resp = await this.sendRequest(xml, "Get Periodic Voucher Statistics");
    return parsePeriodicVoucherStatistics(resp);
  }

  public async getAttendanceTypes(options: PaginatedRequestOptions = {}): Promise<AttendanceType[]> {
    return this.getObjects("AttendanceType", options);
  }

  public async postAttendanceTypes(attendanceTypes: AttendanceType[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    return this.postObjects("AttendanceType", attendanceTypes, options);
  }

  public async getBudgets(options: PaginatedRequestOptions = {}): Promise<Budget[]> {
    return this.getObjects("Budget", options);
  }

  public async postBudgets(budgets: Budget[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    return this.postObjects("Budget", budgets, options);
  }

  public async getReport(reportId: string, options: RequestOptions = {}): Promise<any> {
    const fromDate = formatDateForTally(options.fromDate);
    const toDate = formatDateForTally(options.toDate);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>EXPORT</TALLYREQUEST>
    <TYPE>DATA</TYPE>
    <ID>${escapeXml(reportId)}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${options.company ? `<SVCURRENTCOMPANY>${escapeXml(options.company)}</SVCURRENTCOMPANY>` : ""}
        ${fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : ""}
        ${toDate ? `<SVTODATE>${toDate}</SVTODATE>` : ""}
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;

    const resp = await this.sendRequest(xml, `Get Report ${reportId}`);
    return parseRawXml(resp);
  }

  public async getGSTComputation(options: RequestOptions = {}): Promise<any> {
    return this.getReport("GSTComputation", options);
  }
}

export default TallyClient;
