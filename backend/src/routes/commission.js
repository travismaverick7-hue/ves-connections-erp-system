/**
 * VES ERP — Staff Commission Routes
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// Get all rules
router.get('/rules', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM commission_rules ORDER BY category`);
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Upsert rule
router.post('/rules', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { category, rate_percent } = req.body;
    const result = await pool.query(
      `INSERT INTO commission_rules (category,rate_percent,created_by)
       VALUES ($1,$2,$3)
       ON CONFLICT (category) DO UPDATE SET rate_percent=$2,updated_at=NOW()
       RETURNING *`,
      [category, rate_percent, req.user.id]
    );
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Delete rule
router.delete('/rules/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM commission_rules WHERE id=$1`,[req.params.id]);
    res.json({ success:true, message:'Rule deleted' });
  } catch (err) { next(err); }
});

// Staff earnings summary
router.get('/earnings', authenticate, async (req, res, next) => {
  try {
    const { staff_id, month, status } = req.query;
    let q = `SELECT ce.*, u.name AS staff_name FROM commission_earnings ce LEFT JOIN users u ON u.id=ce.staff_id WHERE 1=1`;
    const p = [];
    if (staff_id) { p.push(staff_id); q+=` AND ce.staff_id=$${p.length}`; }
    if (month)    { p.push(month);    q+=` AND TO_CHAR(ce.sale_date,'YYYY-MM')=$${p.length}`; }
    if (status)   { p.push(status);   q+=` AND ce.status=$${p.length}`; }
    q += ` ORDER BY ce.created_at DESC LIMIT 200`;
    const result = await pool.query(q,p);
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Summary per staff
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const { month } = req.query;
    let q = `SELECT staff_id, staff_name,
               SUM(commission) AS total_commission,
               SUM(sale_amount) AS total_sales,
               COUNT(*) AS transactions,
               SUM(CASE WHEN status='Paid' THEN commission ELSE 0 END) AS paid,
               SUM(CASE WHEN status='Pending' THEN commission ELSE 0 END) AS pending
             FROM commission_earnings WHERE 1=1`;
    const p = [];
    if (month) { p.push(month); q+=` AND TO_CHAR(sale_date,'YYYY-MM')=$${p.length}`; }
    q += ` GROUP BY staff_id, staff_name ORDER BY total_commission DESC`;
    const result = await pool.query(q,p);
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Approve earnings
router.patch('/earnings/:id/approve', authenticate, authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE commission_earnings SET status='Approved',approved_by=$1 WHERE id=$2 RETURNING *`,
      [req.user.id,req.params.id]
    );
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Mark paid
router.patch('/earnings/pay-batch', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { staff_id, month } = req.body;
    await pool.query(
      `UPDATE commission_earnings SET status='Paid',paid_at=NOW()
       WHERE staff_id=$1 AND TO_CHAR(sale_date,'YYYY-MM')=$2 AND status='Approved'`,
      [staff_id, month]
    );
    res.json({ success:true, message:'Commission marked as paid' });
  } catch (err) { next(err); }
});

// Calculate commission for a sale (utility endpoint)
router.post('/calculate', authenticate, async (req, res, next) => {
  try {
    const { items } = req.body; // [{category, amount}]
    const rules = (await pool.query(`SELECT * FROM commission_rules WHERE is_active=TRUE`)).rows;
    const ruleMap = {};
    rules.forEach(r => ruleMap[r.category] = r.rate_percent);
    const breakdown = (items||[]).map(item => ({
      ...item,
      rate: ruleMap[item.category] || 0,
      commission: ((ruleMap[item.category]||0)/100) * item.amount
    }));
    const total = breakdown.reduce((s,i)=>s+i.commission,0);
    res.json({ success:true, breakdown, total });
  } catch (err) { next(err); }
});

module.exports = router;