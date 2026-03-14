/**
 * VES ERP — Payroll Routes
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// Kenya PAYE bands (2024)
function calcPAYE(gross) {
  let tax = 0;
  const bands = [[24000,10],[8333,25],[467667,30]];
  let remaining = gross;
  for (const [band, rate] of bands) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band);
    tax += taxable * rate / 100;
    remaining -= taxable;
  }
  return Math.max(0, tax - 2400); // personal relief
}

// List runs
router.get('/runs', authenticate, async (req, res, next) => {
  try {
    const { branch } = req.query;
    let q = `SELECT pr.*, COUNT(pi.id) AS staff_count FROM payroll_runs pr
             LEFT JOIN payroll_items pi ON pi.run_id=pr.id WHERE 1=1`;
    const p = [];
    if (branch && branch!=='all') { p.push(branch); q+=` AND pr.branch=$${p.length}`; }
    q += ` GROUP BY pr.id ORDER BY pr.period_start DESC LIMIT 24`;
    const result = await pool.query(q,p);
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Get run with items
router.get('/runs/:id', authenticate, async (req, res, next) => {
  try {
    const run = await pool.query(`SELECT * FROM payroll_runs WHERE id=$1`,[req.params.id]);
    if (!run.rows.length) return res.status(404).json({ success:false, message:'Not found' });
    const items = await pool.query(`SELECT * FROM payroll_items WHERE run_id=$1 ORDER BY employee_name`,[req.params.id]);
    res.json({ success:true, data:{ ...run.rows[0], items:items.rows } });
  } catch (err) { next(err); }
});

// Create payroll run
router.post('/runs', authenticate, authorize('Admin','Manager'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { period_start, period_end, branch, notes='' } = req.body;
    await client.query('BEGIN');

    // Fetch employees for branch
    let empQ = `SELECT e.*, u.name AS user_name FROM employees e LEFT JOIN users u ON u.username=e.employee_id WHERE e.is_active=TRUE`;
    const empP = [];
    if (branch && branch!=='all') { empP.push(branch); empQ+=` AND e.branch=$${empP.length}`; }
    const employees = (await client.query(empQ, empP)).rows;

    if (!employees.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success:false, message:'No active employees found for this branch' });
    }

    // Calculate attendance days in period
    const daysQuery = `
      SELECT user_id, COUNT(*) AS days_present
      FROM time_logs
      WHERE date BETWEEN $1 AND $2 AND clock_out IS NOT NULL
      GROUP BY user_id`;
    const attendance = (await client.query(daysQuery,[period_start,period_end])).rows;
    const attendMap = {};
    attendance.forEach(a => attendMap[a.user_id] = parseInt(a.days_present));

    // Pending approved commissions
    const commissions = (await client.query(
      `SELECT staff_id, SUM(commission) AS total FROM commission_earnings
       WHERE status='Approved' AND sale_date BETWEEN $1 AND $2 GROUP BY staff_id`,
      [period_start, period_end]
    )).rows;
    const commMap = {};
    commissions.forEach(c => commMap[c.staff_id] = parseFloat(c.total));

    const items = [];
    let total_gross=0, total_nhif=0, total_nssf=0, total_paye=0, total_net=0;

    for (const emp of employees) {
      const basic = parseFloat(emp.basic_salary||0);
      const days  = attendMap[emp.id] || 0;
      const comm  = commMap[emp.id] || 0;
      const allowances = 0;
      const gross = basic + allowances + comm;
      const nhif  = parseFloat(emp.nhif||0);
      const nssf  = parseFloat(emp.nssf||0);
      const paye  = calcPAYE(gross);
      const net   = Math.max(0, gross - nhif - nssf - paye);

      total_gross+=gross; total_nhif+=nhif; total_nssf+=nssf; total_paye+=paye; total_net+=net;
      items.push({ emp, basic, days, comm, allowances, gross, nhif, nssf, paye, net });
    }

    // Create run
    const runResult = await client.query(
      `INSERT INTO payroll_runs (period_start,period_end,branch,total_gross,total_nhif,total_nssf,total_paye,total_net,notes,status,created_by,created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Draft',$10,$11) RETURNING *`,
      [period_start,period_end,branch||'All',total_gross,total_nhif,total_nssf,total_paye,total_net,notes,req.user.id,req.user.name]
    );
    const run_id = runResult.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO payroll_items (run_id,employee_id,employee_name,position,branch,days_worked,basic_salary,allowances,commission,gross_pay,nhif,nssf,paye,net_pay,bank_account)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [run_id,item.emp.id,item.emp.name,item.emp.position,item.emp.branch,
         item.days,item.basic,item.allowances,item.comm,item.gross,
         item.nhif,item.nssf,item.paye,item.net,item.emp.bank_account||'']
      );
    }

    await auditLog(req.user.id,req.user.name,'PAYROLL_CREATED','payroll_runs',run_id,`${period_start} to ${period_end}`,req.ip);
    await client.query('COMMIT');
    res.json({ success:true, data:runResult.rows[0], message:`Payroll run created for ${employees.length} employees` });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// Approve run
router.patch('/runs/:id/approve', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE payroll_runs SET status='Approved',approved_by=$1 WHERE id=$2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    await auditLog(req.user.id,req.user.name,'PAYROLL_APPROVED','payroll_runs',req.params.id,null,req.ip);
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Mark paid + clear commissions
router.patch('/runs/:id/pay', authenticate, authorize('Admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const run = (await client.query(`SELECT * FROM payroll_runs WHERE id=$1`,[req.params.id])).rows[0];
    await client.query(`UPDATE payroll_runs SET status='Paid',pay_date=NOW() WHERE id=$1`,[req.params.id]);
    // Mark commissions as paid
    const items = (await client.query(`SELECT employee_id FROM payroll_items WHERE run_id=$1`,[req.params.id])).rows;
    for (const item of items) {
      await client.query(
        `UPDATE commission_earnings SET status='Paid',paid_at=NOW()
         WHERE staff_id=$1 AND sale_date BETWEEN $2 AND $3 AND status='Approved'`,
        [item.employee_id, run.period_start, run.period_end]
      );
    }
    await client.query('COMMIT');
    res.json({ success:true, message:'Payroll marked as paid. Commissions cleared.' });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

module.exports = router;