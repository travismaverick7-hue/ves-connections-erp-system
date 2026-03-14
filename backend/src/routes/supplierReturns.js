/**
 * VES ERP — Supplier Returns Routes
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

async function nextReturnNo(client) {
  const r = await client.query(`UPDATE counters SET value=value+1 WHERE key='supplier_return' RETURNING value`);
  return `SR-${String(r.rows[0].value).padStart(4,'0')}`;
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT sr.*, COUNT(sri.id) AS item_count
       FROM supplier_returns sr LEFT JOIN supplier_return_items sri ON sri.return_id=sr.id
       GROUP BY sr.id ORDER BY sr.created_at DESC LIMIT 100`
    );
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const r = await pool.query(`SELECT * FROM supplier_returns WHERE id=$1`,[req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success:false, message:'Not found' });
    const items = await pool.query(`SELECT * FROM supplier_return_items WHERE return_id=$1`,[req.params.id]);
    res.json({ success:true, data:{ ...r.rows[0], items:items.rows } });
  } catch (err) { next(err); }
});

router.post('/', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { supplier_id, supplier_name, branch, reason, notes='', items=[] } = req.body;
    if (!items.length) return res.status(400).json({ success:false, message:'Add at least one item' });
    await client.query('BEGIN');
    const return_no = await nextReturnNo(client);
    const total_value = items.reduce((s,i)=>s+(i.qty*(i.unit_cost||0)),0);
    const r = await client.query(
      `INSERT INTO supplier_returns (return_no,supplier_id,supplier_name,branch,reason,total_value,notes,status,recorded_by,recorded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending',$8,$9) RETURNING *`,
      [return_no,supplier_id||null,supplier_name,branch,reason,total_value,notes,req.user.id,req.user.name]
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO supplier_return_items (return_id,product_id,product_name,qty,unit_cost) VALUES ($1,$2,$3,$4,$5)`,
        [r.rows[0].id,item.product_id||null,item.product_name,item.qty,item.unit_cost||0]
      );
      // Deduct from stock
      if (item.product_id) {
        await client.query(`UPDATE products SET quantity=GREATEST(0,quantity-$1) WHERE id=$2`,[item.qty,item.product_id]);
      }
    }
    await auditLog(req.user.id,req.user.name,'SUPPLIER_RETURN_CREATED','supplier_returns',r.rows[0].id,return_no,req.ip);
    await client.query('COMMIT');
    res.json({ success:true, data:r.rows[0], message:`Supplier return ${return_no} created` });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

router.patch('/:id/status', authenticate, authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE supplier_returns SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.body.status, req.params.id]
    );
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;