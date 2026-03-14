const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { status, category, warehouse_id } = req.query;
    const where = [], params = [];
    if (status)       { params.push(status);       where.push(`status=$${params.length}`); }
    if (category)     { params.push(category);     where.push(`category=$${params.length}`); }
    if (warehouse_id) { params.push(warehouse_id); where.push(`warehouse_id=$${params.length}`); }
    const { rows } = await pool.query(
      `SELECT * FROM assets ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC`, params
    );
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, category, description, serial_number, brand, model, purchase_date, purchase_price, location, warehouse_id, assigned_to, employee_id, notes } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const countRes = await pool.query("SELECT COUNT(*) FROM assets");
    const asset_num = `AST-${String(parseInt(countRes.rows[0].count)+1).padStart(4,'0')}`;
    const { rows } = await pool.query(
      `INSERT INTO assets (asset_number,name,category,description,serial_number,brand,model,purchase_date,purchase_price,current_value,location,warehouse_id,assigned_to,employee_id,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [asset_num, name, category||'Equipment', description||null, serial_number||null,
       brand||null, model||null, purchase_date||null, purchase_price||0,
       location||null, warehouse_id||null, assigned_to||null, employee_id||null, notes||null, req.user.name]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'asset', rows[0].id, `${asset_num}: ${name}`);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, category, description, serial_number, brand, model, purchase_date, purchase_price, current_value, location, warehouse_id, assigned_to, employee_id, status, notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE assets SET name=$1,category=$2,description=$3,serial_number=$4,brand=$5,model=$6,
       purchase_date=$7,purchase_price=$8,current_value=$9,location=$10,warehouse_id=$11,
       assigned_to=$12,employee_id=$13,status=$14,notes=$15,updated_at=NOW() WHERE id=$16 RETURNING *`,
      [name, category||'Equipment', description||null, serial_number||null, brand||null, model||null,
       purchase_date||null, purchase_price||0, current_value||0, location||null,
       warehouse_id||null, assigned_to||null, employee_id||null, status||'Active', notes||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found.' });
    await auditLog(req.user.id, req.user.name, 'UPDATE', 'asset', req.params.id, name);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query("UPDATE assets SET status='Disposed',updated_at=NOW() WHERE id=$1", [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DELETE', 'asset', req.params.id);
    res.json({ success: true, message: 'Asset disposed.' });
  } catch (e) { next(e); }
});

module.exports = router;