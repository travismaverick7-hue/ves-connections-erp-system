const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require(path.resolve(__dirname, '../../config/db'));

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  VES ERP — Migration: Logistics · FX · Docs · M-Pesa');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await client.query('BEGIN');

    // 1. DELIVERIES — no FK on created_by_id to avoid type mismatch
    console.log('🚚  Creating deliveries tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id                SERIAL PRIMARY KEY,
        dn_number         VARCHAR(20)   NOT NULL UNIQUE,
        customer_name     VARCHAR(150)  NOT NULL,
        phone             VARCHAR(20),
        address           TEXT          NOT NULL,
        courier           VARCHAR(100),
        items_description TEXT,
        branch            VARCHAR(100)  NOT NULL DEFAULT 'Main Branch',
        notes             TEXT,
        order_id          VARCHAR(50),
        status            VARCHAR(50)   NOT NULL DEFAULT 'Pending',
        created_by_id     INT,
        created_by        VARCHAR(100),
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_timeline (
        id           SERIAL PRIMARY KEY,
        delivery_id  INT         NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
        status       VARCHAR(50) NOT NULL,
        note         TEXT,
        event_time   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deliveries_status     ON deliveries(status);
      CREATE INDEX IF NOT EXISTS idx_deliveries_branch     ON deliveries(branch);
      CREATE INDEX IF NOT EXISTS idx_delivery_timeline_did ON delivery_timeline(delivery_id);
    `);
    console.log('    ✓ deliveries + delivery_timeline');

    // 2. FX RATES
    console.log('💱  Creating fx_rates table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS fx_rates (
        id           SERIAL PRIMARY KEY,
        currency     VARCHAR(10)   NOT NULL UNIQUE,
        rate_to_kes  NUMERIC(18,6) NOT NULL,
        updated_by   VARCHAR(100),
        updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      INSERT INTO fx_rates (currency, rate_to_kes, updated_by) VALUES
        ('USD',130.50,'system'),('EUR',142.30,'system'),('GBP',165.80,'system'),
        ('CNY',18.00,'system'),('UGX',0.034,'system'),('TZS',0.051,'system'),
        ('ETB',2.30,'system'),('ZAR',7.10,'system'),('AED',35.50,'system')
      ON CONFLICT (currency) DO NOTHING;
    `);
    console.log('    ✓ fx_rates + default rates seeded');

    // 3. DOCUMENTS — no FK on uploaded_by_id
    console.log('📁  Creating documents table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id              SERIAL PRIMARY KEY,
        doc_number      VARCHAR(20)  NOT NULL UNIQUE,
        title           VARCHAR(255) NOT NULL,
        category        VARCHAR(50)  NOT NULL DEFAULT 'Other',
        description     TEXT,
        linked_to       VARCHAR(100),
        tags            TEXT[]       NOT NULL DEFAULT '{}',
        file_name       VARCHAR(255),
        file_size       INT,
        file_type       VARCHAR(100),
        file_data       TEXT,
        uploaded_by     VARCHAR(100),
        uploaded_by_id  INT,
        uploaded_at     DATE         NOT NULL DEFAULT CURRENT_DATE,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
      CREATE INDEX IF NOT EXISTS idx_documents_linked   ON documents(linked_to);
    `);
    console.log('    ✓ documents');

    // 4. MPESA — no FK on staff_id
    console.log('💚  Creating M-Pesa tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS mpesa_config (
        id              SERIAL PRIMARY KEY,
        environment     VARCHAR(20)  NOT NULL DEFAULT 'sandbox',
        shortcode       VARCHAR(20),
        consumer_key    TEXT,
        consumer_secret TEXT,
        passkey         TEXT,
        till_number     VARCHAR(20),
        paybill_number  VARCHAR(20),
        updated_by      VARCHAR(100),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      INSERT INTO mpesa_config (environment)
      SELECT 'sandbox' WHERE NOT EXISTS (SELECT 1 FROM mpesa_config);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mpesa_transactions (
        id                   SERIAL PRIMARY KEY,
        transaction_type     VARCHAR(30)   NOT NULL DEFAULT 'STK Push',
        phone                VARCHAR(20)   NOT NULL,
        amount               NUMERIC(14,2) NOT NULL,
        reference            VARCHAR(100),
        description          TEXT,
        checkout_request_id  VARCHAR(100),
        mpesa_receipt        VARCHAR(50),
        status               VARCHAR(20)   NOT NULL DEFAULT 'Pending',
        staff_id             INT,
        staff_name           VARCHAR(100),
        created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        completed_at         TIMESTAMPTZ
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mpesa_txn_status ON mpesa_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_mpesa_txn_date   ON mpesa_transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_mpesa_txn_phone  ON mpesa_transactions(phone);
    `);
    console.log('    ✓ mpesa_config + mpesa_transactions');

    await client.query('COMMIT');

    // Summary
    const tables = ['deliveries','delivery_timeline','fx_rates','documents','mpesa_config','mpesa_transactions'];
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅  Migration complete!\n');
    for (const t of tables) {
      const { rows } = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`   📋  ${t.padEnd(26)} ${rows[0].count} row(s)`);
    }
    console.log('\n🚀  Restart the backend — new routes are now active.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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