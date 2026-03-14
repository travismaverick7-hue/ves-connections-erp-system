const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET today's register for a branch
router.get('/today', async (req, res, next) => {
  const { branch } = req.query;
  const today = new Date().toISOString().split('T')[0];
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name as opened_by_name
       FROM cash_registers r
       LEFT JOIN users u ON r.opened_by = u.id
       WHERE r.date=$1 AND ($2::text IS NULL OR r.branch=$2)
       ORDER BY r.created_at DESC LIMIT 1`,
      [today, branch||null]
    );
    res.json({ success:true, data:rows[0]||null });
  } catch(e) { next(e); }
});

// GET register history
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.name as opened_by_name
       FROM cash_registers r
       LEFT JOIN users u ON r.opened_by = u.id
       ORDER BY r.created_at DESC LIMIT 60`
    );
    res.json({ success:true, data:rows });
  } catch(e) { next(e); }
});

// POST open register
router.post('/open', async (req, res, next) => {
  const { openingFloat, branch } = req.body;
  const today = new Date().toISOString().split('T')[0];
  try {
    const { rows:[existing] } = await pool.query(
      'SELECT id FROM cash_registers WHERE date=$1 AND branch=$2 AND status=$3',
      [today, branch, 'Open']
    );
    if (existing) return res.status(400).json({ success:false, message:'Register already open for today' });
    const { rows:[reg] } = await pool.query(
      `INSERT INTO cash_registers (date, branch, opening_float, opened_by, status)
       VALUES ($1,$2,$3,$4,'Open') RETURNING *`,
      [today, branch, +openingFloat, req.user.id]
    );
    res.json({ success:true, data:reg });
  } catch(e) { next(e); }
});

// POST close register
router.post('/:id/close', async (req, res, next) => {
  const { closingCash, notes } = req.body;
  try {
    const { rows:[reg] } = await pool.query(
      `UPDATE cash_registers SET closing_cash=$1, notes=$2, status='Closed', closed_at=NOW()
       WHERE id=$3 RETURNING *`,
      [+closingCash, notes||'', req.params.id]
    );
    res.json({ success:true, data:reg });
  } catch(e) { next(e); }
});

module.exports = router;