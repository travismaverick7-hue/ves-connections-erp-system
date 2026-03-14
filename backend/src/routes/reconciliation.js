/**
 * VES ERP — Cash Reconciliation Routes
 * GET  /api/reconciliation          - list by branch/date
 * POST /api/reconciliation          - create/update draft
 * PUT  /api/reconciliation/:id/submit - submit for approval
 * PUT  /api/reconciliation/:id/approve - approve (Manager/Admin)
 * GET  /api/reconciliation/summary   - variance summary
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// List reconciliations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { branch, month, limit = 30 } = req.query;
    let q = `SELECT r.*, u.name AS submitted_by_name, a.name AS approved_by_name
             FROM cash_reconciliations r
             LEFT JOIN users u ON u.id = r.submitted_by
             LEFT JOIN users a ON a.id = r.approved_by
             WHERE 1=1`;
    const params = [];
    if (branch && branch !== 'all') { params.push(branch); q += ` AND r.branch = $${params.length}`; }
    if (month) { params.push(month); q += ` AND TO_CHAR(r.recon_date,'YYYY-MM') = $${params.length}`; }
    params.push(limit);
    q += ` ORDER BY r.recon_date DESC LIMIT $${params.length}`;
    const result = await pool.query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// Create or update draft
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { branch, recon_date, opening_float=0, cash_sales=0, mpesa_sales=0,
            card_sales=0, other_sales=0, cash_counted=0, expenses_cash=0, notes='' } = req.body;
    const variance = cash_counted - (Number(opening_float) + Number(cash_sales) - Number(expenses_cash));
    const result = await pool.query(
      `INSERT INTO cash_reconciliations
         (branch,recon_date,opening_float,cash_sales,mpesa_sales,card_sales,other_sales,
          cash_counted,variance,expenses_cash,notes,submitted_by,submitted_by_name,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Draft')
       ON CONFLICT (branch,recon_date) DO UPDATE SET
         opening_float=$3,cash_sales=$4,mpesa_sales=$5,card_sales=$6,other_sales=$7,
         cash_counted=$8,variance=$9,expenses_cash=$10,notes=$11,
         submitted_by=$12,submitted_by_name=$13,updated_at=NOW()
       RETURNING *`,
      [branch,recon_date,opening_float,cash_sales,mpesa_sales,card_sales,
       other_sales,cash_counted,variance,expenses_cash,notes,req.user.id,req.user.name]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// Submit
router.put('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE cash_reconciliations SET status='Submitted',updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success:false, message:'Not found' });
    await auditLog(req.user.id,req.user.name,'RECON_SUBMITTED','cash_reconciliations',req.params.id,null,req.ip);
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Approve
router.put('/:id/approve', authenticate, authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE cash_reconciliations SET status='Approved',approved_by=$1,approved_by_name=$2,approved_at=NOW(),updated_at=NOW() WHERE id=$3 RETURNING *`,
      [req.user.id,req.user.name,req.params.id]
    );
    await auditLog(req.user.id,req.user.name,'RECON_APPROVED','cash_reconciliations',req.params.id,null,req.ip);
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Summary — variance analysis
router.get('/summary', authenticate, async (req, res, next) => {
  try {
    const { branch, days=30 } = req.query;
    let q = `SELECT branch, COUNT(*) as total_days,
               SUM(cash_sales) as total_cash_sales,
               SUM(mpesa_sales) as total_mpesa,
               SUM(variance) as total_variance,
               AVG(variance) as avg_variance,
               SUM(CASE WHEN variance < 0 THEN 1 ELSE 0 END) as shortage_days,
               SUM(CASE WHEN variance > 0 THEN 1 ELSE 0 END) as surplus_days
             FROM cash_reconciliations
             WHERE recon_date >= CURRENT_DATE - $1::int`;
    const params = [days];
    if (branch && branch !== 'all') { params.push(branch); q += ` AND branch = $${params.length}`; }
    q += ` GROUP BY branch ORDER BY branch`;
    const result = await pool.query(q, params);
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

module.exports = router;