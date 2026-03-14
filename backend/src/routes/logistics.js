const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');
const { auditLog }     = require('../middleware/errorHandler');

router.use(authenticate);

// ── GET all deliveries ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { branch, status, search } = req.query;
    let where = [];
    const params = [];

    if (branch && branch !== 'all') {
      params.push(branch);
      where.push(`d.branch = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`d.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(d.customer_name ILIKE $${params.length} OR d.dn_number ILIKE $${params.length} OR d.address ILIKE $${params.length})`);
    }

    const sql = `
      SELECT d.*,
        json_agg(
          json_build_object('status', t.status, 'time', t.event_time, 'note', t.note)
          ORDER BY t.event_time
        ) FILTER (WHERE t.id IS NOT NULL) AS timeline
      FROM deliveries d
      LEFT JOIN delivery_timeline t ON t.delivery_id = d.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// ── POST create delivery note ─────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_name, phone, address, courier, items, branch, notes, order_id } = req.body;
    if (!customer_name || !address) {
      return res.status(400).json({ success: false, message: 'Customer name and address required.' });
    }

    await client.query('BEGIN');

    // Generate DN number
    const countRes = await client.query('SELECT COUNT(*) FROM deliveries');
    const dn_number = `DN-${String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0')}`;

    const ins = await client.query(
      `INSERT INTO deliveries (dn_number, customer_name, phone, address, courier, items_description, branch, notes, order_id, status, created_by_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Pending',$10,$11)
       RETURNING *`,
      [dn_number, customer_name, phone || null, address, courier || null,
       items || null, branch || 'Main Branch', notes || null,
       order_id || null, req.user.id, req.user.name]
    );
    const delivery = ins.rows[0];

    // Insert initial timeline entry
    await client.query(
      `INSERT INTO delivery_timeline (delivery_id, status, note, event_time)
       VALUES ($1, 'Pending', 'Delivery note created', NOW())`,
      [delivery.id]
    );

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'CREATE', 'delivery', delivery.id, `DN: ${dn_number}`);

    // Return with timeline
    const full = await pool.query(
      `SELECT d.*, json_agg(json_build_object('status',t.status,'time',t.event_time,'note',t.note) ORDER BY t.event_time) AS timeline
       FROM deliveries d LEFT JOIN delivery_timeline t ON t.delivery_id=d.id WHERE d.id=$1 GROUP BY d.id`,
      [delivery.id]
    );
    res.status(201).json({ success: true, data: full.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ── PATCH update status ───────────────────────────────────────────────────────
router.patch('/:id/status', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { status, note } = req.body;
    const validStatuses = ['Pending','Picked Up','In Transit','Out for Delivery','Delivered','Failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE deliveries SET status=$1, updated_at=NOW() WHERE id=$2`,
      [status, req.params.id]
    );

    await client.query(
      `INSERT INTO delivery_timeline (delivery_id, status, note, event_time)
       VALUES ($1, $2, $3, NOW())`,
      [req.params.id, status, note || `Status updated to ${status}`]
    );

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'UPDATE', 'delivery', req.params.id, `Status → ${status}`);

    const full = await pool.query(
      `SELECT d.*, json_agg(json_build_object('status',t.status,'time',t.event_time,'note',t.note) ORDER BY t.event_time) AS timeline
       FROM deliveries d LEFT JOIN delivery_timeline t ON t.delivery_id=d.id WHERE d.id=$1 GROUP BY d.id`,
      [req.params.id]
    );
    res.json({ success: true, data: full.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ── DELETE delivery note ──────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM deliveries WHERE id=$1', [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DELETE', 'delivery', req.params.id);
    res.json({ success: true, message: 'Delivery note deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;