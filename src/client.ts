import {
  buildExportCollectionXml,
  buildPostXml,
  buildCountRequestXml,
  buildMasterStatisticsXml,
  buildVoucherStatisticsXml,
  buildPeriodicVoucherStatisticsXml,
  RequestOptions,
  PaginatedRequestOptions,
  PostRequestOptions
} from "./tdl/builders.js";
import {
  parseExportCollection,
  parsePostResponse,
  parseCountResponse,
  parseMasterStatistics,
  parseVoucherStatistics,
  parsePeriodicVoucherStatistics,
  parseRawXml,
  checkTallyError,
  PostResponse,
  MasterStatistics,
  VoucherStatistics,
  PeriodicVoucherStat,
  AutoColVoucherTypeStat,
} from "./xmlParser.js";
import { TallyObjectType, TallyObjectMap } from "./schema/registry.js";
import { FetchTallyTransport, TallyTransport } from "./transport.js";
export { FetchTallyTransport as HttpTransport };
import { Voucher } from "./schema/transactions/types.js";
import { Company, Ledger, StockItem } from "./schema/masters/types.js";

export interface LicenseInfo {
  serialNumber: string;
  remoteSerialNumber: string;
  accountId: string;
  adminMailId: string;
  isAdmin: boolean;
  isEducationalMode: boolean;
  isSilver: boolean;
  isGold: boolean;
  planName: string;
  isIndian: boolean;
  isRemoteAccessMode: boolean;
  isLicClientMode: boolean;
  applicationPath: string;
  dataPath: string;
  userLevel: string;
  userName: string;
  tallyVersion: string;
  tallyShortVersion: string;
  isTallyPrime: boolean;
  isTallyPrimeEditLog: boolean;
  isTallyPrimeServer: boolean;
}

export interface LastAlterIds {
  mastersLastId: number;
  vouchersLastId: number;
}

export interface PaginatedResponse<T> {
  totalCount: number;
  pageNum: number;
  recordsPerPage: number;
  totalPages: number;
  objects: T[];
}

export interface TallyClientOptions {
  url?: string;
  timeout?: number;
  company?: string;
  transport?: TallyTransport;
}

export class TallyClient {
  private transport: TallyTransport;
  private defaultCompany?: string;

  constructor(options: TallyClientOptions = {}) {
    this.transport = options.transport || new FetchTallyTransport({ baseURL: options.url || "http://localhost", port: 9000, timeoutMinutes: (options.timeout || 30000) / 60000 });
    this.defaultCompany = options.company;
  }

  private async sendRequest(xml: string, requestName: string): Promise<string> {
    return this.transport.send(xml);
  }

  public async getObjects<T extends TallyObjectType>(
    type: T,
    options: PaginatedRequestOptions = {}
  ): Promise<TallyObjectMap[T][]> {
    const opts: PaginatedRequestOptions = {
      company: this.defaultCompany,
      ...options,
    };
    const reqXml = buildExportCollectionXml(type, opts);
    const respXml = await this.sendRequest(reqXml, `Get ${type}`);
    const error = checkTallyError(respXml);
    if (error) {
      throw new Error(`Tally error fetching ${type}: ${error}`);
    }
    return parseExportCollection(respXml, type);
  }

  public async getPaginatedObjects<T extends TallyObjectType>(
    type: T,
    options: PaginatedRequestOptions = {}
  ): Promise<PaginatedResponse<TallyObjectMap[T]>> {
    const opts: PaginatedRequestOptions = {
      company: this.defaultCompany,
      ...options,
    };
    const pageNum = opts.pageNum || 1;
    const recordsPerPage = opts.recordsPerPage || 100;

    let totalCount = 0;
    if (!opts.disableCountTag) {
      totalCount = await this.getCount(type, opts);
    }

    const objects = await this.getObjects(type, {
      ...opts,
      pageNum,
      recordsPerPage,
    });

    if (opts.disableCountTag) {
      totalCount = objects.length;
    }

    const totalPages = recordsPerPage > 0 ? Math.ceil(totalCount / recordsPerPage) : 1;

    return {
      totalCount,
      pageNum,
      recordsPerPage,
      totalPages,
      objects,
    };
  }

  public async getRawObjects<T extends TallyObjectType>(
    type: T,
    options: PaginatedRequestOptions = {}
  ): Promise<Record<string, unknown>[]> {
    const opts = { company: this.defaultCompany, ...options };
    const reqXml = buildExportCollectionXml(type, opts);
    const respXml = await this.sendRequest(reqXml, `Get Raw ${type}`);
    const parsed = parseRawXml(respXml) as any;
    const col = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION;
    if (!col) return [];
    const codec = parseExportCollection(respXml, type);
    return codec.map(c => (c as any)._raw || c);
  }

  public async postObjects<T extends TallyObjectType>(
    type: T,
    objects: readonly TallyObjectMap[T][],
    options: PostRequestOptions = {}
  ): Promise<PostResponse[]> {
    const opts = { company: this.defaultCompany, ...options };
    const reqXml = buildPostXml(type, objects, opts);
    const respXml = await this.sendRequest(reqXml, `Post ${type}`);
    return parsePostResponse(respXml);
  }

  public async getCount(type: string, options: RequestOptions = {}): Promise<number> {
    const opts = { company: this.defaultCompany, ...options };
    const reqXml = buildCountRequestXml(type, opts);
    const respXml = await this.sendRequest(reqXml, `Count ${type}`);
    return parseCountResponse(respXml);
  }

  // Master convenience shortcuts
  public async getLedgers(options?: PaginatedRequestOptions): Promise<Ledger[]> {
    return this.getObjects("Ledger", options);
  }

  public async getStockItems(options?: PaginatedRequestOptions): Promise<StockItem[]> {
    return this.getObjects("StockItem", options);
  }

  public async getCompanies(options?: PaginatedRequestOptions): Promise<Company[]> {
    return this.getObjects("Company", options);
  }

  public async getVouchers(options?: PaginatedRequestOptions): Promise<Voucher[]> {
    return this.getObjects("Voucher", options);
  }

  public async getActiveCompany(): Promise<string> {
    const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>$$CurrentCompany</ID>
  </HEADER>
</ENVELOPE>`;
    const resp = await this.sendRequest(xml, "Get Active Company");
    const parsed = parseRawXml(resp);
    const body = (parsed as any)?.ENVELOPE?.BODY?.DATA;
    return String(body || "").trim();
  }

  public async getLicenseInfo(): Promise<LicenseInfo> {
    // Fixed: query IsSilver and IsGold instead of IsAdmin!
    const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>LicenseInfoReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="LicenseInfoReport">
            <FORMS>LicenseInfoForm</FORMS>
          </REPORT>
          <FORM NAME="LicenseInfoForm">
            <PARTS>LicenseInfoPart</PARTS>
          </FORM>
          <PART NAME="LicenseInfoPart">
            <LINES>LicenseInfoLine</LINES>
          </PART>
          <LINE NAME="LicenseInfoLine">
            <FIELDS>
              F_SERIAL, F_REMOTE_SERIAL, F_ACCOUNT_ID, F_ADMIN_EMAIL,
              F_IS_ADMIN, F_IS_EDU, F_IS_SILVER, F_IS_GOLD, F_PLAN_NAME,
              F_IS_INDIAN, F_APP_PATH, F_DATA_PATH, F_USER_LEVEL,
              F_USER_NAME, F_TALLY_VERSION
            </FIELDS>
          </LINE>
          <FIELD NAME="F_SERIAL"><SET>$$LicenseInfo:SerialNumber</SET><XMLTAG>SERIALNUMBER</XMLTAG></FIELD>
          <FIELD NAME="F_REMOTE_SERIAL"><SET>$$LicenseInfo:RemoteSerialNumber</SET><XMLTAG>REMOTESERIALNUMBER</XMLTAG></FIELD>
          <FIELD NAME="F_ACCOUNT_ID"><SET>$$LicenseInfo:AccountId</SET><XMLTAG>ACCOUNTID</XMLTAG></FIELD>
          <FIELD NAME="F_ADMIN_EMAIL"><SET>$$LicenseInfo:AdminMailId</SET><XMLTAG>ADMINMAILID</XMLTAG></FIELD>
          <FIELD NAME="F_IS_ADMIN"><SET>$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsAdmin</SET><XMLTAG>ISADMIN</XMLTAG></FIELD>
          <FIELD NAME="F_IS_EDU"><SET>$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsEducationalMode</SET><XMLTAG>ISEDUCATIONALMODE</XMLTAG></FIELD>
          <FIELD NAME="F_IS_SILVER"><SET>$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsSilver</SET><XMLTAG>ISSILVER</XMLTAG></FIELD>
          <FIELD NAME="F_IS_GOLD"><SET>$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsGold</SET><XMLTAG>ISGOLD</XMLTAG></FIELD>
          <FIELD NAME="F_PLAN_NAME"><SET>$$LicenseInfo:PlanName</SET><XMLTAG>PLANNAME</XMLTAG></FIELD>
          <FIELD NAME="F_IS_INDIAN"><SET>$$TC_GetBooleanFromLogicField:$$LicenseInfo:IsIndian</SET><XMLTAG>ISINDIAN</XMLTAG></FIELD>
          <FIELD NAME="F_APP_PATH"><SET>$$SysInfo:ApplicationPath</SET><XMLTAG>APPLICATIONPATH</XMLTAG></FIELD>
          <FIELD NAME="F_DATA_PATH"><SET>##SVCurrentPath</SET><XMLTAG>DATAPATH</XMLTAG></FIELD>
          <FIELD NAME="F_USER_LEVEL"><SET>$$UserLevel</SET><XMLTAG>USERLEVEL</XMLTAG></FIELD>
          <FIELD NAME="F_USER_NAME"><SET>$$UserName</SET><XMLTAG>USERNAME</XMLTAG></FIELD>
          <FIELD NAME="F_TALLY_VERSION"><SET>$$SysInfo:TallyVersion</SET><XMLTAG>TALLYVERSION</XMLTAG></FIELD>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    const resp = await this.sendRequest(xml, "Get License Info");
    const parsed = parseRawXml(resp);
    const data = (parsed as any)?.ENVELOPE?.BODY?.DATA?.LicenseInfoReport?.LICENSEINFOREPORT?.LicenseInfoPart?.LICENSEINFOPART?.LicenseInfoLine || {};
    const r = new (await import("./xml/reader.js")).TallyReader(data);

    return {
      serialNumber: r.text("SERIALNUMBER") ?? "",
      remoteSerialNumber: r.text("REMOTESERIALNUMBER") ?? "",
      accountId: r.text("ACCOUNTID") ?? "",
      adminMailId: r.text("ADMINMAILID") ?? "",
      isAdmin: r.boolean("ISADMIN") ?? false,
      isEducationalMode: r.boolean("ISEDUCATIONALMODE") ?? false,
      isSilver: r.boolean("ISSILVER") ?? false,
      isGold: r.boolean("ISGOLD") ?? false,
      planName: r.text("PLANNAME") ?? "",
      isIndian: r.boolean("ISINDIAN") ?? true,
      isRemoteAccessMode: false,
      isLicClientMode: false,
      applicationPath: r.text("APPLICATIONPATH") ?? "",
      dataPath: r.text("DATAPATH") ?? "",
      userLevel: r.text("USERLEVEL") ?? "",
      userName: r.text("USERNAME") ?? "",
      tallyVersion: r.text("TALLYVERSION") ?? "",
      tallyShortVersion: r.text("TALLYVERSION")?.split(" ")[0] ?? "",
      isTallyPrime: true,
      isTallyPrimeEditLog: false,
      isTallyPrimeServer: false,
    };
  }

  public async getLastAlterIds(): Promise<LastAlterIds> {
    const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>LastAlterIdsReport</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <REPORT NAME="LastAlterIdsReport">
            <FORMS>LastAlterIdsForm</FORMS>
          </REPORT>
          <FORM NAME="LastAlterIdsForm">
            <PARTS>LastAlterIdsPart</PARTS>
          </FORM>
          <PART NAME="LastAlterIdsPart">
            <LINES>LastAlterIdsLine</LINES>
          </PART>
          <LINE NAME="LastAlterIdsLine">
            <FIELDS>F_MASTERS_LAST_ID, F_VOUCHERS_LAST_ID</FIELDS>
          </LINE>
          <FIELD NAME="F_MASTERS_LAST_ID"><SET>$$SysInfo:MastersLastId</SET><XMLTAG>MASTERSLASTID</XMLTAG></FIELD>
          <FIELD NAME="F_VOUCHERS_LAST_ID"><SET>$$SysInfo:VouchersLastId</SET><XMLTAG>VOUCHERSLASTID</XMLTAG></FIELD>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    const resp = await this.sendRequest(xml, "Get Last Alter IDs");
    const parsed = parseRawXml(resp);
    const line = (parsed as any)?.ENVELOPE?.BODY?.DATA?.LastAlterIdsReport?.LASTALTERIDSREPORT?.LastAlterIdsPart?.LASTALTERIDSPART?.LastAlterIdsLine || {};
    const r = new (await import("./xml/reader.js")).TallyReader(line);
    return {
      mastersLastId: r.number("MASTERSLASTID") ?? 0,
      vouchersLastId: r.number("VOUCHERSLASTID") ?? 0,
    };
  }

  public async getMasterStatistics(options: RequestOptions = {}): Promise<MasterStatistics[]> {
    const reqXml = buildMasterStatisticsXml({ company: this.defaultCompany, ...options });
    const respXml = await this.sendRequest(reqXml, "Get Master Statistics");
    return parseMasterStatistics(respXml);
  }

  public async getVoucherStatistics(options: RequestOptions = {}): Promise<VoucherStatistics[]> {
    const reqXml = buildVoucherStatisticsXml({ company: this.defaultCompany, ...options });
    const respXml = await this.sendRequest(reqXml, "Get Voucher Statistics");
    return parseVoucherStatistics(respXml);
  }

  public async getPeriodicVoucherStatistics(options: RequestOptions & { voucherType?: string } = {}): Promise<AutoColVoucherTypeStat[]> {
    const reqXml = buildPeriodicVoucherStatisticsXml({ company: this.defaultCompany, ...options });
    const respXml = await this.sendRequest(reqXml, "Get Periodic Voucher Statistics");
    return parsePeriodicVoucherStatistics(respXml);
  }
}

export default TallyClient;
