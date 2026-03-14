const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const todayStr = () => new Date().toISOString().split('T')[0];

// GET all logs (admin sees all, others see own)
router.get('/', async (req, res, next) => {
  try {
    const isAdmin = ['Admin','Manager'].includes(req.user.role);
    const { rows } = await pool.query(
      `SELECT t.*, u.name as staff_name, u.role as staff_role
       FROM time_logs t
       LEFT JOIN users u ON t.user_id = u.id
       ${isAdmin ? '' : 'WHERE t.user_id=$1'}
       ORDER BY t.date DESC, t.clock_in DESC LIMIT 100`,
      isAdmin ? [] : [req.user.id]
    );
    res.json({ success:true, data:rows });
  } catch(e) { next(e); }
});

// GET today's log for current user
router.get('/today', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, u.name as staff_name FROM time_logs t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.user_id=$1 AND t.date=$2 ORDER BY t.clock_in DESC LIMIT 1`,
      [req.user.id, todayStr()]
    );
    res.json({ success:true, data:rows[0]||null });
  } catch(e) { next(e); }
});

// POST clock in
router.post('/clock-in', async (req, res, next) => {
  try {
    const { rows:[existing] } = await pool.query(
      'SELECT id FROM time_logs WHERE user_id=$1 AND date=$2',
      [req.user.id, todayStr()]
    );
    if (existing) return res.status(400).json({ success:false, message:'Already clocked in today' });
    const { rows:[log] } = await pool.query(
      `INSERT INTO time_logs (user_id, date, clock_in, branch)
       VALUES ($1,$2,NOW(),$3) RETURNING *`,
      [req.user.id, todayStr(), req.body.branch||req.user.branch||'Main Branch']
    );
    res.json({ success:true, data:log });
  } catch(e) { next(e); }
});

// POST clock out
router.post('/clock-out', async (req, res, next) => {
  try {
    const { rows:[log] } = await pool.query(
      'SELECT * FROM time_logs WHERE user_id=$1 AND date=$2',
      [req.user.id, todayStr()]
    );
    if (!log)        return res.status(400).json({ success:false, message:'Not clocked in today' });
    if (log.clock_out) return res.status(400).json({ success:false, message:'Already clocked out' });
    const { rows:[updated] } = await pool.query(
      `UPDATE time_logs SET clock_out=NOW(),
       hours=ROUND(EXTRACT(EPOCH FROM (NOW()-clock_in))/3600, 2)
       WHERE id=$1 RETURNING *`,
      [log.id]
    );
    res.json({ success:true, data:updated });
  } catch(e) { next(e); }
});

module.exports = router;