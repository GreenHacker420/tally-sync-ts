/**
 * SQLite Relational Schema for Tally Prime Mirror
 * Supports all 808 Tally tags via relational columns + raw_tags JSON document storage.
 */

export const TALLY_SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS tally_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  formal_name TEXT,
  starting_from TEXT,
  books_from TEXT,
  pan TEXT,
  gstin TEXT,
  state TEXT,
  country TEXT,
  currency TEXT,
  raw_tags JSON,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tally_groups (
  name TEXT PRIMARY KEY,
  parent TEXT,
  is_revenue INTEGER,
  is_deemed_positive INTEGER,
  affects_gross_profit INTEGER,
  raw_tags JSON,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tally_ledgers (
  name TEXT PRIMARY KEY,
  parent TEXT NOT NULL,
  opening_balance REAL DEFAULT 0,
  closing_balance REAL DEFAULT 0,
  is_deemed_positive INTEGER,
  is_bill_wise INTEGER,
  gstin TEXT,
  state TEXT,
  pan TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  address TEXT,
  pin_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  msme_reg_number TEXT,
  msme_enterprise_type TEXT,
  msme_reg_date TEXT,
  credit_limit REAL,
  credit_period TEXT,
  raw_tags JSON,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_parent ON tally_ledgers(parent);
CREATE INDEX IF NOT EXISTS idx_ledger_gstin ON tally_ledgers(gstin);
CREATE INDEX IF NOT EXISTS idx_ledger_msme ON tally_ledgers(msme_enterprise_type);

CREATE TABLE IF NOT EXISTS tally_stock_items (
  name TEXT PRIMARY KEY,
  parent TEXT,
  category TEXT,
  base_unit TEXT,
  closing_balance_qty REAL DEFAULT 0,
  closing_balance_unit TEXT,
  closing_rate REAL DEFAULT 0,
  closing_value REAL DEFAULT 0,
  opening_balance_qty REAL DEFAULT 0,
  opening_value REAL DEFAULT 0,
  hsn_code TEXT,
  hsn_description TEXT,
  gst_rate REAL,
  taxability TEXT,
  costing_method TEXT,
  valuation_method TEXT,
  raw_tags JSON,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_item_parent ON tally_stock_items(parent);
CREATE INDEX IF NOT EXISTS idx_stock_item_hsn ON tally_stock_items(hsn_code);

CREATE TABLE IF NOT EXISTS tally_vouchers (
  guid TEXT PRIMARY KEY,
  alter_id INTEGER,
  voucher_number TEXT,
  voucher_type TEXT NOT NULL,
  date TEXT NOT NULL,
  effective_date TEXT,
  reference TEXT,
  reference_date TEXT,
  party_ledger_name TEXT,
  party_name TEXT,
  party_gstin TEXT,
  place_of_supply TEXT,
  buyer_name TEXT,
  buyer_gstin TEXT,
  consignee_name TEXT,
  consignee_gstin TEXT,
  amount REAL NOT NULL,
  is_invoice INTEGER,
  is_deemed_positive INTEGER,
  narration TEXT,
  dispatch_doc_no TEXT,
  carrier_name TEXT,
  vehicle_no TEXT,
  irn TEXT,
  raw_tags JSON,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voucher_date ON tally_vouchers(date);
CREATE INDEX IF NOT EXISTS idx_voucher_type ON tally_vouchers(voucher_type);
CREATE INDEX IF NOT EXISTS idx_voucher_party ON tally_vouchers(party_ledger_name);
CREATE INDEX IF NOT EXISTS idx_voucher_party_gstin ON tally_vouchers(party_gstin);

CREATE TABLE IF NOT EXISTS tally_voucher_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_guid TEXT NOT NULL,
  ledger_name TEXT NOT NULL,
  amount REAL NOT NULL,
  is_deemed_positive INTEGER NOT NULL,
  is_party_ledger INTEGER,
  method_type TEXT,
  FOREIGN KEY (voucher_guid) REFERENCES tally_vouchers(guid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vch_led_guid ON tally_voucher_ledger_entries(voucher_guid);
CREATE INDEX IF NOT EXISTS idx_vch_led_name ON tally_voucher_ledger_entries(ledger_name);

CREATE TABLE IF NOT EXISTS tally_voucher_inventory_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_guid TEXT NOT NULL,
  stock_item_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  rate REAL NOT NULL,
  amount REAL NOT NULL,
  is_deemed_positive INTEGER NOT NULL,
  discount REAL,
  discount_amount REAL,
  hsn_code TEXT,
  gst_rate REAL,
  FOREIGN KEY (voucher_guid) REFERENCES tally_vouchers(guid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vch_inv_guid ON tally_voucher_inventory_entries(voucher_guid);
CREATE INDEX IF NOT EXISTS idx_vch_inv_item ON tally_voucher_inventory_entries(stock_item_name);

CREATE TABLE IF NOT EXISTS tally_voucher_bill_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_guid TEXT NOT NULL,
  ledger_name TEXT NOT NULL,
  name TEXT NOT NULL,
  bill_type TEXT,
  amount REAL NOT NULL,
  bill_date TEXT,
  due_date TEXT,
  FOREIGN KEY (voucher_guid) REFERENCES tally_vouchers(guid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vch_bill_guid ON tally_voucher_bill_allocations(voucher_guid);
CREATE INDEX IF NOT EXISTS idx_vch_bill_name ON tally_voucher_bill_allocations(name);

CREATE TABLE IF NOT EXISTS tally_sync_status (
  entity_type TEXT PRIMARY KEY,
  last_alter_id INTEGER DEFAULT 0,
  record_count INTEGER DEFAULT 0,
  last_sync_time TEXT NOT NULL
);
`;
