const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { status, customer_id, search } = req.query;
    const where = [], params = [];
    if (status) { params.push(status); where.push(`i.status=$${params.length}`); }
    if (customer_id) { params.push(customer_id); where.push(`i.customer_id=$${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`(i.invoice_number ILIKE $${params.length} OR i.customer_name ILIKE $${params.length})`); }
    const { rows } = await pool.query(`
      SELECT i.*, json_agg(json_build_object(
        'id',ii.id,'description',ii.description,'qty',ii.qty,'unit_price',ii.unit_price,'line_total',ii.line_total
      ) ORDER BY ii.description) FILTER (WHERE ii.id IS NOT NULL) AS items
      FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id=i.id
      ${where.length ? 'WHERE '+where.join(' AND ') : ''}
      GROUP BY i.id ORDER BY i.created_at DESC
    `, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_id, customer_name, customer_email, customer_phone, items, branch, notes, terms, due_date, tax_rate, discount } = req.body;
    if (!customer_name || !items?.length) return res.status(400).json({ success: false, message: 'Customer and items required.' });

    await client.query('BEGIN');
    const countRes = await client.query("SELECT COUNT(*) FROM invoices");
    const inv_num = `INV-${String(parseInt(countRes.rows[0].count)+1).padStart(4,'0')}`;
    const taxR = parseFloat(tax_rate||16);
    const disc = parseFloat(discount||0);
    const subtotal = items.reduce((s,i) => s + (i.qty * i.unit_price), 0);
    const tax_amount = (subtotal - disc) * taxR / 100;
    const total = subtotal - disc + tax_amount;

    const { rows } = await client.query(
      `INSERT INTO invoices (invoice_number,customer_id,customer_name,customer_email,customer_phone,branch,subtotal,discount,tax_rate,tax_amount,total,due_date,notes,terms,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Draft',$15) RETURNING *`,
      [inv_num, customer_id||null, customer_name, customer_email||null, customer_phone||null,
       branch||'Main Branch', subtotal, disc, taxR, tax_amount, total,
       due_date||null, notes||null, terms||null, req.user.name]
    );
    const inv = rows[0];
    for (const item of items) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id,product_id,description,qty,unit_price,discount) VALUES ($1,$2,$3,$4,$5,$6)`,
        [inv.id, item.product_id||null, item.description, item.qty, item.unit_price, item.discount||0]
      );
    }
    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'CREATE', 'invoice', inv.id, inv_num);
    const full = await pool.query(`
      SELECT i.*, json_agg(json_build_object('id',ii.id,'description',ii.description,'qty',ii.qty,'unit_price',ii.unit_price,'line_total',ii.line_total)) AS items
      FROM invoices i LEFT JOIN invoice_items ii ON ii.invoice_id=i.id WHERE i.id=$1 GROUP BY i.id`, [inv.id]);
    res.status(201).json({ success: true, data: full.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ['Draft','Sent','Paid','Partial','Overdue','Cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
    const { rows } = await pool.query(
      `UPDATE invoices SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`, [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    await auditLog(req.user.id, req.user.name, 'UPDATE', 'invoice', req.params.id, `→ ${status}`);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query("UPDATE invoices SET status='Cancelled',updated_at=NOW() WHERE id=$1", [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DELETE', 'invoice', req.params.id);
    res.json({ success: true, message: 'Invoice cancelled.' });
  } catch (e) { next(e); }
});

module.exports = router;