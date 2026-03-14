const express  = require('express');
const router   = express.Router();
const pool     = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// ── CUSTOMERS ─────────────────────────────────────────────────────────────────
const custRouter = express.Router();
custRouter.use(authenticate);

custRouter.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    let sql = `SELECT * FROM customers WHERE is_active=TRUE`;
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)`; }
    sql += ` ORDER BY name`;
    const { rows } = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
});

custRouter.get('/:id', async (req, res, next) => {
  try {
    const cRes = await pool.query('SELECT * FROM customers WHERE id=$1', [req.params.id]);
    if (!cRes.rows.length) return res.status(404).json({ success: false, message: 'Customer not found.' });
    const sRes = await pool.query(`
      SELECT s.receipt_no, s.sale_date, s.total, s.pay_method, s.branch
      FROM sales s WHERE s.customer_id = $1 ORDER BY s.created_at DESC LIMIT 10
    `, [req.params.id]);
    res.json({ success: true, data: { ...cRes.rows[0], recent_sales: sRes.rows } });
  } catch (err) { next(err); }
});

custRouter.post('/', async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const { rows } = await pool.query(
      `INSERT INTO customers (name,phone,email) VALUES ($1,$2,$3) RETURNING *`, [name,phone||null,email||null]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE_CUSTOMER', 'customers', rows[0].id, name, req.ip);
    res.status(201).json({ success: true, message: 'Customer added.', data: rows[0] });
  } catch (err) { next(err); }
});

custRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, phone, email } = req.body;
    const { rows } = await pool.query(
      `UPDATE customers SET name=$1,phone=$2,email=$3,updated_at=NOW() WHERE id=$4 RETURNING *`,
      [name, phone||null, email||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Customer not found.' });
    res.json({ success: true, message: 'Customer updated.', data: rows[0] });
  } catch (err) { next(err); }
});

custRouter.delete('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    await pool.query('UPDATE customers SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Customer removed.' });
  } catch (err) { next(err); }
});

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────
const suppRouter = express.Router();
suppRouter.use(authenticate);

suppRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM suppliers WHERE is_active=TRUE ORDER BY name`);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

suppRouter.post('/', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, contact, email, address, categories, rating } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const { rows } = await pool.query(
      `INSERT INTO suppliers (name,contact,email,address,categories,rating)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, contact||null, email||null, address||null, categories||null, rating||3]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE_SUPPLIER', 'suppliers', rows[0].id, name, req.ip);
    res.status(201).json({ success: true, message: 'Supplier added.', data: rows[0] });
  } catch (err) { next(err); }
});

suppRouter.put('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, contact, email, address, categories, rating, balance } = req.body;
    const { rows } = await pool.query(
      `UPDATE suppliers SET name=$1,contact=$2,email=$3,address=$4,categories=$5,
         rating=$6,balance=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name,contact,email,address,categories,rating,balance||0,req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Supplier not found.' });
    res.json({ success: true, message: 'Supplier updated.', data: rows[0] });
  } catch (err) { next(err); }
});

suppRouter.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE suppliers SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Supplier removed.' });
  } catch (err) { next(err); }
});

// ── EXPENSES ──────────────────────────────────────────────────────────────────
const expRouter = express.Router();
expRouter.use(authenticate);

expRouter.get('/', async (req, res, next) => {
  try {
    const { branch, start_date, end_date, category } = req.query;
    let where = []; const params = [];
    if (branch && branch !== 'all') { params.push(branch); where.push(`branch = $${params.length}`); }
    if (category) { params.push(category); where.push(`category = $${params.length}`); }
    if (start_date) { params.push(start_date); where.push(`expense_date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);   where.push(`expense_date <= $${params.length}`); }

    const sql = `SELECT * FROM expenses ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY expense_date DESC, created_at DESC`;
    const { rows } = await pool.query(sql, params);
    const total = rows.reduce((s, e) => s + parseFloat(e.amount), 0);
    res.json({ success: true, count: rows.length, total, data: rows });
  } catch (err) { next(err); }
});

expRouter.post('/', async (req, res, next) => {
  try {
    const { category, description, amount, branch, expense_date } = req.body;
    if (!amount || !branch) return res.status(400).json({ success: false, message: 'Amount and branch required.' });
    const { rows } = await pool.query(
      `INSERT INTO expenses (category,description,amount,branch,added_by_id,added_by,expense_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [category||'Other', description||null, amount, branch, req.user.id, req.user.name, expense_date||new Date().toISOString().split('T')[0]]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE_EXPENSE', 'expenses', rows[0].id, `${category}: KSh ${amount}`, req.ip);
    res.status(201).json({ success: true, message: 'Expense recorded.', data: rows[0] });
  } catch (err) { next(err); }
});

expRouter.delete('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Expense deleted.' });
  } catch (err) { next(err); }
});

module.exports = { custRouter, suppRouter, expRouter };
