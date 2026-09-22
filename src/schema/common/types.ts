import { TallyLogical, TallyAmount, TallyDateInput } from "../../xml/values.js";
import { TallyUnknownFields } from "../../xml/types.js";

export interface MultiAddress {
  addressName: string;
  addressLines?: string[];
  country?: string;
  state?: string;
  pinCode?: string;
  contactPerson?: string;
  mobileNo?: string;
  phoneNumber?: string;
  faxNumber?: string;
  email?: string;
  panNumber?: string;
  vatNumber?: string;
  cstNumber?: string;
  exciseNatureOfPurchase?: string;
  exciseRegistrationNo?: string;
  exciseImportRegistrationNo?: string;
  importExportCode?: string;
  isOtherTerritoryAssessee?: boolean;
  gstin?: string;
  gstDealerType?: string;
  exciseJurisdictions?: any[];
}

export interface MailingDetail {
  addressLines?: string[];
  applicableFrom?: Date | string;
  mailingName?: string;
  country?: string;
  state?: string;
  pinCode?: string;
}

export interface PaymentDetails {
  bankName: string;
  city?: string;
  defaultTransactionType?: string;
  inFavour?: string;
  transactionName?: string;
  chequeCrossComment?: string;
  setAsDefault?: boolean;
  bankAccountNo?: string;
  bankBranch?: string;
  ifsc?: string;
}

export interface LedgerContactDetail {
  name?: string;
  phoneNumber?: string;
  countryIsdCode?: string;
  isDefaultWhatsappNumber?: boolean;
}

export interface LedgerGSTRegistrationDetail {
  applicableFrom?: Date | string;
  gstRegistrationType?: string;
  state?: string;
  placeOfSupply?: string;
  isOtherTerritoryAssessee?: boolean;
  considerPurchaseForExport?: boolean;
  isTransporter?: boolean;
  transporterId?: string;
  isCommonParty?: boolean;
  gstin?: string;
}

export interface GSTRateDetail {
  dutyHead?: string;
  valuationType?: string;
  gstRate: number;
}

export interface StateWiseDetail {
  stateName?: string;
  rateDetails?: GSTRateDetail[];
}

export interface GSTDetail {
  applicableFrom?: Date | string;
  calculationType?: string;
  calculateSlabOnMRP?: boolean;
  natureOfTransaction?: string;
  isNonGSTGoods?: boolean;
  taxability?: string;
  sourceOfGSTDetails?: string;
  isReverseChargeApplicable?: boolean;
  isInEligibleForITC?: boolean;
  includeExpForSlabCalc?: boolean;
  stateWiseDetails?: StateWiseDetail[];
}

export interface HSNDetail {
  applicableFrom?: Date | string;
  hsnDescription?: string;
  hsnCode?: string;
  hsnClassificationName?: string;
  source?: string;
}
