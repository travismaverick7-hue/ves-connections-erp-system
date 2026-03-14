const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// ── IMEI validator (15 digits, Luhn check) ────────────────────────────────────
function validateIMEI(imei) {
  const clean = String(imei).replace(/\D/g, '');
  if (clean.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(clean[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

router.use(authenticate);

// ══════════════════════════════════════════════════════════════════════════════
// AGENTS CRUD
// ══════════════════════════════════════════════════════════════════════════════
router.get('/agents', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*,
        COUNT(d.id)                                                    AS total_assigned,
        COUNT(d.id) FILTER (WHERE d.status='ASSIGNED_TO_AGENT')        AS currently_holding,
        COUNT(d.id) FILTER (WHERE d.status='SOLD')                     AS total_sold
      FROM agents a
      LEFT JOIN onfon_devices d ON d.agent_id = a.id
      GROUP BY a.id ORDER BY a.agent_name
    `);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/agents', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { agent_name, phone, email, region } = req.body;
    if (!agent_name) return res.status(400).json({ success:false, message:'Agent name required.' });
    const { rows } = await pool.query(
      `INSERT INTO agents (agent_name,phone,email,region) VALUES ($1,$2,$3,$4) RETURNING *`,
      [agent_name, phone||null, email||null, region||null]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'agent', rows[0].id, agent_name);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/agents/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { agent_name, phone, email, region, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE agents SET agent_name=$1,phone=$2,email=$3,region=$4,status=$5,updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [agent_name, phone||null, email||null, region||null, status||'Active', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success:false, message:'Not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DEVICES — list & lookup
// ══════════════════════════════════════════════════════════════════════════════
router.get('/devices', async (req, res, next) => {
  try {
    const { status, agent_id, search } = req.query;
    const where = [], params = [];
    if (status)   { params.push(status);   where.push(`d.status=$${params.length}`); }
    if (agent_id) { params.push(agent_id); where.push(`d.agent_id=$${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(d.imei ILIKE $${params.length} OR d.product_name ILIKE $${params.length} OR d.model ILIKE $${params.length})`);
    }
    const { rows } = await pool.query(`
      SELECT d.*, a.agent_name, a.phone AS agent_phone, a.region AS agent_region,
             w.name AS warehouse_name
      FROM onfon_devices d
      LEFT JOIN agents    a ON a.id = d.agent_id
      LEFT JOIN warehouses w ON w.id = d.warehouse_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY d.received_date DESC, d.created_at DESC
    `, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// IMEI Lookup
router.get('/lookup/:imei', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, a.agent_name, a.phone AS agent_phone, a.region AS agent_region,
             w.name AS warehouse_name,
             json_agg(json_build_object(
               'movement_type', mv.movement_type,
               'from_location', mv.from_location,
               'to_location',   mv.to_location,
               'agent_name',    mv.agent_name,
               'customer_name', mv.customer_name,
               'performed_by',  mv.performed_by,
               'notes',         mv.notes,
               'date',          mv.date
             ) ORDER BY mv.date) FILTER (WHERE mv.id IS NOT NULL) AS movements
      FROM onfon_devices d
      LEFT JOIN agents    a  ON a.id  = d.agent_id
      LEFT JOIN warehouses w ON w.id  = d.warehouse_id
      LEFT JOIN device_movements mv ON mv.device_id = d.id
      WHERE d.imei = $1
      GROUP BY d.id, a.id, w.id
    `, [req.params.imei.replace(/\D/g, '')]);
    if (!rows.length) return res.status(404).json({ success:false, message:`IMEI ${req.params.imei} not found.` });
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. RECEIVE PHONES
// ══════════════════════════════════════════════════════════════════════════════
router.post('/receive', async (req, res, next) => {
  const client = await pool.connect();
  try {
    let { product_name, brand, model, imei, supplier_id, warehouse_id, received_date, notes } = req.body;
    imei = String(imei||'').replace(/\D/g,'');

    if (!imei)         return res.status(400).json({ success:false, message:'IMEI is required.' });
    if (imei.length !== 15) return res.status(400).json({ success:false, message:`IMEI must be 15 digits. Got ${imei.length}.` });
    if (!validateIMEI(imei)) return res.status(400).json({ success:false, message:'Invalid IMEI number (failed Luhn check).' });
    if (!model)        return res.status(400).json({ success:false, message:'Phone model is required.' });

    // Check duplicate
    const dup = await client.query('SELECT id, status FROM onfon_devices WHERE imei=$1', [imei]);
    if (dup.rows.length) return res.status(409).json({ success:false, message:`IMEI ${imei} already exists in system. Status: ${dup.rows[0].status}` });

    await client.query('BEGIN');

    const { rows } = await client.query(`
      INSERT INTO onfon_devices
        (product_name,brand,model,imei,supplier_id,warehouse_id,status,received_date,notes,received_by)
      VALUES ($1,$2,$3,$4,$5,$6,'IN_STOCK',$7,$8,$9) RETURNING *`,
      [product_name||model, brand||'Onfon', model, imei,
       supplier_id||null, warehouse_id||null,
       received_date||new Date().toISOString().split('T')[0],
       notes||null, req.user.name]
    );

    await client.query(`
      INSERT INTO device_movements (device_id,imei,movement_type,from_location,to_location,performed_by,notes,date)
      VALUES ($1,$2,'RECEIVED','Supplier','Onfon Stock',$3,$4,NOW())`,
      [rows[0].id, imei, req.user.name, notes||null]
    );

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'RECEIVE', 'onfon_device', rows[0].id, `IMEI:${imei} ${model}`);
    res.status(201).json({ success:true, message:`Phone received. IMEI ${imei} registered as IN_STOCK.`, data: rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. ASSIGN TO AGENT
// ══════════════════════════════════════════════════════════════════════════════
router.post('/assign', async (req, res, next) => {
  const client = await pool.connect();
  try {
    let { imei, agent_id, notes } = req.body;
    imei = String(imei||'').replace(/\D/g,'');
    if (!imei || !agent_id) return res.status(400).json({ success:false, message:'IMEI and agent_id required.' });

    const dev = await client.query('SELECT * FROM onfon_devices WHERE imei=$1', [imei]);
    if (!dev.rows.length) return res.status(404).json({ success:false, message:`IMEI ${imei} not found.` });
    const device = dev.rows[0];
    if (device.status !== 'IN_STOCK')
      return res.status(409).json({ success:false, message:`Cannot assign. Device status is ${device.status}, expected IN_STOCK.` });

    const agentRes = await client.query('SELECT * FROM agents WHERE id=$1 AND status=\'Active\'', [agent_id]);
    if (!agentRes.rows.length) return res.status(404).json({ success:false, message:'Agent not found or inactive.' });
    const agent = agentRes.rows[0];

    await client.query('BEGIN');

    const { rows } = await client.query(`
      UPDATE onfon_devices SET status='ASSIGNED_TO_AGENT', agent_id=$1, updated_at=NOW()
      WHERE id=$2 RETURNING *`, [agent_id, device.id]
    );

    await client.query(`
      INSERT INTO device_movements (device_id,imei,movement_type,from_location,to_location,agent_id,agent_name,performed_by,notes,date)
      VALUES ($1,$2,'ASSIGNED','Onfon Stock',$3,$4,$5,$6,$7,NOW())`,
      [device.id, imei, `Agent: ${agent.agent_name}`, agent_id, agent.agent_name, req.user.name, notes||null]
    );

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'ASSIGN', 'onfon_device', device.id, `IMEI:${imei} → ${agent.agent_name}`);
    res.json({ success:true, message:`IMEI ${imei} assigned to ${agent.agent_name}.`, data: rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. AGENT SALE
// ══════════════════════════════════════════════════════════════════════════════
router.post('/agent-sale', async (req, res, next) => {
  const client = await pool.connect();
  try {
    let { imei, customer_name, notes } = req.body;
    imei = String(imei||'').replace(/\D/g,'');
    if (!imei) return res.status(400).json({ success:false, message:'IMEI required.' });

    const dev = await client.query(`
      SELECT d.*, a.agent_name FROM onfon_devices d LEFT JOIN agents a ON a.id=d.agent_id WHERE d.imei=$1`, [imei]);
    if (!dev.rows.length) return res.status(404).json({ success:false, message:`IMEI ${imei} not found.` });
    const device = dev.rows[0];
    if (device.status !== 'ASSIGNED_TO_AGENT')
      return res.status(409).json({ success:false, message:`Cannot record agent sale. Device status is ${device.status}, expected ASSIGNED_TO_AGENT.` });

    await client.query('BEGIN');
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await client.query(`
      UPDATE onfon_devices SET status='SOLD', sold_date=$1, customer_name=$2, updated_at=NOW()
      WHERE id=$3 RETURNING *`, [today, customer_name||null, device.id]
    );

    await client.query(`
      INSERT INTO device_movements (device_id,imei,movement_type,from_location,to_location,agent_id,agent_name,customer_name,performed_by,notes,date)
      VALUES ($1,$2,'SOLD',$3,'Customer',$4,$5,$6,$7,$8,NOW())`,
      [device.id, imei, `Agent: ${device.agent_name}`, device.agent_id, device.agent_name,
       customer_name||null, req.user.name, notes||null]
    );

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'AGENT_SALE', 'onfon_device', device.id, `IMEI:${imei} by ${device.agent_name}`);
    res.json({ success:true, message:`Agent sale recorded. IMEI ${imei} marked SOLD.`, data: rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. SHOP SALE (direct)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/shop-sale', async (req, res, next) => {
  const client = await pool.connect();
  try {
    let { imei, customer_name, notes } = req.body;
    imei = String(imei||'').replace(/\D/g,'');
    if (!imei) return res.status(400).json({ success:false, message:'IMEI required.' });

    const dev = await client.query('SELECT * FROM onfon_devices WHERE imei=$1', [imei]);
    if (!dev.rows.length) return res.status(404).json({ success:false, message:`IMEI ${imei} not found.` });
    const device = dev.rows[0];
    if (device.status !== 'IN_STOCK')
      return res.status(409).json({ success:false, message:`Cannot sell. Device status is ${device.status}, expected IN_STOCK.` });

    await client.query('BEGIN');
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await client.query(`
      UPDATE onfon_devices SET status='SOLD', sold_date=$1, customer_name=$2, updated_at=NOW()
      WHERE id=$3 RETURNING *`, [today, customer_name||null, device.id]
    );

    await client.query(`
      INSERT INTO device_movements (device_id,imei,movement_type,from_location,to_location,customer_name,performed_by,notes,date)
      VALUES ($1,$2,'SOLD','Shop','Customer',$3,$4,$5,NOW())`,
      [device.id, imei, customer_name||null, req.user.name, notes||null]
    );

    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'SHOP_SALE', 'onfon_device', device.id, `IMEI:${imei} → ${customer_name||'Walk-in'}`);
    res.json({ success:true, message:`Shop sale recorded. IMEI ${imei} marked SOLD.`, data: rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. RETURN DEVICE
// ══════════════════════════════════════════════════════════════════════════════
router.post('/return', async (req, res, next) => {
  const client = await pool.connect();
  try {
    let { imei, notes } = req.body;
    imei = String(imei||'').replace(/\D/g,'');
    if (!imei) return res.status(400).json({ success:false, message:'IMEI required.' });

    const dev = await client.query('SELECT * FROM onfon_devices WHERE imei=$1', [imei]);
    if (!dev.rows.length) return res.status(404).json({ success:false, message:`IMEI ${imei} not found.` });
    const device = dev.rows[0];

    await client.query('BEGIN');
    const { rows } = await client.query(`
      UPDATE onfon_devices SET status='RETURNED', agent_id=NULL, updated_at=NOW()
      WHERE id=$1 RETURNING *`, [device.id]
    );

    await client.query(`
      INSERT INTO device_movements (device_id,imei,movement_type,from_location,to_location,performed_by,notes,date)
      VALUES ($1,$2,'RETURNED','Field','Onfon Stock',$3,$4,NOW())`,
      [device.id, imei, req.user.name, notes||null]
    );

    await client.query('COMMIT');
    res.json({ success:true, message:`IMEI ${imei} marked as RETURNED.`, data: rows[0] });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. DASHBOARD STATS
// ══════════════════════════════════════════════════════════════════════════════
router.get('/stats', async (req, res, next) => {
  try {
    const { rows: [totals] } = await pool.query(`
      SELECT
        COUNT(*)                                             AS total_received,
        COUNT(*) FILTER (WHERE status='IN_STOCK')           AS in_stock,
        COUNT(*) FILTER (WHERE status='ASSIGNED_TO_AGENT')  AS assigned,
        COUNT(*) FILTER (WHERE status='SOLD')               AS total_sold,
        COUNT(*) FILTER (WHERE status='RETURNED')           AS returned,
        COUNT(*) FILTER (WHERE status='DAMAGED')            AS damaged,
        COUNT(*) FILTER (WHERE status='SOLD' AND sold_date >= CURRENT_DATE - INTERVAL '30 days') AS sold_this_month
      FROM onfon_devices
    `);

    const { rows: agentPerf } = await pool.query(`
      SELECT a.id, a.agent_name, a.region, a.phone,
        COUNT(d.id)                                           AS total_assigned,
        COUNT(d.id) FILTER (WHERE d.status='ASSIGNED_TO_AGENT') AS currently_holding,
        COUNT(d.id) FILTER (WHERE d.status='SOLD')            AS total_sold,
        COUNT(d.id) FILTER (WHERE d.status='RETURNED')        AS returned
      FROM agents a
      LEFT JOIN onfon_devices d ON d.agent_id=a.id
      WHERE a.status='Active'
      GROUP BY a.id ORDER BY total_sold DESC
    `);

    const { rows: recentMovements } = await pool.query(`
      SELECT mv.*, d.model, d.product_name
      FROM device_movements mv JOIN onfon_devices d ON d.id=mv.device_id
      ORDER BY mv.date DESC LIMIT 20
    `);

    const { rows: modelBreakdown } = await pool.query(`
      SELECT model, brand,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='IN_STOCK') AS in_stock,
        COUNT(*) FILTER (WHERE status='SOLD')     AS sold,
        COUNT(*) FILTER (WHERE status='ASSIGNED_TO_AGENT') AS assigned
      FROM onfon_devices GROUP BY model, brand ORDER BY total DESC
    `);

    res.json({ success:true, data:{ totals, agent_performance: agentPerf, recent_movements: recentMovements, model_breakdown: modelBreakdown } });
  } catch (e) { next(e); }
});

// Agent performance detail
router.get('/agents/:id/performance', async (req, res, next) => {
  try {
    const { rows: [agent] } = await pool.query('SELECT * FROM agents WHERE id=$1', [req.params.id]);
    if (!agent) return res.status(404).json({ success:false, message:'Agent not found.' });

    const { rows: devices } = await pool.query(
      `SELECT * FROM onfon_devices WHERE agent_id=$1 ORDER BY updated_at DESC`, [req.params.id]
    );
    const { rows: movements } = await pool.query(
      `SELECT mv.* FROM device_movements mv JOIN onfon_devices d ON d.id=mv.device_id WHERE d.agent_id=$1 ORDER BY mv.date DESC`, [req.params.id]
    );
    res.json({ success:true, data:{ agent, devices, movements } });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// RELEASED DEVICES (ASSIGNED_TO_AGENT with full movement detail)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/released-devices', async (req, res, next) => {
  try {
    const { agent_id, model, start_date, end_date, search } = req.query;
    const where = ["mv.movement_type = 'ASSIGNED'"], params = [];

    if (agent_id)   { params.push(agent_id);        where.push(`mv.agent_id = $${params.length}`); }
    if (model)      { params.push(`%${model}%`);    where.push(`d.model ILIKE $${params.length}`); }
    if (start_date) { params.push(start_date);      where.push(`mv.date::date >= $${params.length}`); }
    if (end_date)   { params.push(end_date);        where.push(`mv.date::date <= $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(d.imei ILIKE $${params.length} OR a.agent_name ILIKE $${params.length} OR d.model ILIKE $${params.length})`);
    }

    const { rows } = await pool.query(`
      SELECT
        d.id, d.product_name, d.brand, d.model, d.imei, d.status,
        d.received_date, d.sold_date, d.customer_name,
        mv.id            AS movement_id,
        mv.date          AS release_datetime,
        mv.date::date    AS release_date,
        mv.date::time    AS release_time,
        mv.performed_by  AS released_by,
        mv.notes         AS release_notes,
        a.id             AS agent_id,
        a.agent_name,
        a.phone          AS agent_phone,
        a.region         AS agent_region
      FROM device_movements mv
      JOIN onfon_devices d ON d.id = mv.device_id
      JOIN agents a        ON a.id = mv.agent_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY mv.date DESC
    `, params);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS — Weekly
// ══════════════════════════════════════════════════════════════════════════════
router.get('/reports/weekly', async (req, res, next) => {
  try {
    const { weeks_back = 0 } = req.query;
    const offset = parseInt(weeks_back) || 0;

    const { rows: [summary] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE received_date >= DATE_TRUNC('week', NOW()) - ($1 * INTERVAL '1 week')
                           AND received_date <  DATE_TRUNC('week', NOW()) - ($1 * INTERVAL '1 week') + INTERVAL '7 days')
                                                                           AS received,
        COUNT(*) FILTER (WHERE status IN ('ASSIGNED_TO_AGENT','SOLD'))     AS released_to_agents,
        COUNT(*) FILTER (WHERE sold_date   >= DATE_TRUNC('week', NOW()) - ($1 * INTERVAL '1 week')
                           AND sold_date   <  DATE_TRUNC('week', NOW()) - ($1 * INTERVAL '1 week') + INTERVAL '7 days')
                                                                           AS sold_this_week,
        COUNT(*) FILTER (WHERE status = 'IN_STOCK')                        AS in_stock,
        COUNT(*) FILTER (WHERE status = 'ASSIGNED_TO_AGENT')               AS with_agents,
        COUNT(*) FILTER (WHERE status = 'RETURNED')                        AS returned,
        COUNT(*)                                                            AS total_all_time
      FROM onfon_devices
    `, [offset]);

    // Daily breakdown for chart (last 7 days)
    const { rows: daily } = await pool.query(`
      SELECT
        gs::date                                                            AS day,
        COUNT(d.id) FILTER (WHERE d.received_date = gs::date)              AS received,
        COUNT(d.id) FILTER (WHERE d.sold_date = gs::date)                  AS sold,
        COUNT(mv.id) FILTER (WHERE mv.movement_type='ASSIGNED' AND mv.date::date = gs::date) AS assigned
      FROM generate_series(
        DATE_TRUNC('week', NOW()) - ($1 * INTERVAL '1 week'),
        DATE_TRUNC('week', NOW()) - ($1 * INTERVAL '1 week') + INTERVAL '6 days',
        '1 day'
      ) gs
      LEFT JOIN onfon_devices d ON TRUE
      LEFT JOIN device_movements mv ON mv.device_id = d.id
      GROUP BY gs ORDER BY gs
    `, [offset]);

    // Agent breakdown for week
    const { rows: agents } = await pool.query(`
      SELECT a.agent_name, a.region,
        COUNT(d.id) FILTER (WHERE d.status='ASSIGNED_TO_AGENT') AS holding,
        COUNT(d.id) FILTER (WHERE d.status='SOLD')              AS sold
      FROM agents a LEFT JOIN onfon_devices d ON d.agent_id=a.id
      WHERE a.status='Active' GROUP BY a.id ORDER BY sold DESC
    `);

    // Model breakdown
    const { rows: models } = await pool.query(`
      SELECT model, brand,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='IN_STOCK')          AS in_stock,
        COUNT(*) FILTER (WHERE status='SOLD')              AS sold,
        COUNT(*) FILTER (WHERE status='ASSIGNED_TO_AGENT') AS assigned
      FROM onfon_devices GROUP BY model, brand ORDER BY total DESC
    `);

    res.json({ success: true, data: { summary, daily, agents, models, period: 'weekly', weeks_back: offset } });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS — Monthly
// ══════════════════════════════════════════════════════════════════════════════
router.get('/reports/monthly', async (req, res, next) => {
  try {
    const { month } = req.query; // e.g. "2026-03"
    const target = month || new Date().toISOString().slice(0, 7);

    const { rows: [summary] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE TO_CHAR(received_date,'YYYY-MM') = $1)  AS received_this_month,
        COUNT(*) FILTER (WHERE TO_CHAR(sold_date,'YYYY-MM') = $1)      AS sold_this_month,
        COUNT(*) FILTER (WHERE status='IN_STOCK')                       AS current_stock,
        COUNT(*) FILTER (WHERE status='ASSIGNED_TO_AGENT')             AS with_agents,
        COUNT(*) FILTER (WHERE status='RETURNED')                       AS returned,
        COUNT(*) FILTER (WHERE status='DAMAGED')                        AS damaged,
        COUNT(*)                                                        AS total_all_time
      FROM onfon_devices
    `, [target]);

    // Weekly buckets within the month
    const { rows: weekly } = await pool.query(`
      SELECT
        CEIL(EXTRACT(DAY FROM received_date)/7.0) AS week_num,
        COUNT(*) FILTER (WHERE TO_CHAR(received_date,'YYYY-MM') = $1)  AS received,
        COUNT(*) FILTER (WHERE TO_CHAR(sold_date,'YYYY-MM') = $1)      AS sold
      FROM onfon_devices
      WHERE TO_CHAR(received_date,'YYYY-MM') = $1 OR TO_CHAR(sold_date,'YYYY-MM') = $1
      GROUP BY week_num ORDER BY week_num
    `, [target]);

    // Agent performance this month
    const { rows: agents } = await pool.query(`
      SELECT a.agent_name, a.region,
        COUNT(d.id)                                             AS total_ever,
        COUNT(d.id) FILTER (WHERE TO_CHAR(d.sold_date,'YYYY-MM')=$1 AND d.status='SOLD') AS sold_this_month,
        COUNT(d.id) FILTER (WHERE d.status='ASSIGNED_TO_AGENT') AS currently_holding
      FROM agents a LEFT JOIN onfon_devices d ON d.agent_id=a.id
      WHERE a.status='Active' GROUP BY a.id ORDER BY sold_this_month DESC
    `, [target]);

    // Shop vs agent sales breakdown
    const { rows: salesBreakdown } = await pool.query(`
      SELECT
        movement_type,
        COUNT(*) AS count,
        TO_CHAR(date,'YYYY-MM') AS month
      FROM device_movements
      WHERE movement_type = 'SOLD' AND TO_CHAR(date,'YYYY-MM') = $1
      GROUP BY movement_type, month
    `, [target]);

    // Model breakdown
    const { rows: models } = await pool.query(`
      SELECT model, brand,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status='IN_STOCK') AS in_stock,
        COUNT(*) FILTER (WHERE status='SOLD')     AS sold
      FROM onfon_devices GROUP BY model, brand ORDER BY total DESC
    `);

    res.json({ success: true, data: { summary, weekly, agents, salesBreakdown, models, period: 'monthly', month: target } });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS — Annual
// ══════════════════════════════════════════════════════════════════════════════
router.get('/reports/annual', async (req, res, next) => {
  try {
    const { year } = req.query;
    const target = year || new Date().getFullYear().toString();

    const { rows: [summary] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM received_date) = $1::int) AS received_this_year,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM sold_date) = $1::int)     AS sold_this_year,
        COUNT(*) FILTER (WHERE status='IN_STOCK')                           AS current_stock,
        COUNT(*) FILTER (WHERE status='ASSIGNED_TO_AGENT')                 AS with_agents,
        COUNT(*) FILTER (WHERE status='RETURNED')                           AS returned,
        COUNT(*) FILTER (WHERE status='DAMAGED')                            AS damaged,
        COUNT(*)                                                            AS total_all_time
      FROM onfon_devices
    `, [target]);

    // Monthly breakdown for the year
    const { rows: monthly } = await pool.query(`
      SELECT
        TO_CHAR(gs, 'Mon')                                                       AS month_label,
        TO_CHAR(gs, 'YYYY-MM')                                                   AS month,
        COUNT(d.id)  FILTER (WHERE TO_CHAR(d.received_date,'YYYY-MM')=TO_CHAR(gs,'YYYY-MM')) AS received,
        COUNT(d.id)  FILTER (WHERE TO_CHAR(d.sold_date,'YYYY-MM')    =TO_CHAR(gs,'YYYY-MM')) AS sold,
        COUNT(mv.id) FILTER (WHERE mv.movement_type='ASSIGNED' AND TO_CHAR(mv.date,'YYYY-MM')=TO_CHAR(gs,'YYYY-MM')) AS assigned
      FROM generate_series(
        TO_DATE($1 || '-01-01','YYYY-MM-DD'),
        TO_DATE($1 || '-12-01','YYYY-MM-DD'),
        '1 month'
      ) gs
      LEFT JOIN onfon_devices d  ON TRUE
      LEFT JOIN device_movements mv ON mv.device_id = d.id
      GROUP BY gs ORDER BY gs
    `, [target]);

    // Top agents for the year
    const { rows: agents } = await pool.query(`
      SELECT a.agent_name, a.region,
        COUNT(d.id) AS total_assigned,
        COUNT(d.id) FILTER (WHERE EXTRACT(YEAR FROM d.sold_date)=$1::int AND d.status='SOLD') AS sold_this_year,
        COUNT(d.id) FILTER (WHERE d.status='ASSIGNED_TO_AGENT') AS currently_holding
      FROM agents a LEFT JOIN onfon_devices d ON d.agent_id=a.id
      WHERE a.status='Active' GROUP BY a.id ORDER BY sold_this_year DESC
    `, [target]);

    // Model breakdown
    const { rows: models } = await pool.query(`
      SELECT model, brand,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM received_date)=$1::int) AS received_year,
        COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM sold_date)=$1::int)     AS sold_year,
        COUNT(*) FILTER (WHERE status='IN_STOCK') AS current_stock
      FROM onfon_devices GROUP BY model, brand ORDER BY total DESC
    `, [target]);

    res.json({ success: true, data: { summary, monthly, agents, models, period: 'annual', year: target } });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT — CSV
// ══════════════════════════════════════════════════════════════════════════════
router.get('/export/csv', async (req, res, next) => {
  try {
    const { status, type = 'inventory' } = req.query;
    let query, params = [], filename;

    if (type === 'released') {
      query = `
        SELECT d.imei, d.product_name, d.brand, d.model, a.agent_name, a.phone AS agent_phone,
               mv.date::date AS release_date, mv.date::time AS release_time, mv.performed_by AS released_by, d.status
        FROM device_movements mv
        JOIN onfon_devices d ON d.id=mv.device_id
        JOIN agents a ON a.id=mv.agent_id
        WHERE mv.movement_type='ASSIGNED' ORDER BY mv.date DESC`;
      filename = 'onfon_released_phones.csv';
    } else {
      const where = status && status !== 'All' ? `WHERE status=$1` : '';
      if (status && status !== 'All') params.push(status);
      query = `SELECT imei, product_name, brand, model, status, received_date, sold_date, customer_name FROM onfon_devices ${where} ORDER BY received_date DESC`;
      filename = `onfon_devices_${status||'all'}.csv`;
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.json({ success: true, data: [], message: 'No data.' });

    const headers = Object.keys(rows[0]).join(',');
    const csv = [headers, ...rows.map(r => Object.values(r).map(v => `"${v||''}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// DELETE a single device by ID
router.delete('/devices/:id', authorize('Admin', 'Manager'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const dev = await client.query('SELECT id, imei, model FROM onfon_devices WHERE id = $1', [id]);
    if (!dev.rows.length) return res.status(404).json({ success: false, message: 'Device not found.' });
    const device = dev.rows[0];

    await client.query('BEGIN');
    // Delete movement history first (FK constraint)
    await client.query('DELETE FROM device_movements WHERE device_id = $1', [id]);
    // Delete the device
    await client.query('DELETE FROM onfon_devices WHERE id = $1', [id]);
    await client.query('COMMIT');

    await auditLog(req.user.id, req.user.name, 'DELETE', 'onfon_device', id, `IMEI:${device.imei} ${device.model}`);
    res.json({ success: true, message: `Device IMEI ${device.imei} deleted.`, id });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// DELETE all devices — Admin only (clear test data)
router.delete('/devices', authorize('Admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM device_movements');
    const result = await client.query('DELETE FROM onfon_devices');
    await client.query('COMMIT');

    await auditLog(req.user.id, req.user.name, 'DELETE_ALL', 'onfon_devices', null, `Cleared ${result.rowCount} devices`);
    res.json({ success: true, message: `Deleted ${result.rowCount} devices and all movement history.` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// DELETE an agent — Admin only (only if no active assigned devices)
router.delete('/agents/:id', authorize('Admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const agent = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
    if (!agent.rows.length) return res.status(404).json({ success: false, message: 'Agent not found.' });

    // Block if agent still holds devices
    const active = await pool.query(
      `SELECT COUNT(*) FROM onfon_devices WHERE agent_id = $1 AND status = 'ASSIGNED_TO_AGENT'`, [id]
    );
    if (parseInt(active.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete agent with ${active.rows[0].count} active device(s) assigned. Return or sell all devices first.`
      });
    }

    await pool.query('DELETE FROM agents WHERE id = $1', [id]);
    await auditLog(req.user.id, req.user.name, 'DELETE', 'agent', id, agent.rows[0].agent_name);
    res.json({ success: true, message: `Agent ${agent.rows[0].agent_name} deleted.` });
  } catch (err) { next(err); }
});

module.exports = router;