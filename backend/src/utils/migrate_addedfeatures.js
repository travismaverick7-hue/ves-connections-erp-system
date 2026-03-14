/**
 * VES CONNECTIONS ERP — 13 New Features Migration
 * Run: node src/utils/migrate_features_13.js
 *
 * Creates tables for:
 * 1. Daily Cash Reconciliation
 * 2. Supplier Payments
 * 3. Financial Reports (views)
 * 4. Stock Reorder Rules
 * 5. Branch Receipt Counters
 * 6. Customer Loyalty (points + tiers + credit)
 * 7. Quotations / Proforma Invoices
 * 8. Return to Supplier
 * 9. Staff Commission Rules + Earnings
 * 10. Payroll
 * 11. M-Pesa Branch Config (extends existing)
 * 12. WhatsApp Log
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require(path.resolve(__dirname, '../../config/db'));

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  VES ERP — 13 Features Migration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    await client.query('BEGIN');

    // 1. DAILY CASH RECONCILIATION
    console.log('1️⃣  Cash Reconciliation...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cash_reconciliations (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        branch          VARCHAR(50)  NOT NULL,
        recon_date      DATE         NOT NULL,
        opening_float   NUMERIC(14,2) DEFAULT 0,
        cash_sales      NUMERIC(14,2) DEFAULT 0,
        mpesa_sales     NUMERIC(14,2) DEFAULT 0,
        card_sales      NUMERIC(14,2) DEFAULT 0,
        other_sales     NUMERIC(14,2) DEFAULT 0,
        total_expected  NUMERIC(14,2) GENERATED ALWAYS AS (opening_float + cash_sales) STORED,
        cash_counted    NUMERIC(14,2) DEFAULT 0,
        variance        NUMERIC(14,2) DEFAULT 0,
        expenses_cash   NUMERIC(14,2) DEFAULT 0,
        notes           TEXT,
        status          VARCHAR(20)  DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Approved','Disputed')),
        submitted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        submitted_by_name VARCHAR(100),
        approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
        approved_by_name  VARCHAR(100),
        approved_at     TIMESTAMP,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(branch, recon_date)
      );
    `);

    // 2. SUPPLIER PAYMENTS
    console.log('2️⃣  Supplier Payments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_payments (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        supplier_name VARCHAR(100),
        amount        NUMERIC(14,2) NOT NULL,
        pay_method    VARCHAR(30)  DEFAULT 'Cash',
        reference     VARCHAR(100),
        notes         TEXT,
        payment_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
        recorded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
        recorded_by_name VARCHAR(100),
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS balance_owed NUMERIC(14,2) DEFAULT 0;`);
    await client.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'Net 30';`);
    await client.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_details TEXT;`);

    // 3. STOCK REORDER RULES
    console.log('3️⃣  Stock Reorder Rules...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS reorder_rules (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        product_name    VARCHAR(150),
        reorder_point   INTEGER NOT NULL DEFAULT 10,
        reorder_qty     INTEGER NOT NULL DEFAULT 50,
        preferred_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
        auto_po         BOOLEAN DEFAULT FALSE,
        is_active       BOOLEAN DEFAULT TRUE,
        created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reorder_product ON reorder_rules(product_id);`);

    // 4. BRANCH RECEIPT COUNTERS
    console.log('4️⃣  Branch Receipt Counters...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS branch_counters (
        id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        branch  VARCHAR(50) NOT NULL,
        key     VARCHAR(50) NOT NULL,
        value   INTEGER NOT NULL DEFAULT 1,
        prefix  VARCHAR(10) DEFAULT '',
        UNIQUE(branch, key)
      );
    `);
    // Seed default branches
    await client.query(`
      INSERT INTO branch_counters (branch, key, value, prefix) VALUES
        ('Main Branch',  'receipt', 1, 'MAIN'),
        ('West Branch',  'receipt', 1, 'WEST'),
        ('Juja Branch',  'receipt', 1, 'JUJA')
      ON CONFLICT DO NOTHING;
    `);

    // 5. CUSTOMER LOYALTY
    console.log('5️⃣  Customer Loyalty...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS loyalty_accounts (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id   UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
        points        INTEGER DEFAULT 0,
        credit_balance NUMERIC(14,2) DEFAULT 0,
        tier          VARCHAR(20) DEFAULT 'Bronze' CHECK (tier IN ('Bronze','Silver','Gold','Platinum')),
        total_earned_points INTEGER DEFAULT 0,
        total_spent   NUMERIC(14,2) DEFAULT 0,
        enrolled_at   TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        type          VARCHAR(30) NOT NULL CHECK (type IN ('EARN_POINTS','REDEEM_POINTS','CREDIT_DEPOSIT','CREDIT_SPEND','TIER_UPGRADE','BONUS')),
        points        INTEGER DEFAULT 0,
        credit_amount NUMERIC(14,2) DEFAULT 0,
        reference     VARCHAR(100),
        notes         TEXT,
        performed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        performed_by_name VARCHAR(100),
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS loyalty_settings (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        points_per_ksh  NUMERIC(6,4) DEFAULT 1,
        ksh_per_point   NUMERIC(6,4) DEFAULT 0.5,
        silver_threshold INTEGER DEFAULT 500,
        gold_threshold   INTEGER DEFAULT 2000,
        platinum_threshold INTEGER DEFAULT 10000,
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`INSERT INTO loyalty_settings (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;`);

    // 6. QUOTATIONS / PROFORMA
    console.log('6️⃣  Quotations...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        quote_no      VARCHAR(20) UNIQUE NOT NULL,
        customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(100) NOT NULL DEFAULT 'Walk-in',
        customer_phone VARCHAR(30),
        customer_email VARCHAR(100),
        branch        VARCHAR(50) NOT NULL,
        subtotal      NUMERIC(14,2) DEFAULT 0,
        discount      NUMERIC(14,2) DEFAULT 0,
        tax           NUMERIC(14,2) DEFAULT 0,
        total         NUMERIC(14,2) DEFAULT 0,
        valid_until   DATE,
        status        VARCHAR(20)  DEFAULT 'Draft' CHECK (status IN ('Draft','Sent','Accepted','Rejected','Converted','Expired')),
        notes         TEXT,
        terms         TEXT,
        converted_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
        created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by_name VARCHAR(100),
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS quotation_items (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        quote_id      UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
        product_name  VARCHAR(150) NOT NULL,
        qty           INTEGER NOT NULL DEFAULT 1,
        unit_price    NUMERIC(12,2) NOT NULL,
        line_total    NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED
      );
    `);
    await client.query(`INSERT INTO counters (key, value) VALUES ('quote', 1) ON CONFLICT DO NOTHING;`);

    // 7. RETURN TO SUPPLIER
    console.log('7️⃣  Return to Supplier...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_returns (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        return_no       VARCHAR(20) UNIQUE NOT NULL,
        supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
        supplier_name   VARCHAR(100),
        branch          VARCHAR(50),
        reason          VARCHAR(100),
        total_value     NUMERIC(14,2) DEFAULT 0,
        status          VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending','Confirmed','Refunded','Replaced')),
        notes           TEXT,
        recorded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
        recorded_by_name VARCHAR(100),
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS supplier_return_items (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        return_id     UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
        product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
        product_name  VARCHAR(150),
        qty           INTEGER NOT NULL DEFAULT 1,
        unit_cost     NUMERIC(12,2) DEFAULT 0,
        line_total    NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_cost) STORED
      );
    `);
    await client.query(`INSERT INTO counters (key, value) VALUES ('supplier_return', 1) ON CONFLICT DO NOTHING;`);

    // 8. STAFF COMMISSION
    console.log('8️⃣  Staff Commission...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_rules (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        category      VARCHAR(50)  NOT NULL,
        rate_percent  NUMERIC(6,3) NOT NULL DEFAULT 2,
        is_active     BOOLEAN DEFAULT TRUE,
        created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(category)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS commission_earnings (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        staff_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        staff_name    VARCHAR(100),
        sale_id       UUID REFERENCES sales(id) ON DELETE SET NULL,
        sale_date     DATE,
        product_name  VARCHAR(150),
        category      VARCHAR(50),
        sale_amount   NUMERIC(14,2),
        rate_percent  NUMERIC(6,3),
        commission    NUMERIC(14,2),
        status        VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Paid')),
        paid_at       TIMESTAMP,
        approved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);

    // 9. PAYROLL
    console.log('9️⃣  Payroll...');
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS basic_salary NUMERIC(14,2) DEFAULT 0;`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS nhif NUMERIC(10,2) DEFAULT 0;`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS nssf NUMERIC(10,2) DEFAULT 0;`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_pin VARCHAR(20);`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50);`);
    await client.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_frequency VARCHAR(20) DEFAULT 'Monthly';`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        period_start  DATE NOT NULL,
        period_end    DATE NOT NULL,
        pay_date      DATE,
        branch        VARCHAR(50),
        total_gross   NUMERIC(14,2) DEFAULT 0,
        total_nhif    NUMERIC(14,2) DEFAULT 0,
        total_nssf    NUMERIC(14,2) DEFAULT 0,
        total_paye    NUMERIC(14,2) DEFAULT 0,
        total_net     NUMERIC(14,2) DEFAULT 0,
        status        VARCHAR(20) DEFAULT 'Draft' CHECK (status IN ('Draft','Approved','Paid')),
        notes         TEXT,
        created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by_name VARCHAR(100),
        approved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS payroll_items (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        run_id        UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
        employee_id   UUID REFERENCES employees(id) ON DELETE SET NULL,
        employee_name VARCHAR(100),
        position      VARCHAR(100),
        branch        VARCHAR(50),
        days_worked   NUMERIC(5,1) DEFAULT 0,
        basic_salary  NUMERIC(14,2) DEFAULT 0,
        allowances    NUMERIC(14,2) DEFAULT 0,
        commission    NUMERIC(14,2) DEFAULT 0,
        gross_pay     NUMERIC(14,2) DEFAULT 0,
        nhif          NUMERIC(10,2) DEFAULT 0,
        nssf          NUMERIC(10,2) DEFAULT 0,
        paye          NUMERIC(14,2) DEFAULT 0,
        other_deductions NUMERIC(14,2) DEFAULT 0,
        net_pay       NUMERIC(14,2) DEFAULT 0,
        payment_method VARCHAR(30) DEFAULT 'Bank Transfer',
        bank_account  VARCHAR(50),
        notes         TEXT,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);

    // 10. WHATSAPP LOG
    console.log('🔟  WhatsApp Log...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_log (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        to_phone    VARCHAR(30),
        to_name     VARCHAR(100),
        message_type VARCHAR(50),
        content     TEXT,
        status      VARCHAR(20) DEFAULT 'Sent',
        sent_by     UUID REFERENCES users(id) ON DELETE SET NULL,
        sent_by_name VARCHAR(100),
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // INDEXES
    console.log('📇  Creating indexes...');
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_recon_branch_date ON cash_reconciliations(branch, recon_date)`,
      `CREATE INDEX IF NOT EXISTS idx_supp_pay_supplier ON supplier_payments(supplier_id)`,
      `CREATE INDEX IF NOT EXISTS idx_loyalty_customer  ON loyalty_accounts(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_quotes_status     ON quotations(status)`,
      `CREATE INDEX IF NOT EXISTS idx_commission_staff  ON commission_earnings(staff_id)`,
      `CREATE INDEX IF NOT EXISTS idx_payroll_run       ON payroll_items(run_id)`,
    ];
    for (const idx of indexes) await client.query(idx);

    await client.query('COMMIT');

    console.log('\n✅  All 13 feature tables created!\n');
    console.log('Tables created:');
    const tables = [
      'cash_reconciliations','supplier_payments','reorder_rules',
      'branch_counters','loyalty_accounts','loyalty_transactions',
      'loyalty_settings','quotations','quotation_items',
      'supplier_returns','supplier_return_items','commission_rules',
      'commission_earnings','payroll_runs','payroll_items','whatsapp_log'
    ];
    for (const t of tables) {
      try {
        const r = await pool.query(`SELECT COUNT(*) FROM ${t}`);
        console.log(`  ✓  ${t.padEnd(30)} ${r.rows[0].count} rows`);
      } catch { console.log(`  ✗  ${t} — check manually`); }
    }
    console.log('\nNext: restart backend, then refresh frontend.\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();