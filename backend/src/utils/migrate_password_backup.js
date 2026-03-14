/**
 * VES CONNECTIONS ERP — Password Backup System Migration
 * Creates: password_reset_tokens, adds last_login + failed_attempts to users
 * Run: node src/utils/migrate_password_backup.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require(path.resolve(__dirname, '../../config/db'));

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  VES ERP — Password Backup System Migration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await client.query('BEGIN');

    // 1. password_reset_tokens table
    console.log('🔑  Creating password_reset_tokens table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token         VARCHAR(64)  NOT NULL UNIQUE,
        token_type    VARCHAR(20)  NOT NULL DEFAULT 'RESET'
                        CHECK (token_type IN ('RESET','ADMIN_RESET','EMERGENCY')),
        created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by_name VARCHAR(100),
        used          BOOLEAN DEFAULT FALSE,
        used_at       TIMESTAMP,
        expires_at    TIMESTAMP NOT NULL,
        ip_address    VARCHAR(45),
        notes         TEXT,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. password history table — prevents reuse of last N passwords
    console.log('📜  Creating password_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_history (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        password_hash VARCHAR(255) NOT NULL,
        changed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        changed_by_name VARCHAR(100),
        change_reason VARCHAR(50) DEFAULT 'USER_CHANGE'
                        CHECK (change_reason IN ('USER_CHANGE','ADMIN_RESET','EMERGENCY_RESET','INITIAL')),
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);

    // 3. Add security columns to users (safe — IF NOT EXISTS via DO block)
    console.log('🛡️   Patching users table with security columns...');
    const secCols = [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login        TIMESTAMP",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts   SMALLINT  DEFAULT 0",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until      TIMESTAMP",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_pw    BOOLEAN   DEFAULT FALSE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS pw_last_changed   TIMESTAMP DEFAULT NOW()",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hint     VARCHAR(200)",
    ];
    for (const sql of secCols) await client.query(sql);

    // 4. Index for fast token lookups
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prt_token   ON password_reset_tokens(token);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prt_user    ON password_reset_tokens(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pwh_user    ON password_history(user_id);`);

    await client.query('COMMIT');

    console.log('\n✅  Migration complete!\n');
    console.log('Tables created:');
    console.log('  • password_reset_tokens');
    console.log('  • password_history');
    console.log('\nUsers table columns added:');
    console.log('  • last_login, failed_attempts, locked_until');
    console.log('  • must_change_pw, pw_last_changed, recovery_hint');
    console.log('\nRun the backend and test:');
    console.log('  POST /api/auth/request-reset   → generate reset token');
    console.log('  POST /api/auth/reset-password  → use token to reset');
    console.log('  POST /api/auth/admin-reset     → admin force-reset user');
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