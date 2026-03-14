/**
 * VES CONNECTIONS LIMITED — Database Setup
 * Run: node src/utils/setupDb.js
 */
require('dotenv').config();
const pool = require('../../config/db');

const SQL = `
-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  username      VARCHAR(50)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'Cashier'
                  CHECK (role IN ('Admin','Manager','Cashier')),
  branch        VARCHAR(50),
  avatar        VARCHAR(5),
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ── Suppliers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  contact       VARCHAR(50),
  email         VARCHAR(100),
  address       TEXT,
  categories    VARCHAR(255),
  rating        SMALLINT DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  balance       NUMERIC(14,2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ── Products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(150) NOT NULL,
  sku             VARCHAR(50)  UNIQUE NOT NULL,
  barcode         VARCHAR(50),
  category        VARCHAR(50),
  buy_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  sell_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  main_branch_qty INTEGER NOT NULL DEFAULT 0,
  west_branch_qty INTEGER NOT NULL DEFAULT 0,
  min_stock       INTEGER NOT NULL DEFAULT 5,
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

-- ── Customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(100) NOT NULL,
  phone        VARCHAR(20),
  email        VARCHAR(100),
  total_spent  NUMERIC(14,2) DEFAULT 0,
  visits       INTEGER DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ── Sales ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_no     VARCHAR(20) UNIQUE NOT NULL,
  customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name  VARCHAR(100) NOT NULL DEFAULT 'Walk-in',
  branch         VARCHAR(50) NOT NULL,
  staff_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  staff_name     VARCHAR(100),
  pay_method     VARCHAR(30) NOT NULL DEFAULT 'Cash',
  subtotal       NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20) DEFAULT 'Completed'
                   CHECK (status IN ('Completed','Refunded','Cancelled')),
  notes          TEXT,
  sale_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ── Sale Items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id     UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(150) NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  unit_price  NUMERIC(12,2) NOT NULL,
  line_total  NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED
);

-- ── Purchase Orders ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number    VARCHAR(20) UNIQUE NOT NULL,
  supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name VARCHAR(100),
  branch       VARCHAR(50) NOT NULL,
  total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'Pending'
                 CHECK (status IN ('Pending','In Transit','Delivered','Cancelled')),
  notes        TEXT,
  order_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  delivered_at TIMESTAMP,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- ── Purchase Order Items ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id       UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_name   VARCHAR(150) NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  unit_cost   NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total  NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_cost) STORED
);

-- ── Expenses ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category    VARCHAR(50) NOT NULL,
  description TEXT,
  amount      NUMERIC(14,2) NOT NULL,
  branch      VARCHAR(50) NOT NULL,
  added_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  added_by    VARCHAR(100),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ── Audit Log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name  VARCHAR(100),
  action     VARCHAR(100) NOT NULL,
  entity     VARCHAR(50),
  entity_id  VARCHAR(100),
  details    TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Receipt Counter ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS counters (
  key   VARCHAR(50) PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
INSERT INTO counters (key, value) VALUES ('receipt', 1) ON CONFLICT DO NOTHING;

-- ── Stock Transfers ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transfers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name   VARCHAR(150),
  qty            INTEGER NOT NULL CHECK (qty > 0),
  from_branch    VARCHAR(50) NOT NULL,
  to_branch      VARCHAR(50) NOT NULL,
  notes          TEXT,
  transferred_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ── Debts / Credit ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name  VARCHAR(100) NOT NULL,
  phone          VARCHAR(30),
  amount         NUMERIC(14,2) NOT NULL,
  paid           NUMERIC(14,2) DEFAULT 0,
  description    TEXT,
  due_date       DATE,
  branch         VARCHAR(50),
  status         VARCHAR(20) DEFAULT 'Unpaid' CHECK (status IN ('Unpaid','Partial','Paid')),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debt_id    UUID REFERENCES debts(id) ON DELETE CASCADE,
  amount     NUMERIC(14,2) NOT NULL,
  paid_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Cash Register ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_registers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date           DATE NOT NULL,
  branch         VARCHAR(50) NOT NULL,
  opening_float  NUMERIC(14,2) DEFAULT 0,
  closing_cash   NUMERIC(14,2),
  notes          TEXT,
  status         VARCHAR(10) DEFAULT 'Open' CHECK (status IN ('Open','Closed')),
  opened_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at      TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ── Sales Returns ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_returns (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_no     VARCHAR(20),
  sale_id        UUID REFERENCES sales(id) ON DELETE SET NULL,
  customer_name  VARCHAR(100),
  items          JSONB NOT NULL DEFAULT '[]',
  refund_amount  NUMERIC(14,2) NOT NULL,
  reason         VARCHAR(50),
  refund_method  VARCHAR(20),
  notes          TEXT,
  branch         VARCHAR(50),
  processed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);

-- ── Time Logs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  clock_in   TIMESTAMP NOT NULL,
  clock_out  TIMESTAMP,
  hours      NUMERIC(5,2),
  branch     VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_sku         ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category);
CREATE INDEX IF NOT EXISTS idx_sales_date           ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_branch         ON sales(branch);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale      ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date        ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch      ON expenses(branch);
CREATE INDEX IF NOT EXISTS idx_po_status            ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_audit_user           ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_transfers_product    ON stock_transfers(product_id);
CREATE INDEX IF NOT EXISTS idx_debts_status         ON debts(status);
CREATE INDEX IF NOT EXISTS idx_debts_due            ON debts(due_date);
CREATE INDEX IF NOT EXISTS idx_register_date        ON cash_registers(date, branch);
CREATE INDEX IF NOT EXISTS idx_returns_receipt      ON sales_returns(receipt_no);
CREATE INDEX IF NOT EXISTS idx_timelogs_user_date   ON time_logs(user_id, date);
`;

async function setup() {
  const client = await pool.connect();
  try {
    console.log('🔧 Setting up VES CONNECTIONS ERP database...');
    await client.query(SQL);
    console.log('✅ All tables created successfully.');
    console.log('▶  Run: node src/utils/seedDb.js  to load sample data');
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();