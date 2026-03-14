const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM expense_categories WHERE is_active=TRUE ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, description, budget } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const { rows } = await pool.query(
      `INSERT INTO expense_categories (name,description,budget) VALUES ($1,$2,$3) RETURNING *`,
      [name, description||null, budget||0]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, description, budget } = req.body;
    const { rows } = await pool.query(
      `UPDATE expense_categories SET name=$1,description=$2,budget=$3 WHERE id=$4 RETURNING *`,
      [name, description||null, budget||0, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE expense_categories SET is_active=FALSE WHERE id=$1', [req.params.id]);
    res.json({ success: true, message: 'Category deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;