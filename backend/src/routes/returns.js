const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET all returns
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name as processed_by_name
       FROM sales_returns r
       LEFT JOIN users u ON r.processed_by = u.id
       ORDER BY r.created_at DESC LIMIT 200`
    );
    // Parse items JSON
    rows.forEach(r => { if (typeof r.items === 'string') r.items = JSON.parse(r.items); });
    res.json({ success:true, data:rows });
  } catch(e) { next(e); }
});

// POST process return
router.post('/', async (req, res, next) => {
  const { receiptNo, saleId, customer, items, refundAmount, reason, refundMethod, notes, branch } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Restore stock for returned items
    for (const item of items) {
      if (!item.returnQty || item.returnQty <= 0) continue;
      if (branch === 'Main Branch') {
        await client.query('UPDATE products SET main_branch_qty=main_branch_qty+$1 WHERE id=$2', [item.returnQty, item.productId]);
      } else {
        await client.query('UPDATE products SET west_branch_qty=west_branch_qty+$1 WHERE id=$2', [item.returnQty, item.productId]);
      }
    }
    // Record the return
    const { rows:[ret] } = await client.query(
      `INSERT INTO sales_returns (receipt_no, sale_id, customer_name, items, refund_amount, reason, refund_method, notes, branch, processed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [receiptNo, saleId||null, customer, JSON.stringify(items), +refundAmount, reason, refundMethod, notes||'', branch||'Main Branch', req.user.id]
    );
    await client.query('COMMIT');
    ret.items = items;
    res.json({ success:true, data:ret });
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

module.exports = router;