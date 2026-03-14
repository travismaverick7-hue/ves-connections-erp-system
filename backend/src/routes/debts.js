const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET all debts
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM debts ORDER BY created_at DESC`
    );
    res.json({ success:true, data:rows });
  } catch(e) { next(e); }
});

// POST create debt
router.post('/', async (req, res, next) => {
  const { customerName, phone, amount, description, dueDate, branch } = req.body;
  try {
    const { rows:[debt] } = await pool.query(
      `INSERT INTO debts (customer_name, phone, amount, paid, description, due_date, branch, status, created_by)
       VALUES ($1,$2,$3,0,$4,$5,$6,'Unpaid',$7) RETURNING *`,
      [customerName, phone||'', +amount, description||'', dueDate||null, branch||'Main Branch', req.user.id]
    );
    res.json({ success:true, data:debt });
  } catch(e) { next(e); }
});

// POST record payment
router.post('/:id/pay', async (req, res, next) => {
  const { payAmount } = req.body;
  try {
    const { rows:[debt] } = await pool.query('SELECT * FROM debts WHERE id=$1', [req.params.id]);
    if (!debt) return res.status(404).json({ success:false, message:'Debt not found' });
    const newPaid = parseFloat(debt.paid) + parseFloat(payAmount);
    const status  = newPaid >= parseFloat(debt.amount) ? 'Paid' : 'Partial';
    const { rows:[updated] } = await pool.query(
      `UPDATE debts SET paid=$1, status=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [newPaid, status, req.params.id]
    );
    // Record payment history
    await pool.query(
      `INSERT INTO debt_payments (debt_id, amount, paid_by) VALUES ($1,$2,$3)`,
      [req.params.id, payAmount, req.user.id]
    );
    res.json({ success:true, data:updated });
  } catch(e) { next(e); }
});

// DELETE debt
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM debts WHERE id=$1', [req.params.id]);
    res.json({ success:true });
  } catch(e) { next(e); }
});

module.exports = router;