const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM companies ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', authorize('Admin'), async (req, res, next) => {
  try {
    const { name, email, phone, address, industry, tax_pin } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const { rows } = await pool.query(
      `INSERT INTO companies (name,email,phone,address,industry,tax_pin) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, email||null, phone||null, address||null, industry||null, tax_pin||null]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'company', rows[0].id, name);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    const { name, email, phone, address, industry, tax_pin } = req.body;
    const { rows } = await pool.query(
      `UPDATE companies SET name=$1,email=$2,phone=$3,address=$4,industry=$5,tax_pin=$6,updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, email||null, phone||null, address||null, industry||null, tax_pin||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    await auditLog(req.user.id, req.user.name, 'UPDATE', 'company', req.params.id, name);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE companies SET is_active=FALSE WHERE id=$1', [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DELETE', 'company', req.params.id);
    res.json({ success: true, message: 'Company deactivated.' });
  } catch (e) { next(e); }
});

module.exports = router;