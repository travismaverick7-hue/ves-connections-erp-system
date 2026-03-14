const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { date, employee_id, status, month } = req.query;
    const where = [], params = [];
    if (date)        { params.push(date);        where.push(`a.date=$${params.length}`); }
    if (employee_id) { params.push(employee_id); where.push(`a.employee_id=$${params.length}`); }
    if (status)      { params.push(status);      where.push(`a.status=$${params.length}`); }
    if (month)       { params.push(month);       where.push(`TO_CHAR(a.date,'YYYY-MM')=$${params.length}`); }
    const { rows } = await pool.query(
      `SELECT a.*, e.employee_number, e.job_title, e.department_name
       FROM attendance a JOIN employees e ON e.id=a.employee_id
       ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.date DESC, a.employee_name`, params
    );
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { employee_id, date, clock_in, clock_out, status, notes } = req.body;
    if (!employee_id || !date) return res.status(400).json({ success: false, message: 'Employee and date required.' });
    const emp = await pool.query('SELECT name FROM employees WHERE id=$1', [employee_id]);
    if (!emp.rows.length) return res.status(404).json({ success: false, message: 'Employee not found.' });
    let hours = null;
    if (clock_in && clock_out) {
      hours = (new Date(clock_out) - new Date(clock_in)) / 3600000;
    }
    const { rows } = await pool.query(
      `INSERT INTO attendance (employee_id,employee_name,date,clock_in,clock_out,hours_worked,status,notes,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (employee_id,date) DO UPDATE SET
         clock_in=$4,clock_out=$5,hours_worked=$6,status=$7,notes=$8,recorded_by=$9
       RETURNING *`,
      [employee_id, emp.rows[0].name, date, clock_in||null, clock_out||null,
       hours?parseFloat(hours.toFixed(2)):null, status||'Present', notes||null, req.user.name]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'attendance', rows[0].id, `${emp.rows[0].name} ${date}`);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const m = month || new Date().toISOString().slice(0,7);
    const { rows } = await pool.query(`
      SELECT e.id, e.name, e.department_name, e.branch,
        COUNT(*) FILTER (WHERE a.status='Present')   AS present_days,
        COUNT(*) FILTER (WHERE a.status='Absent')    AS absent_days,
        COUNT(*) FILTER (WHERE a.status='Late')      AS late_days,
        COUNT(*) FILTER (WHERE a.status='Leave')     AS leave_days,
        COALESCE(SUM(a.hours_worked),0)              AS total_hours
      FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND TO_CHAR(a.date,'YYYY-MM')=$1
      WHERE e.status='Active' GROUP BY e.id ORDER BY e.name
    `, [m]);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

module.exports = router;