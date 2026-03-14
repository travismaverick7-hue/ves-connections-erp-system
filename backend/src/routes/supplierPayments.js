/**
 * VES ERP — Supplier Payments Routes
 * GET  /api/supplier-payments              - list all payments
 * GET  /api/supplier-payments/supplier/:id - payments for one supplier
 * POST /api/supplier-payments              - record a payment
 * GET  /api/supplier-payments/balance/:id  - supplier balance summary
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// List all
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { supplier_id, limit=50 } = req.query;
    let q = `SELECT sp.*, s.name AS supplier_name
             FROM supplier_payments sp
             JOIN suppliers s ON s.id = sp.supplier_id
             WHERE 1=1`;
    const params = [];
    if (supplier_id) { params.push(supplier_id); q += ` AND sp.supplier_id=$${params.length}`; }
    params.push(limit);
    q += ` ORDER BY sp.payment_date DESC LIMIT $${params.length}`;
    const result = await pool.query(q, params);
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Payments for one supplier
router.get('/supplier/:id', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM supplier_payments WHERE supplier_id=$1 ORDER BY payment_date DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Record payment
router.post('/', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { supplier_id, amount, pay_method='Cash', reference='', notes='', payment_date } = req.body;
    if (!supplier_id || !amount) return res.status(400).json({ success:false, message:'supplier_id and amount required' });
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO supplier_payments (supplier_id,supplier_name,amount,pay_method,reference,notes,payment_date,recorded_by,recorded_by_name)
       SELECT $1, name, $2, $3, $4, $5, $6, $7, $8 FROM suppliers WHERE id=$1
       RETURNING *`,
      [supplier_id, amount, pay_method, reference, notes, payment_date||new Date().toISOString().split('T')[0], req.user.id, req.user.name]
    );
    // Reduce supplier owed balance
    await client.query(`UPDATE suppliers SET balance_owed = GREATEST(0, COALESCE(balance_owed,0) - $1) WHERE id=$2`, [amount, supplier_id]);
    await auditLog(req.user.id,req.user.name,'SUPPLIER_PAYMENT','suppliers',supplier_id,`KSh ${amount} via ${pay_method}`,req.ip);
    await client.query('COMMIT');
    res.json({ success:true, data:result.rows[0], message:'Payment recorded successfully.' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// Balance summary per supplier
router.get('/balance/:id', authenticate, async (req, res, next) => {
  try {
    const supplier = await pool.query(`SELECT id,name,balance_owed,payment_terms FROM suppliers WHERE id=$1`,[req.params.id]);
    if (!supplier.rows.length) return res.status(404).json({ success:false, message:'Supplier not found' });
    const payments = await pool.query(
      `SELECT SUM(amount) AS total_paid, COUNT(*) AS payment_count FROM supplier_payments WHERE supplier_id=$1`,
      [req.params.id]
    );
    const pos = await pool.query(
      `SELECT SUM(total) AS total_ordered FROM purchase_orders WHERE supplier_id=$1 AND status='Delivered'`,
      [req.params.id]
    );
    res.json({
      success: true,
      data: {
        ...supplier.rows[0],
        total_paid: payments.rows[0].total_paid || 0,
        payment_count: payments.rows[0].payment_count || 0,
        total_ordered: pos.rows[0].total_ordered || 0,
      }
    });
  } catch (err) { next(err); }
});

module.exports = router;