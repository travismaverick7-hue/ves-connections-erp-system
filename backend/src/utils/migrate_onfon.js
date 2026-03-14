const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require(path.resolve(__dirname, '../../config/db'));

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  VES ERP — Onfon Stock Management Migration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await client.query('BEGIN');

    // 1. AGENTS
    console.log('👤  agents...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        agent_name  VARCHAR(100) NOT NULL,
        phone       VARCHAR(30),
        email       VARCHAR(100),
        region      VARCHAR(100),
        status      VARCHAR(20) DEFAULT 'Active'
                      CHECK (status IN ('Active','Inactive','Suspended')),
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. ONFON DEVICES
    console.log('📱  onfon_devices...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS onfon_devices (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        product_name   VARCHAR(150) NOT NULL,
        brand          VARCHAR(100) NOT NULL DEFAULT 'Onfon',
        model          VARCHAR(100) NOT NULL,
        imei           VARCHAR(20) UNIQUE NOT NULL,
        supplier_id    UUID REFERENCES suppliers(id) ON DELETE SET NULL,
        status         VARCHAR(25) NOT NULL DEFAULT 'IN_STOCK'
                         CHECK (status IN ('IN_STOCK','ASSIGNED_TO_AGENT','SOLD','RETURNED','DAMAGED')),
        received_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        warehouse_id   UUID REFERENCES warehouses(id) ON DELETE SET NULL,
        agent_id       UUID REFERENCES agents(id) ON DELETE SET NULL,
        sold_date      DATE,
        customer_name  VARCHAR(150),
        notes          TEXT,
        received_by    VARCHAR(100),
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_onfon_imei       ON onfon_devices(imei);
      CREATE INDEX IF NOT EXISTS idx_onfon_status     ON onfon_devices(status);
      CREATE INDEX IF NOT EXISTS idx_onfon_agent      ON onfon_devices(agent_id);
      CREATE INDEX IF NOT EXISTS idx_onfon_received   ON onfon_devices(received_date);
    `);

    // 3. DEVICE MOVEMENTS
    console.log('🔄  device_movements...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS device_movements (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id      UUID NOT NULL REFERENCES onfon_devices(id) ON DELETE CASCADE,
        imei           VARCHAR(20) NOT NULL,
        movement_type  VARCHAR(20) NOT NULL
                         CHECK (movement_type IN ('RECEIVED','ASSIGNED','SOLD','RETURNED','DAMAGED','TRANSFERRED')),
        from_location  VARCHAR(100),
        to_location    VARCHAR(100),
        agent_id       UUID REFERENCES agents(id) ON DELETE SET NULL,
        agent_name     VARCHAR(100),
        customer_name  VARCHAR(150),
        performed_by   VARCHAR(100),
        notes          TEXT,
        date           TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at     TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_devmov_device ON device_movements(device_id);
      CREATE INDEX IF NOT EXISTS idx_devmov_imei   ON device_movements(imei);
      CREATE INDEX IF NOT EXISTS idx_devmov_type   ON device_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_devmov_date   ON device_movements(date);
    `);

    await client.query('COMMIT');

    const tables = ['agents','onfon_devices','device_movements'];
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅  Migration complete!\n');
    for (const t of tables) {
      const { rows } = await pool.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`   📋  ${t.padEnd(22)} ${rows[0].count} row(s)`);
    }
    console.log('\n🚀  Run: node src/routes/onfon.js — then restart server.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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