const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

router.use(authenticate);

// GET /api/sales
router.get('/', async (req, res, next) => {
  try {
    const { branch, start_date, end_date, pay_method, search } = req.query;
    let where = [];
    const params = [];

    if (branch && branch !== 'all') { params.push(branch); where.push(`s.branch = $${params.length}`); }
    if (start_date) { params.push(start_date); where.push(`s.sale_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   where.push(`s.sale_date <= $${params.length}`); }
    if (pay_method) { params.push(pay_method); where.push(`s.pay_method = $${params.length}`); }
    if (search)     { params.push(`%${search}%`); where.push(`(s.receipt_no ILIKE $${params.length} OR s.customer_name ILIKE $${params.length})`); }

    const sql = `
      SELECT s.*,
        json_agg(json_build_object(
          'id', si.id, 'product_id', si.product_id,
          'product_name', si.product_name,
          'qty', si.qty, 'unit_price', si.unit_price,
          'line_total', si.line_total
        ) ORDER BY si.product_name) AS items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
});

// GET /api/sales/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*,
        json_agg(json_build_object(
          'id', si.id, 'product_id', si.product_id,
          'product_name', si.product_name,
          'qty', si.qty, 'unit_price', si.unit_price, 'line_total', si.line_total
        )) AS items
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.id = $1 GROUP BY s.id
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Sale not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/sales — record new sale
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_id, customer_name, branch, pay_method, discount, notes, items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Sale must have at least one item.' });
    }

    await client.query('BEGIN');

    // Get next receipt number (atomic)
    const cntRes = await client.query(
      `UPDATE counters SET value = value + 1 WHERE key = 'receipt' RETURNING value`
    );
    const receiptNo = `RCP-${String(cntRes.rows[0].value).padStart(4,'0')}`;

    // Calculate totals
    let subtotal = 0;
    for (const it of items) {
      // validate product exists and has stock
      const pRes = await client.query('SELECT * FROM products WHERE id = $1 AND is_active = TRUE', [it.product_id]);
      if (!pRes.rows.length) throw Object.assign(new Error(`Product not found: ${it.product_id}`), { status: 400 });
      const p = pRes.rows[0];
      const available = branch === 'Main Branch' ? p.main_branch_qty : p.west_branch_qty;
      if (available < it.qty) throw Object.assign(new Error(`Insufficient stock for ${p.name}. Available: ${available}`), { status: 400 });
      subtotal += it.unit_price * it.qty;
    }
    const discAmt = parseFloat(discount) || 0;
    const total   = subtotal - discAmt;

    // Insert sale
    const saleRes = await client.query(
      `INSERT INTO sales
         (receipt_no,customer_id,customer_name,branch,staff_id,staff_name,
          pay_method,subtotal,discount,tax,total,notes,sale_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,CURRENT_DATE) RETURNING *`,
      [receiptNo, customer_id||null, customer_name||'Walk-in', branch,
       req.user.id, req.user.name, pay_method||'Cash',
       subtotal, discAmt, total, notes||null]
    );
    const sale = saleRes.rows[0];

    // Insert items & deduct stock
    for (const it of items) {
      await client.query(
        `INSERT INTO sale_items (sale_id,product_id,product_name,qty,unit_price)
         VALUES ($1,$2,$3,$4,$5)`,
        [sale.id, it.product_id, it.product_name, it.qty, it.unit_price]
      );
      const col = branch === 'Main Branch' ? 'main_branch_qty' : 'west_branch_qty';
      await client.query(
        `UPDATE products SET ${col} = ${col} - $1, updated_at = NOW() WHERE id = $2`,
        [it.qty, it.product_id]
      );
    }

    // Update customer stats if known
    if (customer_id) {
      await client.query(
        `UPDATE customers SET total_spent = total_spent + $1, visits = visits + 1, updated_at = NOW() WHERE id = $2`,
        [total, customer_id]
      );
    }

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'CREATE_SALE', 'sales', sale.id, receiptNo, req.ip);

    // Return full sale with items
    const full = await pool.query(`
      SELECT s.*, json_agg(json_build_object(
        'product_name',si.product_name,'qty',si.qty,'unit_price',si.unit_price,'line_total',si.line_total
      )) AS items FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id WHERE s.id = $1 GROUP BY s.id`, [sale.id]);

    res.status(201).json({ success: true, message: `Sale recorded — ${receiptNo}`, data: full.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/sales/:id/status
router.patch('/:id/status', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE sales SET status=$1 WHERE id=$2 RETURNING id,receipt_no,status`, [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Sale not found.' });
    res.json({ success: true, message: 'Status updated.', data: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
