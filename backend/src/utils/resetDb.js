/**
 * VES CONNECTIONS LIMITED — Database Reset Script
 * ─────────────────────────────────────────────────
 * Clears ALL demo/seed data from the database.
 * Keeps the admin user account intact.
 * Run ONCE before handing over the system to the owner.
 *
 * Usage:
 *   node src/utils/resetDb.js
 */
require('dotenv').config();
const pool = require('../../config/db');

async function reset() {
  const client = await pool.connect();
  try {
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  VES CONNECTIONS LIMITED — Database Reset');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('⚠️  This will permanently delete ALL demo data.');
    console.log('   The admin user account will be preserved.');
    console.log('');

    await client.query('BEGIN');

    // ── 1. Clear transactional data first (FK order) ──────────────────────
    console.log('🗑️  Clearing sale items...');
    await client.query('DELETE FROM sale_items');

    console.log('🗑️  Clearing sales...');
    await client.query('DELETE FROM sales');

    console.log('🗑️  Clearing purchase order items...');
    await client.query('DELETE FROM po_items');

    console.log('🗑️  Clearing purchase orders...');
    await client.query('DELETE FROM purchase_orders');

    console.log('🗑️  Clearing expenses...');
    await client.query('DELETE FROM expenses');

    console.log('🗑️  Clearing debt payments...');
    await client.query('DELETE FROM debt_payments');

    console.log('🗑️  Clearing debts...');
    await client.query('DELETE FROM debts');

    console.log('🗑️  Clearing sales returns...');
    await client.query('DELETE FROM sales_returns');

    console.log('🗑️  Clearing stock transfers...');
    await client.query('DELETE FROM stock_transfers');

    console.log('🗑️  Clearing cash registers...');
    await client.query('DELETE FROM cash_registers');

    console.log('🗑️  Clearing time logs...');
    await client.query('DELETE FROM time_logs');

    console.log('🗑️  Clearing audit log...');
    await client.query('DELETE FROM audit_log');

    // ── 2. Clear master data ──────────────────────────────────────────────
    console.log('🗑️  Clearing customers...');
    await client.query('DELETE FROM customers');

    console.log('🗑️  Clearing products...');
    await client.query('DELETE FROM products');

    console.log('🗑️  Clearing suppliers...');
    await client.query('DELETE FROM suppliers');

    // ── 3. Remove demo staff — keep only admin ────────────────────────────
    console.log('🗑️  Removing demo staff accounts (james, mary)...');
    await client.query(`DELETE FROM users WHERE username IN ('james', 'mary')`);

    // ── 4. Reset receipt counter ──────────────────────────────────────────
    console.log('🔄  Resetting receipt counter to 1...');
    await client.query(`
      INSERT INTO counters (key, value) VALUES ('receipt', 1)
      ON CONFLICT (key) DO UPDATE SET value = 1
    `).catch(() => {
      // counters table may not exist — that's fine
    });

    await client.query('COMMIT');

    // ── 5. Summary ────────────────────────────────────────────────────────
    const { rows: remaining } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users)           AS users,
        (SELECT COUNT(*) FROM products)        AS products,
        (SELECT COUNT(*) FROM sales)           AS sales,
        (SELECT COUNT(*) FROM customers)       AS customers,
        (SELECT COUNT(*) FROM suppliers)       AS suppliers,
        (SELECT COUNT(*) FROM expenses)        AS expenses,
        (SELECT COUNT(*) FROM purchase_orders) AS orders
    `);

    console.log('');
    console.log('✅  Database reset complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Remaining records:');
    console.log(`   👤 Users:           ${remaining[0].users}  (admin account kept)`);
    console.log(`   📦 Products:        ${remaining[0].products}`);
    console.log(`   🛒 Sales:           ${remaining[0].sales}`);
    console.log(`   👥 Customers:       ${remaining[0].customers}`);
    console.log(`   🤝 Suppliers:       ${remaining[0].suppliers}`);
    console.log(`   💸 Expenses:        ${remaining[0].expenses}`);
    console.log(`   📋 Purchase Orders: ${remaining[0].orders}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('🚀  The system is now ready for the owner to use.');
    console.log('   Admin login: admin / (your current admin password)');
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('❌  Reset failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

reset();