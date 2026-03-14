/**
 * VES CONNECTIONS ERP — Data Wipe Routes
 * Admin-only. Requires confirmation code.
 *
 * POST /api/admin/wipe/preview     — counts before wipe (no deletion)
 * POST /api/admin/wipe/transactions — wipes transaction tables only
 * POST /api/admin/wipe/full         — wipes ALL data except users & products
 *
 * Both wipe routes require:
 *   { confirmCode: "WIPE-CONFIRM", scope: "transactions"|"full" }
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

const CONFIRM_CODE = 'WIPE-CONFIRM';

// ─── helper: count rows in a table ───────────────────────────────────────────
async function count(client, table) {
  try {
    const r = await client.query(`SELECT COUNT(*) AS n FROM ${table}`);
    return parseInt(r.rows[0].n, 10);
  } catch { return 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/wipe/preview
// Returns row counts for every wipe-able table — safe, no deletion
// ─────────────────────────────────────────────────────────────────────────────
router.post('/preview', authenticate, authorize('Admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const TRANSACTION_TABLES = [
      'sale_items', 'sales', 'sales_returns',
      'po_items', 'purchase_orders',
      'expenses',
      'debt_payments', 'debts',
      'stock_transfers',
      'cash_registers',
      'time_logs',
      'device_movements', 'onfon_devices',
    ];
    const FULL_EXTRA_TABLES = [
      'customers', 'suppliers', 'products',
    ];

    const transactionCounts = {};
    for (const t of TRANSACTION_TABLES) {
      transactionCounts[t] = await count(client, t);
    }
    const fullCounts = {};
    for (const t of FULL_EXTRA_TABLES) {
      fullCounts[t] = await count(client, t);
    }

    const txTotal   = Object.values(transactionCounts).reduce((s, n) => s + n, 0);
    const fullTotal = txTotal + Object.values(fullCounts).reduce((s, n) => s + n, 0);

    res.json({
      success: true,
      transaction_tables: transactionCounts,
      full_extra_tables:  fullCounts,
      totals: {
        transactions: txTotal,
        full:         fullTotal,
      },
    });
  } catch (err) { next(err); }
  finally { client.release(); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/wipe/transactions
// Deletes: sales, sale_items, sales_returns, expenses, purchase_orders, po_items,
//          debts, debt_payments, stock_transfers, cash_registers, time_logs,
//          device_movements, onfon_devices (keeps users, products, customers, suppliers)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/transactions', authenticate, authorize('Admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { confirmCode, reason = '' } = req.body;
    if (confirmCode !== CONFIRM_CODE) {
      return res.status(400).json({ success: false, message: 'Invalid confirmation code. Type WIPE-CONFIRM exactly.' });
    }

    await client.query('BEGIN');

    const deleted = {};

    // Order matters — child tables first (FK constraints)
    const steps = [
      // Onfon
      ['device_movements', 'DELETE FROM device_movements'],
      ['onfon_devices',    'DELETE FROM onfon_devices'],
      // Sales
      ['sale_items',       'DELETE FROM sale_items'],
      ['sales_returns',    'DELETE FROM sales_returns'],
      ['sales',            'DELETE FROM sales'],
      // POs
      ['po_items',         'DELETE FROM po_items'],
      ['purchase_orders',  'DELETE FROM purchase_orders'],
      // Expenses
      ['expenses',         'DELETE FROM expenses'],
      // Debts
      ['debt_payments',    'DELETE FROM debt_payments'],
      ['debts',            'DELETE FROM debts'],
      // Other
      ['stock_transfers',  'DELETE FROM stock_transfers'],
      ['cash_registers',   'DELETE FROM cash_registers'],
      ['time_logs',        'DELETE FROM time_logs'],
    ];

    for (const [table, sql] of steps) {
      try {
        const r = await client.query(sql + ' RETURNING id');
        deleted[table] = r.rowCount || 0;
      } catch {
        deleted[table] = 0; // table may not exist yet (e.g. onfon tables before migration)
      }
    }

    // Reset receipt counter
    await client.query(`UPDATE counters SET value = 1 WHERE key = 'receipt'`);

    // Reset customer spend totals & visits
    await client.query(`UPDATE customers SET total_spent = 0, visits = 0`);

    await auditLog(
      req.user.id, req.user.name,
      'WIPE_TRANSACTIONS', 'system', null,
      `Transaction wipe. Reason: ${reason || 'Not specified'}. Rows deleted: ${JSON.stringify(deleted)}`,
      req.ip
    );

    await client.query('COMMIT');

    const totalDeleted = Object.values(deleted).reduce((s, n) => s + n, 0);
    res.json({
      success: true,
      message: `✅ Transaction wipe complete. ${totalDeleted} rows deleted across ${steps.length} tables.`,
      deleted,
      total_deleted: totalDeleted,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/wipe/full
// Wipes everything except users & system tables.
// IRREVERSIBLE — requires extra confirm.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/full', authenticate, authorize('Admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { confirmCode, reason = '' } = req.body;
    if (confirmCode !== CONFIRM_CODE) {
      return res.status(400).json({ success: false, message: 'Invalid confirmation code.' });
    }

    await client.query('BEGIN');

    const deleted = {};
    const steps = [
      // Onfon
      ['device_movements',  'DELETE FROM device_movements'],
      ['onfon_devices',     'DELETE FROM onfon_devices'],
      // Sales
      ['sale_items',        'DELETE FROM sale_items'],
      ['sales_returns',     'DELETE FROM sales_returns'],
      ['sales',             'DELETE FROM sales'],
      // POs
      ['po_items',          'DELETE FROM po_items'],
      ['purchase_orders',   'DELETE FROM purchase_orders'],
      // Expenses
      ['expenses',          'DELETE FROM expenses'],
      // Debts
      ['debt_payments',     'DELETE FROM debt_payments'],
      ['debts',             'DELETE FROM debts'],
      // Other transactional
      ['stock_transfers',   'DELETE FROM stock_transfers'],
      ['cash_registers',    'DELETE FROM cash_registers'],
      ['time_logs',         'DELETE FROM time_logs'],
      // Master data (full wipe only)
      ['customers',         'DELETE FROM customers'],
      ['suppliers',         'DELETE FROM suppliers'],
      ['products',          'DELETE FROM products'],
    ];

    for (const [table, sql] of steps) {
      try {
        const r = await client.query(sql + ' RETURNING id');
        deleted[table] = r.rowCount || 0;
      } catch {
        deleted[table] = 0;
      }
    }

    // Reset counters
    await client.query(`UPDATE counters SET value = 1 WHERE key = 'receipt'`);

    await auditLog(
      req.user.id, req.user.name,
      'WIPE_FULL', 'system', null,
      `FULL DATA WIPE. Reason: ${reason || 'Not specified'}. Rows: ${JSON.stringify(deleted)}`,
      req.ip
    );

    await client.query('COMMIT');

    const totalDeleted = Object.values(deleted).reduce((s, n) => s + n, 0);
    res.json({
      success: true,
      message: `✅ Full wipe complete. ${totalDeleted} rows deleted. Users preserved.`,
      deleted,
      total_deleted: totalDeleted,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;