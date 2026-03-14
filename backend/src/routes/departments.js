const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, COUNT(e.id) AS employee_count
      FROM departments d LEFT JOIN employees e ON e.department_id=d.id AND e.status='Active'
      WHERE d.is_active=TRUE GROUP BY d.id ORDER BY d.name
    `);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', authorize('Admin'), async (req, res, next) => {
  try {
    const { name, description, budget } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const { rows } = await pool.query(
      `INSERT INTO departments (name,description,budget) VALUES ($1,$2,$3) RETURNING *`,
      [name, description||null, budget||0]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'department', rows[0].id, name);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    const { name, description, budget } = req.body;
    const { rows } = await pool.query(
      `UPDATE departments SET name=$1,description=$2,budget=$3 WHERE id=$4 RETURNING *`,
      [name, description||null, budget||0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE departments SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Department deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;