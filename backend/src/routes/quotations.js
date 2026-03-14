/**
 * VES ERP — Quotations / Proforma Invoice Routes
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// Generate quote number
async function nextQuoteNo(client) {
  const r = await client.query(`UPDATE counters SET value=value+1 WHERE key='quote' RETURNING value`);
  return `QT-${String(r.rows[0].value).padStart(4,'0')}`;
}

// List
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, branch, search } = req.query;
    let q = `SELECT q.*, COUNT(qi.id) AS item_count
             FROM quotations q LEFT JOIN quotation_items qi ON qi.quote_id=q.id
             WHERE 1=1`;
    const p = [];
    if (status) { p.push(status); q+=` AND q.status=$${p.length}`; }
    if (branch && branch!=='all') { p.push(branch); q+=` AND q.branch=$${p.length}`; }
    if (search) { p.push(`%${search}%`); q+=` AND (q.customer_name ILIKE $${p.length} OR q.quote_no ILIKE $${p.length})`; }
    q += ` GROUP BY q.id ORDER BY q.created_at DESC LIMIT 100`;
    const result = await pool.query(q, p);
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Get single
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const q = await pool.query(`SELECT * FROM quotations WHERE id=$1`,[req.params.id]);
    if (!q.rows.length) return res.status(404).json({ success:false, message:'Not found' });
    const items = await pool.query(`SELECT * FROM quotation_items WHERE quote_id=$1`,[req.params.id]);
    res.json({ success:true, data:{ ...q.rows[0], items:items.rows } });
  } catch (err) { next(err); }
});

// Create
router.post('/', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_name='Walk-in', customer_id, customer_phone, customer_email,
            branch, discount=0, tax=0, notes='', terms='', valid_until, items=[] } = req.body;
    if (!items.length) return res.status(400).json({ success:false, message:'At least one item required' });
    await client.query('BEGIN');
    const quote_no = await nextQuoteNo(client);
    const subtotal = items.reduce((s,i)=>s+(i.qty*i.unit_price),0);
    const total    = subtotal - Number(discount) + Number(tax);
    const q = await client.query(
      `INSERT INTO quotations (quote_no,customer_id,customer_name,customer_phone,customer_email,
         branch,subtotal,discount,tax,total,valid_until,notes,terms,status,created_by,created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Draft',$14,$15) RETURNING *`,
      [quote_no,customer_id||null,customer_name,customer_phone,customer_email,
       branch,subtotal,discount,tax,total,valid_until||null,notes,terms,req.user.id,req.user.name]
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO quotation_items (quote_id,product_id,product_name,qty,unit_price) VALUES ($1,$2,$3,$4,$5)`,
        [q.rows[0].id, item.product_id||null, item.product_name, item.qty, item.unit_price]
      );
    }
    await auditLog(req.user.id,req.user.name,'QUOTE_CREATED','quotations',q.rows[0].id,quote_no,req.ip);
    await client.query('COMMIT');
    res.json({ success:true, data:{ ...q.rows[0], items }, message:`Quotation ${quote_no} created` });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// Update status
router.patch('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      `UPDATE quotations SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Delete
router.delete('/:id', authenticate, authorize('Admin','Manager'), async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM quotations WHERE id=$1`,[req.params.id]);
    res.json({ success:true, message:'Quotation deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;