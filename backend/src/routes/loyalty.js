/**
 * VES ERP — Customer Loyalty Routes
 * GET  /api/loyalty/account/:customerId
 * POST /api/loyalty/enroll
 * POST /api/loyalty/earn         — add points after sale
 * POST /api/loyalty/redeem       — redeem points for discount
 * POST /api/loyalty/credit/add   — add credit balance
 * POST /api/loyalty/credit/spend — spend credit balance
 * GET  /api/loyalty/transactions/:customerId
 * GET  /api/loyalty/settings
 * PUT  /api/loyalty/settings
 * GET  /api/loyalty/leaderboard
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');

function getTier(points, settings) {
  if (points >= settings.platinum_threshold) return 'Platinum';
  if (points >= settings.gold_threshold)     return 'Gold';
  if (points >= settings.silver_threshold)   return 'Silver';
  return 'Bronze';
}

// Get/create account
router.get('/account/:customerId', authenticate, async (req, res, next) => {
  try {
    let result = await pool.query(
      `SELECT la.*, c.name AS customer_name, c.phone
       FROM loyalty_accounts la JOIN customers c ON c.id=la.customer_id
       WHERE la.customer_id=$1`, [req.params.customerId]
    );
    if (!result.rows.length) return res.json({ success:true, data:null, enrolled:false });
    res.json({ success:true, data:result.rows[0], enrolled:true });
  } catch (err) { next(err); }
});

// Enroll customer
router.post('/enroll', authenticate, async (req, res, next) => {
  try {
    const { customer_id } = req.body;
    const c = await pool.query(`SELECT name FROM customers WHERE id=$1`,[customer_id]);
    if (!c.rows.length) return res.status(404).json({ success:false, message:'Customer not found' });
    const result = await pool.query(
      `INSERT INTO loyalty_accounts (customer_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *`,
      [customer_id]
    );
    if (!result.rows.length) return res.json({ success:true, message:'Already enrolled', already:true });
    res.json({ success:true, data:result.rows[0], message:`${c.rows[0].name} enrolled in loyalty program ✅` });
  } catch (err) { next(err); }
});

// Earn points (called after sale)
router.post('/earn', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_id, amount, reference } = req.body;
    const settings = (await client.query(`SELECT * FROM loyalty_settings LIMIT 1`)).rows[0];
    if (!settings) return res.status(400).json({ success:false, message:'Loyalty settings not configured' });
    const points = Math.floor(amount * settings.points_per_ksh);
    await client.query('BEGIN');
    const acct = await client.query(
      `UPDATE loyalty_accounts SET points=points+$1, total_earned_points=total_earned_points+$1,
         total_spent=total_spent+$2, updated_at=NOW()
       WHERE customer_id=$3 RETURNING *`, [points, amount, customer_id]
    );
    if (!acct.rows.length) { await client.query('ROLLBACK'); return res.json({ success:false, message:'Customer not enrolled' }); }
    const newTier = getTier(acct.rows[0].total_earned_points, settings);
    if (newTier !== acct.rows[0].tier) {
      await client.query(`UPDATE loyalty_accounts SET tier=$1 WHERE customer_id=$2`,[newTier, customer_id]);
    }
    await client.query(
      `INSERT INTO loyalty_transactions (customer_id,type,points,credit_amount,reference,performed_by,performed_by_name)
       VALUES ($1,'EARN_POINTS',$2,0,$3,$4,$5)`,
      [customer_id, points, reference||'Sale', req.user.id, req.user.name]
    );
    await client.query('COMMIT');
    res.json({ success:true, points_earned:points, new_balance:acct.rows[0].points+points, tier:newTier });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// Redeem points
router.post('/redeem', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_id, points_to_redeem } = req.body;
    const settings = (await client.query(`SELECT * FROM loyalty_settings LIMIT 1`)).rows[0];
    const acct = (await client.query(`SELECT * FROM loyalty_accounts WHERE customer_id=$1`,[customer_id])).rows[0];
    if (!acct) return res.status(400).json({ success:false, message:'Not enrolled' });
    if (acct.points < points_to_redeem) return res.status(400).json({ success:false, message:`Insufficient points. Have ${acct.points}` });
    const ksh_value = points_to_redeem * settings.ksh_per_point;
    await client.query('BEGIN');
    await client.query(`UPDATE loyalty_accounts SET points=points-$1,updated_at=NOW() WHERE customer_id=$2`,[points_to_redeem,customer_id]);
    await client.query(
      `INSERT INTO loyalty_transactions (customer_id,type,points,credit_amount,performed_by,performed_by_name)
       VALUES ($1,'REDEEM_POINTS',$2,$3,$4,$5)`,
      [customer_id,-points_to_redeem,ksh_value,req.user.id,req.user.name]
    );
    await client.query('COMMIT');
    res.json({ success:true, points_redeemed:points_to_redeem, ksh_value, message:`KSh ${ksh_value.toFixed(2)} discount applied` });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// Add credit
router.post('/credit/add', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_id, amount, notes } = req.body;
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE loyalty_accounts SET credit_balance=credit_balance+$1,updated_at=NOW() WHERE customer_id=$2 RETURNING *`,
      [amount,customer_id]
    );
    if (!r.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ success:false, message:'Not enrolled' }); }
    await client.query(
      `INSERT INTO loyalty_transactions (customer_id,type,credit_amount,notes,performed_by,performed_by_name)
       VALUES ($1,'CREDIT_DEPOSIT',0,$2,$3,$4,$5)`,
      [customer_id,amount,notes||'',req.user.id,req.user.name]
    );
    await client.query('COMMIT');
    res.json({ success:true, new_balance:r.rows[0].credit_balance, message:`KSh ${amount} credit added` });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// Spend credit
router.post('/credit/spend', authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { customer_id, amount } = req.body;
    const acct = (await client.query(`SELECT * FROM loyalty_accounts WHERE customer_id=$1`,[customer_id])).rows[0];
    if (!acct) return res.status(400).json({ success:false, message:'Not enrolled' });
    if (acct.credit_balance < amount) return res.status(400).json({ success:false, message:`Insufficient credit. Balance: KSh ${acct.credit_balance}` });
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE loyalty_accounts SET credit_balance=credit_balance-$1,updated_at=NOW() WHERE customer_id=$2 RETURNING *`,
      [amount,customer_id]
    );
    await client.query(
      `INSERT INTO loyalty_transactions (customer_id,type,credit_amount,performed_by,performed_by_name)
       VALUES ($1,'CREDIT_SPEND',$2,$3,$4)`,
      [customer_id,-amount,req.user.id,req.user.name]
    );
    await client.query('COMMIT');
    res.json({ success:true, new_balance:r.rows[0].credit_balance });
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

// Transactions
router.get('/transactions/:customerId', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM loyalty_transactions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.customerId]
    );
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

// Settings
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM loyalty_settings LIMIT 1`);
    res.json({ success:true, data:result.rows[0]||{} });
  } catch (err) { next(err); }
});
router.put('/settings', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const { points_per_ksh, ksh_per_point, silver_threshold, gold_threshold, platinum_threshold } = req.body;
    const result = await pool.query(
      `UPDATE loyalty_settings SET points_per_ksh=$1,ksh_per_point=$2,silver_threshold=$3,
         gold_threshold=$4,platinum_threshold=$5,updated_at=NOW() RETURNING *`,
      [points_per_ksh,ksh_per_point,silver_threshold,gold_threshold,platinum_threshold]
    );
    res.json({ success:true, data:result.rows[0] });
  } catch (err) { next(err); }
});

// Leaderboard
router.get('/leaderboard', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT la.*, c.name, c.phone FROM loyalty_accounts la
       JOIN customers c ON c.id=la.customer_id
       ORDER BY la.total_earned_points DESC LIMIT 20`
    );
    res.json({ success:true, data:result.rows });
  } catch (err) { next(err); }
});

module.exports = router;