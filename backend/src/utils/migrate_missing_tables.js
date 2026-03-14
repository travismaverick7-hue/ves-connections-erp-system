const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require(path.resolve(__dirname, '../../config/db'));

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  VES ERP — Migration: Roles, Permissions, Companies,');
    console.log('            Product Categories, Warehouses, Invoices,');
    console.log('            Payments, Expense Categories, Employees,');
    console.log('            Departments, Attendance, Assets');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await client.query('BEGIN');

    // 1. COMPANIES
    console.log('🏢  companies...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(200) NOT NULL,
        email        VARCHAR(100),
        phone        VARCHAR(30),
        address      TEXT,
        logo_url     TEXT,
        industry     VARCHAR(100),
        tax_pin      VARCHAR(50),
        is_active    BOOLEAN DEFAULT TRUE,
        created_at   TIMESTAMP DEFAULT NOW(),
        updated_at   TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO companies (name, email, phone, address, industry)
      VALUES ('VES CONNECTIONS LIMITED','info@vesconnections.co.ke','+254 700 000 000','Nairobi, Kenya','Electronics & Technology')
      ON CONFLICT DO NOTHING;
    `);

    // 2. ROLES
    console.log('🔐  roles...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        is_system   BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO roles (name, description, is_system) VALUES
        ('Admin',   'Full system access', TRUE),
        ('Manager', 'Branch management access', TRUE),
        ('Cashier', 'Sales and POS access', TRUE)
      ON CONFLICT (name) DO NOTHING;
    `);

    // 3. PERMISSIONS
    console.log('🔑  permissions...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        module      VARCHAR(50) NOT NULL,
        can_view    BOOLEAN DEFAULT TRUE,
        can_create  BOOLEAN DEFAULT FALSE,
        can_edit    BOOLEAN DEFAULT FALSE,
        can_delete  BOOLEAN DEFAULT FALSE,
        UNIQUE(role_id, module)
      );
      -- Seed Admin permissions (full access)
      INSERT INTO permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      SELECT r.id, m.module, TRUE, TRUE, TRUE, TRUE
      FROM roles r,
      (VALUES
        ('inventory'),('sales'),('purchase_orders'),('customers'),('suppliers'),
        ('expenses'),('reports'),('users'),('settings'),('logistics'),
        ('documents'),('mpesa'),('currency'),('assets'),('employees'),
        ('attendance'),('invoices'),('payments'),('warehouses')
      ) AS m(module)
      WHERE r.name = 'Admin'
      ON CONFLICT (role_id, module) DO NOTHING;

      -- Manager permissions
      INSERT INTO permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      SELECT r.id, m.module, TRUE, m.cc, m.ce, m.cd
      FROM roles r,
      (VALUES
        ('inventory',TRUE,TRUE,FALSE),('sales',TRUE,TRUE,FALSE),
        ('purchase_orders',TRUE,TRUE,FALSE),('customers',TRUE,TRUE,TRUE),
        ('suppliers',TRUE,TRUE,TRUE),('expenses',TRUE,TRUE,FALSE),
        ('reports',TRUE,FALSE,FALSE),('logistics',TRUE,TRUE,TRUE),
        ('documents',TRUE,TRUE,FALSE),('employees',TRUE,FALSE,FALSE),
        ('attendance',TRUE,TRUE,FALSE),('invoices',TRUE,TRUE,FALSE),
        ('payments',TRUE,TRUE,FALSE),('warehouses',TRUE,FALSE,FALSE)
      ) AS m(module,cc,ce,cd)
      WHERE r.name = 'Manager'
      ON CONFLICT (role_id, module) DO NOTHING;

      -- Cashier permissions
      INSERT INTO permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      SELECT r.id, m.module, TRUE, m.cc, FALSE, FALSE
      FROM roles r,
      (VALUES ('inventory',FALSE),('sales',TRUE),('customers',TRUE)) AS m(module,cc)
      WHERE r.name = 'Cashier'
      ON CONFLICT (role_id, module) DO NOTHING;
    `);

    // 4. PRODUCT CATEGORIES
    console.log('📂  product_categories...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        parent_id   UUID REFERENCES product_categories(id) ON DELETE SET NULL,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO product_categories (name) VALUES
        ('Smartphones'),('Accessories'),('Cables'),('Chargers'),
        ('Audio'),('Bags'),('Power'),('Displays'),('Storage'),('Other')
      ON CONFLICT (name) DO NOTHING;
    `);

    // 5. WAREHOUSES (branches as proper entities)
    console.log('🏭  warehouses...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(100) UNIQUE NOT NULL,
        location    VARCHAR(200),
        manager     VARCHAR(100),
        phone       VARCHAR(30),
        capacity    INTEGER,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO warehouses (name, location, manager) VALUES
        ('Main Branch',  'Jewel Complex, Nairobi CBD', 'System Administrator'),
        ('West Branch',  'Westlands, Nairobi', NULL),
        ('Juja Branch',  'Juja, Kiambu County', NULL)
      ON CONFLICT (name) DO NOTHING;
    `);

    // 6. INVENTORY (proper stock ledger separate from products)
    console.log('📦  inventory...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        qty_on_hand  INTEGER NOT NULL DEFAULT 0,
        qty_reserved INTEGER NOT NULL DEFAULT 0,
        qty_available INTEGER GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
        updated_at   TIMESTAMP DEFAULT NOW(),
        UNIQUE(product_id, warehouse_id)
      );
      CREATE INDEX IF NOT EXISTS idx_inventory_product   ON inventory(product_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_warehouse ON inventory(warehouse_id);
    `);

    // 7. STOCK MOVEMENTS (full audit trail)
    console.log('📊  stock_movements...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
        product_name  VARCHAR(150),
        warehouse_id  UUID REFERENCES warehouses(id) ON DELETE SET NULL,
        warehouse_name VARCHAR(100),
        movement_type VARCHAR(30) NOT NULL
                        CHECK (movement_type IN ('Purchase','Sale','Transfer In','Transfer Out','Adjustment','Return','Opening')),
        qty           INTEGER NOT NULL,
        qty_before    INTEGER,
        qty_after     INTEGER,
        reference_id  VARCHAR(100),
        reference_type VARCHAR(30),
        notes         TEXT,
        created_by    VARCHAR(100),
        created_at    TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_stockmov_product   ON stock_movements(product_id);
      CREATE INDEX IF NOT EXISTS idx_stockmov_warehouse ON stock_movements(warehouse_id);
      CREATE INDEX IF NOT EXISTS idx_stockmov_type      ON stock_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_stockmov_date      ON stock_movements(created_at);
    `);

    // 8. INVOICES
    console.log('🧾  invoices + invoice_items...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_number  VARCHAR(20) UNIQUE NOT NULL,
        customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
        customer_name   VARCHAR(100) NOT NULL,
        customer_email  VARCHAR(100),
        customer_phone  VARCHAR(30),
        sale_id         UUID REFERENCES sales(id) ON DELETE SET NULL,
        branch          VARCHAR(50),
        subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount        NUMERIC(14,2) NOT NULL DEFAULT 0,
        tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 16,
        tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
        total           NUMERIC(14,2) NOT NULL DEFAULT 0,
        amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
        balance         NUMERIC(14,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
        status          VARCHAR(20) DEFAULT 'Draft'
                          CHECK (status IN ('Draft','Sent','Paid','Partial','Overdue','Cancelled')),
        due_date        DATE,
        notes           TEXT,
        terms           TEXT,
        created_by      VARCHAR(100),
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS invoice_items (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
        description  VARCHAR(255) NOT NULL,
        qty          INTEGER NOT NULL DEFAULT 1,
        unit_price   NUMERIC(12,2) NOT NULL,
        discount     NUMERIC(5,2) DEFAULT 0,
        line_total   NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_price * (1 - discount/100)) STORED
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_customer  ON invoices(customer_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_due       ON invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_inv_items_invoice  ON invoice_items(invoice_id);
    `);

    // 9. PAYMENTS (unified payments table)
    console.log('💰  payments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_number  VARCHAR(20) UNIQUE NOT NULL,
        payment_type    VARCHAR(20) NOT NULL CHECK (payment_type IN ('Received','Sent')),
        method          VARCHAR(30) NOT NULL DEFAULT 'Cash',
        amount          NUMERIC(14,2) NOT NULL,
        reference_type  VARCHAR(30),
        reference_id    VARCHAR(100),
        party_name      VARCHAR(150),
        party_type      VARCHAR(20) DEFAULT 'Customer',
        notes           TEXT,
        branch          VARCHAR(50),
        recorded_by     VARCHAR(100),
        payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at      TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_payments_date      ON payments(payment_date);
      CREATE INDEX IF NOT EXISTS idx_payments_type      ON payments(payment_type);
      CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference_type, reference_id);
    `);

    // 10. EXPENSE CATEGORIES
    console.log('💸  expense_categories...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        budget      NUMERIC(14,2) DEFAULT 0,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO expense_categories (name) VALUES
        ('Rent'),('Utilities'),('Salaries'),('Transport'),('Marketing'),
        ('Supplies'),('Maintenance'),('Insurance'),('Tax'),('Other')
      ON CONFLICT (name) DO NOTHING;
    `);

    // 11. DEPARTMENTS
    console.log('🏛️  departments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        manager_id  UUID,
        budget      NUMERIC(14,2) DEFAULT 0,
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO departments (name) VALUES
        ('Sales'),('Operations'),('Finance'),('IT'),('HR'),('Management')
      ON CONFLICT (name) DO NOTHING;
    `);

    // 12. EMPLOYEES
    console.log('👤  employees...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        employee_number VARCHAR(20) UNIQUE NOT NULL,
        name            VARCHAR(100) NOT NULL,
        email           VARCHAR(100),
        phone           VARCHAR(30),
        id_number       VARCHAR(30),
        department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
        department_name VARCHAR(100),
        job_title       VARCHAR(100),
        branch          VARCHAR(50),
        employment_type VARCHAR(20) DEFAULT 'Full-Time'
                          CHECK (employment_type IN ('Full-Time','Part-Time','Contract','Intern')),
        salary          NUMERIC(14,2) DEFAULT 0,
        hire_date       DATE NOT NULL DEFAULT CURRENT_DATE,
        status          VARCHAR(20) DEFAULT 'Active'
                          CHECK (status IN ('Active','Inactive','Terminated','On Leave')),
        user_id         UUID,
        avatar          VARCHAR(5),
        notes           TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_employees_dept   ON employees(department_id);
      CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch);
      CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
    `);

    // 13. ATTENDANCE
    console.log('📅  attendance...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        employee_name   VARCHAR(100),
        date            DATE NOT NULL,
        clock_in        TIMESTAMP,
        clock_out       TIMESTAMP,
        hours_worked    NUMERIC(5,2),
        status          VARCHAR(20) DEFAULT 'Present'
                          CHECK (status IN ('Present','Absent','Late','Half-Day','Leave','Holiday')),
        notes           TEXT,
        recorded_by     VARCHAR(100),
        created_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(employee_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance(date);
      CREATE INDEX IF NOT EXISTS idx_attendance_status   ON attendance(status);
    `);

    // 14. ASSETS
    console.log('🖥️  assets...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        asset_number    VARCHAR(20) UNIQUE NOT NULL,
        name            VARCHAR(150) NOT NULL,
        category        VARCHAR(50) NOT NULL DEFAULT 'Equipment',
        description     TEXT,
        serial_number   VARCHAR(100),
        brand           VARCHAR(100),
        model           VARCHAR(100),
        purchase_date   DATE,
        purchase_price  NUMERIC(14,2) DEFAULT 0,
        current_value   NUMERIC(14,2) DEFAULT 0,
        depreciation_rate NUMERIC(5,2) DEFAULT 0,
        location        VARCHAR(100),
        warehouse_id    UUID REFERENCES warehouses(id) ON DELETE SET NULL,
        assigned_to     VARCHAR(100),
        employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
        status          VARCHAR(20) DEFAULT 'Active'
                          CHECK (status IN ('Active','Maintenance','Disposed','Lost','Transferred')),
        notes           TEXT,
        created_by      VARCHAR(100),
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_assets_category  ON assets(category);
      CREATE INDEX IF NOT EXISTS idx_assets_status    ON assets(status);
      CREATE INDEX IF NOT EXISTS idx_assets_warehouse ON assets(warehouse_id);
    `);

    await client.query('COMMIT');

    // Summary
    const tables = [
      'companies','roles','permissions','product_categories','warehouses',
      'inventory','stock_movements','invoices','invoice_items',
      'payments','expense_categories','departments','employees','attendance','assets'
    ];
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅  Migration complete!\n');
    for (const t of tables) {
      const { rows } = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`   📋  ${t.padEnd(22)} ${rows[0].count} row(s)`);
    }
    console.log('\n🚀  Now add the backend routes and restart the server.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌  Migration FAILED:', err.message, '\n');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();