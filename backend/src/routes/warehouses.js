const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.*, COUNT(DISTINCT i.product_id) AS product_count,
             COALESCE(SUM(i.qty_on_hand),0) AS total_stock
      FROM warehouses w LEFT JOIN inventory i ON i.warehouse_id=w.id
      WHERE w.is_active=TRUE GROUP BY w.id ORDER BY w.name
    `);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', authorize('Admin'), async (req, res, next) => {
  try {
    const { name, location, manager, phone, capacity } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const { rows } = await pool.query(
      `INSERT INTO warehouses (name,location,manager,phone,capacity) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, location||null, manager||null, phone||null, capacity||null]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'warehouse', rows[0].id, name);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, location, manager, phone, capacity } = req.body;
    const { rows } = await pool.query(
      `UPDATE warehouses SET name=$1,location=$2,manager=$3,phone=$4,capacity=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, location||null, manager||null, phone||null, capacity||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;