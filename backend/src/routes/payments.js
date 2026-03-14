const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { payment_type, start_date, end_date, method } = req.query;
    const where = [], params = [];
    if (payment_type) { params.push(payment_type); where.push(`payment_type=$${params.length}`); }
    if (start_date)   { params.push(start_date);   where.push(`payment_date>=$${params.length}`); }
    if (end_date)     { params.push(end_date);     where.push(`payment_date<=$${params.length}`); }
    if (method)       { params.push(method);       where.push(`method=$${params.length}`); }
    const { rows } = await pool.query(
      `SELECT * FROM payments ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 500`, params
    );
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { payment_type, method, amount, reference_type, reference_id, party_name, party_type, notes, branch, payment_date } = req.body;
    if (!payment_type || !amount) return res.status(400).json({ success: false, message: 'Type and amount required.' });
    const countRes = await pool.query("SELECT COUNT(*) FROM payments");
    const pay_num = `PAY-${String(parseInt(countRes.rows[0].count)+1).padStart(4,'0')}`;
    const { rows } = await pool.query(
      `INSERT INTO payments (payment_number,payment_type,method,amount,reference_type,reference_id,party_name,party_type,notes,branch,recorded_by,payment_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [pay_num, payment_type, method||'Cash', +amount, reference_type||null, reference_id||null,
       party_name||null, party_type||'Customer', notes||null, branch||null, req.user.name, payment_date||new Date().toISOString().split('T')[0]]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'payment', rows[0].id, `${payment_type} KSh ${amount}`);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;