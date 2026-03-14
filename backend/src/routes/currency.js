const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

router.use(authenticate);

// ── GET all rates ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM fx_rates ORDER BY currency ASC'
    );
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// ── PUT update a rate (Admin / Manager only) ─────────────────────────────────
router.put('/:currency', authorize('Admin', 'Manager'), async (req, res, next) => {
  try {
    const { rate } = req.body;
    if (!rate || isNaN(rate) || +rate <= 0) {
      return res.status(400).json({ success: false, message: 'Valid positive rate required.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO fx_rates (currency, rate_to_kes, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (currency) DO UPDATE
         SET rate_to_kes = EXCLUDED.rate_to_kes,
             updated_by  = EXCLUDED.updated_by,
             updated_at  = NOW()
       RETURNING *`,
      [req.params.currency.toUpperCase(), +rate, req.user.name]
    );
    await auditLog(req.user.id, req.user.name, 'UPDATE', 'fx_rate', null,
      `${req.params.currency} → KSh ${rate}`);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ── POST convert amount ───────────────────────────────────────────────────────
router.post('/convert', async (req, res, next) => {
  try {
    const { amount, from, to } = req.body;
    if (!amount || !from || !to) {
      return res.status(400).json({ success: false, message: 'amount, from, and to are required.' });
    }

    // Fetch both rates (KES is base = 1)
    const { rows } = await pool.query(
      `SELECT currency, rate_to_kes FROM fx_rates WHERE currency = ANY($1)`,
      [[from.toUpperCase(), to.toUpperCase()]]
    );

    const rateMap = { KES: 1 };
    rows.forEach(r => { rateMap[r.currency] = parseFloat(r.rate_to_kes); });

    const fromRate = rateMap[from.toUpperCase()];
    const toRate   = rateMap[to.toUpperCase()];

    if (!fromRate || !toRate) {
      return res.status(400).json({ success: false, message: 'Unknown currency code.' });
    }

    const amountInKES  = +amount * fromRate;
    const result       = amountInKES / toRate;

    res.json({
      success: true,
      data: {
        from, to, amount: +amount,
        result: parseFloat(result.toFixed(6)),
        rate: parseFloat((fromRate / toRate).toFixed(6)),
        amountInKES: parseFloat(amountInKES.toFixed(2)),
      }
    });
  } catch (e) { next(e); }
});

module.exports = router;