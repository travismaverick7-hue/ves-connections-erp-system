/**
 * VES ERP — Reorder Rules Routes
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// GET all reorder rules with product info
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT rr.*, p.name AS product_name, p.quantity AS current_stock,
              p.min_stock, p.category, s.name AS supplier_name
       FROM reorder_rules rr
       JOIN products p ON p.id = rr.product_id
       LEFT JOIN suppliers s ON s.id = rr.preferred_supplier_id
       ORDER BY p.quantity ASC`
    );
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// GET alerts — products below reorder point
router.get('/alerts', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT rr.*, p.name AS product_name, p.quantity AS current_stock,
              p.min_stock, p.category, s.name AS supplier_name,
              (rr.reorder_point - p.quantity) AS shortage
       FROM reorder_rules rr
       JOIN products p ON p.id = rr.product_id
       LEFT JOIN suppliers s ON s.id = rr.preferred_supplier_id
       WHERE rr.is_active = TRUE AND p.quantity <= rr.reorder_point
       ORDER BY shortage DESC`
    );
    res.json({ success:true, data:result.rows, count: result.rowCount });
  } catch (err) { next(err); }
});

// Upsert reorder rule
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { product_id, reorder_point, reorder_qty, preferred_supplier_id, auto_po } = req.body;
    const p = await pool.query(`SELECT name FROM products WHERE id=$1`,[product_id]);
    if (!p.rows.length) return res.status(404).json({ success:false, message:'Product not found' });
    const result = await pool.query(
      `INSERT INTO reorder_rules (product_id,product_name,reorder_point,reorder_qty,preferred_supplier_id,auto_po,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (product_id) DO UPDATE SET
         reorder_point=$3,reorder_qty=$4,preferred_supplier_id=$5,auto_po=$6,updated_at=NOW()
       RETURNING *`,
      [product_id,p.rows[0].name,reorder_point,reorder_qty,preferred_supplier_id||null,auto_po||false,req.user.id]
    );
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Delete
router.delete('/:id', authenticate, authorize('Admin','Manager'), async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM reorder_rules WHERE id=$1`,[req.params.id]);
    res.json({ success:true, message:'Reorder rule deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;