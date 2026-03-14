const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET all transfers
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name as transferred_by_name
       FROM stock_transfers t
       LEFT JOIN users u ON t.transferred_by = u.id
       ORDER BY t.created_at DESC LIMIT 200`
    );
    res.json({ success:true, data:rows });
  } catch(e) { next(e); }
});

// POST create transfer
router.post('/', async (req, res, next) => {
  const { productId, qty, fromBranch, toBranch, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Check available stock
    const { rows:[prod] } = await client.query('SELECT * FROM products WHERE id=$1', [productId]);
    if (!prod) throw Object.assign(new Error('Product not found'), { status:404 });
    const available = fromBranch === 'Main Branch' ? prod.main_branch_qty : prod.west_branch_qty;
    if (qty > available) throw Object.assign(new Error(`Only ${available} units available at ${fromBranch}`), { status:400 });

    // Update stock
    if (fromBranch === 'Main Branch') {
      await client.query('UPDATE products SET main_branch_qty=main_branch_qty-$1, west_branch_qty=west_branch_qty+$1 WHERE id=$2', [qty, productId]);
    } else {
      await client.query('UPDATE products SET west_branch_qty=west_branch_qty-$1, main_branch_qty=main_branch_qty+$1 WHERE id=$2', [qty, productId]);
    }

    // Record transfer
    const { rows:[transfer] } = await client.query(
      `INSERT INTO stock_transfers (product_id, product_name, qty, from_branch, to_branch, notes, transferred_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [productId, prod.name, qty, fromBranch, toBranch, notes||'', req.user.id]
    );
    await client.query('COMMIT');
    res.json({ success:true, data:transfer });
  } catch(e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

module.exports = router;