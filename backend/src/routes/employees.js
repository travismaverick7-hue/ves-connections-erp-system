const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { status, department_id, branch } = req.query;
    const where = [], params = [];
    if (status)        { params.push(status);        where.push(`e.status=$${params.length}`); }
    if (department_id) { params.push(department_id); where.push(`e.department_id=$${params.length}`); }
    if (branch)        { params.push(branch);        where.push(`e.branch=$${params.length}`); }
    const { rows } = await pool.query(
      `SELECT e.*, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id
       ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY e.name`, params
    );
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, email, phone, id_number, department_id, department_name, job_title, branch, employment_type, salary, hire_date, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const countRes = await pool.query("SELECT COUNT(*) FROM employees");
    const emp_num = `EMP-${String(parseInt(countRes.rows[0].count)+1).padStart(3,'0')}`;
    const initials = name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    const { rows } = await pool.query(
      `INSERT INTO employees (employee_number,name,email,phone,id_number,department_id,department_name,job_title,branch,employment_type,salary,hire_date,notes,avatar)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [emp_num, name, email||null, phone||null, id_number||null, department_id||null,
       department_name||null, job_title||null, branch||'Main Branch',
       employment_type||'Full-Time', salary||0, hire_date||new Date().toISOString().split('T')[0],
       notes||null, initials]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'employee', rows[0].id, name);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, email, phone, id_number, department_id, department_name, job_title, branch, employment_type, salary, status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE employees SET name=$1,email=$2,phone=$3,id_number=$4,department_id=$5,department_name=$6,
       job_title=$7,branch=$8,employment_type=$9,salary=$10,status=$11,notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [name, email||null, phone||null, id_number||null, department_id||null, department_name||null,
       job_title||null, branch||'Main Branch', employment_type||'Full-Time', salary||0, status||'Active', notes||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    await auditLog(req.user.id, req.user.name, 'UPDATE', 'employee', req.params.id, name);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query("UPDATE employees SET status='Terminated',updated_at=NOW() WHERE id=$1", [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DELETE', 'employee', req.params.id);
    res.json({ success: true, message: 'Employee terminated.' });
  } catch (e) { next(e); }
});

module.exports = router;