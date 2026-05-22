import {
  RequestOptions,
  PaginatedRequestOptions,
  PostRequestOptions,
  LicenseInfo,
  LastAlterIds,
  TallyResult,
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
  AutoColVoucherTypeStat
} from "./types.js";
import {
  buildExportCollectionXml,
  buildLicenseInfoRequestXml,
  buildActiveCompanyRequestXml,
  buildLastAlterIdsRequestXml,
  buildPostXml,
  buildMasterStatisticsXml,
  buildVoucherStatisticsXml,
  buildCountRequestXml,
  buildPeriodicVoucherStatisticsXml
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
  private baseURL: string;
  private port: number;
  private timeoutMs: number;

  constructor(baseURL = "http://localhost", port = 9000, timeoutMinutes = 3) {
    this.baseURL = this.cleanUrl(baseURL);
    this.port = port;
    this.timeoutMs = timeoutMinutes * 60 * 1000;
  }

  private cleanUrl(url: string): string {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return `http://${url}`;
    }
    return url;
  }

  /**
   * Updates Tally Service connection parameters
   */
  public setupTallyService(url: string, port: number): void {
    this.baseURL = this.cleanUrl(url);
    this.port = port;
  }

  private get fullURL(): string {
    return `${this.baseURL}:${this.port}`;
  }

  /**
   * Sends raw XML to Tally Prime / ERP 9 server
   */
  public async sendRequest(xml: string, requestType = "Generic Request"): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.fullURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
        },
        body: xml,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Read response as buffer first, then decode using standard UTF-8 (or UTF-16 if Tally outputs so)
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder("utf-8"); // Modern Tally uses UTF-8 or standard encodings
      return decoder.decode(buffer);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error(`Request to Tally timed out after ${this.timeoutMs}ms`);
      }
      throw new Error(`Failed to connect to Tally on ${this.fullURL}: ${error.message}`);
    }
  }

  /**
   * Checks if Tally is online and active
   */
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

  /**
   * Gets active simple company name in Tally
   */
  public async getActiveCompany(): Promise<string> {
    const xml = buildActiveCompanyRequestXml();
    const resp = await this.sendRequest(xml, "Get Active Company");
    return parseActiveCompany(resp);
  }

  /**
   * Gets License information from Tally
   */
  public async getLicenseInfo(): Promise<LicenseInfo> {
    const xml = buildLicenseInfoRequestXml();
    const resp = await this.sendRequest(xml, "Get License Info");
    return parseLicenseInfo(resp);
  }

  /**
   * Gets last AlterIds in Masters and Vouchers
   */
  public async getLastAlterIds(options: RequestOptions = {}): Promise<LastAlterIds> {
    const xml = buildLastAlterIdsRequestXml(options);
    const resp = await this.sendRequest(xml, "Get Last Alter IDs");
    return parseLastAlterIds(resp);
  }

  /**
   * Fetches Ledgers
   */
  public async getLedgers(options: PaginatedRequestOptions = {}): Promise<Ledger[]> {
    const xml = buildExportCollectionXml("Ledger", options);
    const resp = await this.sendRequest(xml, "Get Ledgers");
    return parseExportCollection<Ledger>(resp, "Ledger");
  }

  /**
   * Fetches Groups
   */
  public async getGroups(options: PaginatedRequestOptions = {}): Promise<Group[]> {
    const xml = buildExportCollectionXml("Group", options);
    const resp = await this.sendRequest(xml, "Get Groups");
    return parseExportCollection<Group>(resp, "Group");
  }

  /**
   * Fetches Companies
   */
  public async getCompanies(options: PaginatedRequestOptions = {}): Promise<Company[]> {
    const xml = buildExportCollectionXml("Company", options);
    const resp = await this.sendRequest(xml, "Get Companies");
    return parseExportCollection<Company>(resp, "Company");
  }

  /**
   * Fetches Vouchers
   */
  public async getVouchers(options: PaginatedRequestOptions = {}): Promise<Voucher[]> {
    const xml = buildExportCollectionXml("Voucher", options);
    const resp = await this.sendRequest(xml, "Get Vouchers");
    return parseExportCollection<Voucher>(resp, "Voucher");
  }

  /**
   * Fetches Cost Centres
   */
  public async getCostCentres(options: PaginatedRequestOptions = {}): Promise<CostCentre[]> {
    const xml = buildExportCollectionXml("CostCentre", options);
    const resp = await this.sendRequest(xml, "Get Cost Centres");
    return parseExportCollection<CostCentre>(resp, "CostCentre");
  }

  /**
   * Fetches Cost Categories
   */
  public async getCostCategories(options: PaginatedRequestOptions = {}): Promise<CostCategory[]> {
    const xml = buildExportCollectionXml("CostCategory", options);
    const resp = await this.sendRequest(xml, "Get Cost Categories");
    return parseExportCollection<CostCategory>(resp, "CostCategory");
  }

  /**
   * Fetches Voucher Types
   */
  public async getVoucherTypes(options: PaginatedRequestOptions = {}): Promise<VoucherType[]> {
    const xml = buildExportCollectionXml("VoucherType", options);
    const resp = await this.sendRequest(xml, "Get Voucher Types");
    return parseExportCollection<VoucherType>(resp, "VoucherType");
  }

  /**
   * Creates or Alters Ledgers in Tally
   */
  public async postLedgers(ledgers: Ledger[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Ledger", ledgers, options);
    const resp = await this.sendRequest(xml, "Post Ledgers");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Groups in Tally
   */
  public async postGroups(groups: Group[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Group", groups, options);
    const resp = await this.sendRequest(xml, "Post Groups");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Vouchers in Tally
   */
  public async postVouchers(vouchers: Voucher[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Voucher", vouchers, options);
    const resp = await this.sendRequest(xml, "Post Vouchers");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Cost Centres in Tally
   */
  public async postCostCentres(costCentres: CostCentre[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("CostCentre", costCentres, options);
    const resp = await this.sendRequest(xml, "Post Cost Centres");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Cost Categories in Tally
   */
  public async postCostCategories(costCategories: CostCategory[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("CostCategory", costCategories, options);
    const resp = await this.sendRequest(xml, "Post Cost Categories");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Voucher Types in Tally
   */
  public async postVoucherTypes(voucherTypes: VoucherType[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("VoucherType", voucherTypes, options);
    const resp = await this.sendRequest(xml, "Post Voucher Types");
    return parsePostResponse(resp);
  }

  /**
   * Fetches Currencies
   */
  public async getCurrencies(options: PaginatedRequestOptions = {}): Promise<Currency[]> {
    const xml = buildExportCollectionXml("Currency", options);
    const resp = await this.sendRequest(xml, "Get Currencies");
    return parseExportCollection<Currency>(resp, "Currency");
  }

  /**
   * Creates or Alters Currencies in Tally
   */
  public async postCurrencies(currencies: Currency[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Currency", currencies, options);
    const resp = await this.sendRequest(xml, "Post Currencies");
    return parsePostResponse(resp);
  }

  /**
   * Fetches Units
   */
  public async getUnits(options: PaginatedRequestOptions = {}): Promise<Unit[]> {
    const xml = buildExportCollectionXml("Unit", options);
    const resp = await this.sendRequest(xml, "Get Units");
    return parseExportCollection<Unit>(resp, "Unit");
  }

  /**
   * Fetches Stock Groups
   */
  public async getStockGroups(options: PaginatedRequestOptions = {}): Promise<StockGroup[]> {
    const xml = buildExportCollectionXml("StockGroup", options);
    const resp = await this.sendRequest(xml, "Get Stock Groups");
    return parseExportCollection<StockGroup>(resp, "StockGroup");
  }

  /**
   * Fetches Stock Categories
   */
  public async getStockCategories(options: PaginatedRequestOptions = {}): Promise<StockCategory[]> {
    const xml = buildExportCollectionXml("StockCategory", options);
    const resp = await this.sendRequest(xml, "Get Stock Categories");
    return parseExportCollection<StockCategory>(resp, "StockCategory");
  }

  /**
   * Fetches Godowns
   */
  public async getGodowns(options: PaginatedRequestOptions = {}): Promise<Godown[]> {
    const xml = buildExportCollectionXml("Godown", options);
    const resp = await this.sendRequest(xml, "Get Godowns");
    return parseExportCollection<Godown>(resp, "Godown");
  }

  /**
   * Fetches Stock Items
   */
  public async getStockItems(options: PaginatedRequestOptions = {}): Promise<StockItem[]> {
    const xml = buildExportCollectionXml("StockItem", options);
    const resp = await this.sendRequest(xml, "Get Stock Items");
    return parseExportCollection<StockItem>(resp, "StockItem");
  }

  /**
   * Fetches Employees
   */
  public async getEmployees(options: PaginatedRequestOptions = {}): Promise<Employee[]> {
    const filters = [...(options.filters || [])];
    filters.push({ name: "TC_IsEmployee", formula: "$ISEMPLOYEE = Yes" });
    filters.push({ name: "TC_IsNotEmployeeGroup", formula: "$ISEMPLOYEEGROUP = No" });
    const xml = buildExportCollectionXml("Employee", { ...options, filters });
    const resp = await this.sendRequest(xml, "Get Employees");
    return parseExportCollection<Employee>(resp, "Employee");
  }

  /**
   * Fetches Employee Groups
   */
  public async getEmployeeGroups(options: PaginatedRequestOptions = {}): Promise<EmployeeGroup[]> {
    const filters = [...(options.filters || [])];
    filters.push({ name: "TC_IsEmployee", formula: "$ISEMPLOYEE = Yes" });
    filters.push({ name: "TC_IsEmployeeGroup", formula: "$ISEMPLOYEEGROUP = Yes" });
    const xml = buildExportCollectionXml("EmployeeGroup", { ...options, filters });
    const resp = await this.sendRequest(xml, "Get Employee Groups");
    return parseExportCollection<EmployeeGroup>(resp, "EmployeeGroup");
  }

  /**
   * Creates or Alters Companies in Tally
   */
  public async postCompanies(companies: Company[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Company", companies, options);
    const resp = await this.sendRequest(xml, "Post Companies");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Units in Tally
   */
  public async postUnits(units: Unit[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Unit", units, options);
    const resp = await this.sendRequest(xml, "Post Units");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Stock Groups in Tally
   */
  public async postStockGroups(stockGroups: StockGroup[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("StockGroup", stockGroups, options);
    const resp = await this.sendRequest(xml, "Post Stock Groups");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Stock Categories in Tally
   */
  public async postStockCategories(stockCategories: StockCategory[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("StockCategory", stockCategories, options);
    const resp = await this.sendRequest(xml, "Post Stock Categories");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Godowns in Tally
   */
  public async postGodowns(godowns: Godown[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Godown", godowns, options);
    const resp = await this.sendRequest(xml, "Post Godowns");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Stock Items in Tally
   */
  public async postStockItems(stockItems: StockItem[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("StockItem", stockItems, options);
    const resp = await this.sendRequest(xml, "Post Stock Items");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Employees in Tally
   */
  public async postEmployees(employees: Employee[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("Employee", employees, options);
    const resp = await this.sendRequest(xml, "Post Employees");
    return parsePostResponse(resp);
  }

  /**
   * Creates or Alters Employee Groups in Tally
   */
  public async postEmployeeGroups(employeeGroups: EmployeeGroup[], options: PostRequestOptions = {}): Promise<PostResponse[]> {
    const xml = buildPostXml("EmployeeGroup", employeeGroups, options);
    const resp = await this.sendRequest(xml, "Post Employee Groups");
    return parsePostResponse(resp);
  }

  /**
   * Fetches Master Statistics (number of groups, ledgers, etc.)
   * Uses TDL Report approach to avoid crashing Tally with COMPUTE on native collections.
   */
  public async getMasterStatistics(options: RequestOptions = {}): Promise<MasterStatistics[]> {
    const xml = buildMasterStatisticsXml(options);
    const resp = await this.sendRequest(xml, "Get Master Statistics");
    return parseMasterStatistics(resp);
  }

  /**
   * Fetches Voucher Statistics (voucher count details by type)
   * Uses TDL Report approach to avoid crashing Tally with COMPUTE on native collections.
   */
  public async getVoucherStatistics(options: RequestOptions = {}): Promise<VoucherStatistics[]> {
    const xml = buildVoucherStatisticsXml(options);
    const resp = await this.sendRequest(xml, "Get Voucher Statistics");
    return parseVoucherStatistics(resp);
  }

  /**
   * Gets the dynamic total count of objects in a specific collection
   */
  public async getObjectsCount(collectionType: string, options: RequestOptions = {}): Promise<number> {
    const xml = buildCountRequestXml(collectionType, options);
    const resp = await this.sendRequest(xml, "Get Objects Count");
    return parseCountResponse(resp);
  }

  /**
   * Fetches Periodic Voucher Statistics with auto-column support
   */
  public async getPeriodicVoucherStatistics(
    periodicity: Periodicity,
    options: RequestOptions = {}
  ): Promise<AutoColVoucherTypeStat[]> {
    const xml = buildPeriodicVoucherStatisticsXml(periodicity, options);
    const resp = await this.sendRequest(xml, "Get Periodic Voucher Statistics");
    return parsePeriodicVoucherStatistics(resp);
  }
}
export default TallyClient;
