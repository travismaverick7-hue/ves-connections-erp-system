const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require(path.resolve(__dirname, '../../config/db'));

async function fix() {
  const client = await pool.connect();
  try {
    console.log('\n🔧 Fixing mpesa_transactions.staff_id column type...');
    await client.query('BEGIN');

    // Change staff_id from INT to TEXT to accept any user ID format
    await client.query(`
      ALTER TABLE mpesa_transactions
        ALTER COLUMN staff_id TYPE TEXT USING staff_id::TEXT;
    `);

    // Same fix for deliveries and documents
    await client.query(`
      ALTER TABLE deliveries
        ALTER COLUMN created_by_id TYPE TEXT USING created_by_id::TEXT;
    `);
    await client.query(`
      ALTER TABLE documents
        ALTER COLUMN uploaded_by_id TYPE TEXT USING uploaded_by_id::TEXT;
    `);

    await client.query('COMMIT');
    console.log('✅ All ID columns changed to TEXT — no more "invalid ID format" errors.');
    console.log('🚀 Restart the backend server.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Fix failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fix();