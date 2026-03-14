const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

router.use(authenticate);

// GET /api/purchase-orders
router.get('/', async (req, res, next) => {
  try {
    const { status, branch } = req.query;
    let where = []; const params = [];
    if (status) { params.push(status); where.push(`po.status = $${params.length}`); }
    if (branch && branch !== 'all') { params.push(branch); where.push(`po.branch = $${params.length}`); }

    const { rows } = await pool.query(`
      SELECT po.*,
        json_agg(json_build_object(
          'id',pi.id,'item_name',pi.item_name,'qty',pi.qty,
          'unit_cost',pi.unit_cost,'line_total',pi.line_total
        ) ORDER BY pi.item_name) AS items
      FROM purchase_orders po
      LEFT JOIN po_items pi ON po.id = pi.po_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY po.id
      ORDER BY po.created_at DESC
    `, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
});

// GET /api/purchase-orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT po.*, json_agg(json_build_object(
        'id',pi.id,'item_name',pi.item_name,'qty',pi.qty,'unit_cost',pi.unit_cost,'line_total',pi.line_total
      )) AS items FROM purchase_orders po
      LEFT JOIN po_items pi ON po.id = pi.po_id WHERE po.id=$1 GROUP BY po.id
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'PO not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/purchase-orders
router.post('/', authorize('Admin','Manager'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { supplier_id, supplier_name, branch, notes, items } = req.body;
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'Items required.' });

    await client.query('BEGIN');
    const total = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);

    // Generate PO number
    const cntRes = await client.query(`SELECT COUNT(*)+1 AS num FROM purchase_orders`);
    const poNum  = `PO-${String(cntRes.rows[0].num).padStart(3,'0')}`;

    const suppRes = supplier_id
      ? await client.query('SELECT name FROM suppliers WHERE id=$1', [supplier_id])
      : null;
    const suppName = supplier_name || suppRes?.rows[0]?.name || 'Unknown';

    const poRes = await client.query(
      `INSERT INTO purchase_orders (po_number,supplier_id,supplier_name,branch,total,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [poNum, supplier_id||null, suppName, branch, total, notes||null, req.user.id]
    );
    const po = poRes.rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO po_items (po_id,item_name,qty,unit_cost) VALUES ($1,$2,$3,$4)`,
        [po.id, it.item_name, it.qty, it.unit_cost]
      );
    }

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'CREATE_PO', 'purchase_orders', po.id, poNum, req.ip);
    res.status(201).json({ success: true, message: `Purchase order ${poNum} created.`, data: po });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/purchase-orders/:id/status
router.patch('/:id/status', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { status } = req.body;
    const deliveredAt = status === 'Delivered' ? 'NOW()' : 'NULL';
    const { rows } = await pool.query(
      `UPDATE purchase_orders SET status=$1, delivered_at=${deliveredAt}, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'PO not found.' });
    await auditLog(req.user.id, req.user.name, 'UPDATE_PO_STATUS', 'purchase_orders', req.params.id, status, req.ip);
    res.json({ success: true, message: `PO status updated to ${status}.`, data: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
