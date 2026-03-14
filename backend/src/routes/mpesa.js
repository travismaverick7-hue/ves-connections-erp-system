/**
 * VES CONNECTIONS LIMITED — M-Pesa Daraja Routes
 * File: routes/mpesa.js
 *
 * Endpoints:
 *  POST   /api/mpesa/stk-push
 *  POST   /api/mpesa/callback
 *  GET    /api/mpesa/transactions
 *  GET    /api/mpesa/summary
 *  PATCH  /api/mpesa/transactions/:id/status
 *  GET    /api/mpesa/config
 *  POST   /api/mpesa/config
 *  GET    /api/mpesa/token-test
 */

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

// ── Import shared DB pool (same pattern as other routes) ─────────
let pool;
try       { pool = require('../config/db'); }        // backend/src/config/db.js
catch(_)  {
  try     { pool = require('../db'); }               // backend/src/db.js
  catch(_){
    try   { pool = require('../../config/db'); }     // backend/config/db.js
    catch(_){ pool = require('../../db'); }          // backend/db.js
  }
}

const { authenticate } = require('../middleware/auth');

// ── Daraja URLs ────────────────────────────────────────────────────────────────
const DARAJA = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  live:    'https://api.safaricom.co.ke',
};

// ── Default Sandbox credentials (from Maverick app) ──────────────────────
const SANDBOX_DEFAULTS = {
  consumer_key:    'AR94AvcY7kAvvT2DjNYLISrZGAJCAjWT6hyOU2sEMVC8G9Sd',
  consumer_secret: 'x3tHlKwk1fthm9ZxscVHLAsAiUgdfvYUbopPAwlHnAtF5rq3TMXYJGs1WKk2cGQe',
  shortcode:       '174379',
  passkey:         'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
  environment:     'sandbox',
  till_number:     '8359400',
};

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** Get OAuth2 access token from Daraja */
async function getAccessToken(env, consumerKey, consumerSecret) {
  const base64 = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const url    = `${DARAJA[env] || DARAJA.sandbox}/oauth/v1/generate?grant_type=client_credentials`;
  const res    = await axios.get(url, { headers: { Authorization: `Basic ${base64}` } });
  return res.data.access_token;
}

/** YYYYMMDDHHmmss */
function timestamp() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}

/** Base64(shortcode + passkey + timestamp) */
function makePassword(shortcode, passkey, ts) {
  return Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
}

/** 0712345678 or 712345678 → 254712345678 */
function formatPhone(raw) {
  const p = String(raw).replace(/\s+/g, '').replace(/^\+/, '');
  if (p.startsWith('254')) return p;
  if (p.startsWith('0'))   return '254' + p.slice(1);
  return '254' + p;
}

/** Load saved config from DB, fall back to sandbox defaults */
async function loadConfig() {
  try {
    const res = await pool.query(`SELECT * FROM mpesa_config ORDER BY id DESC LIMIT 1`);
    if (res.rows.length > 0) {
      const r = res.rows[0];
      return {
        consumer_key:    r.consumer_key    || SANDBOX_DEFAULTS.consumer_key,
        consumer_secret: r.consumer_secret || SANDBOX_DEFAULTS.consumer_secret,
        shortcode:       r.shortcode       || SANDBOX_DEFAULTS.shortcode,
        passkey:         r.passkey         || SANDBOX_DEFAULTS.passkey,
        environment:     r.environment     || 'sandbox',
        till_number:     r.till_number     || '',
        paybill_number:  r.paybill_number  || '',
      };
    }
  } catch (_) { /* table may not exist yet — use defaults */ }
  return SANDBOX_DEFAULTS;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Ensure tables exist (runs once on first request)
// ═════════════════════════════════════════════════════════════════════════════
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mpesa_config (
      id               SERIAL PRIMARY KEY,
      environment      VARCHAR(10)  DEFAULT 'sandbox',
      shortcode        VARCHAR(20),
      consumer_key     TEXT,
      consumer_secret  TEXT,
      passkey          TEXT,
      till_number      VARCHAR(20),
      paybill_number   VARCHAR(20),
      callback_url     TEXT,
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Add missing columns to existing table (safe to run multiple times)
  await pool.query(`ALTER TABLE mpesa_config ADD COLUMN IF NOT EXISTS callback_url TEXT;`);
  await pool.query(`ALTER TABLE mpesa_config ADD COLUMN IF NOT EXISTS till_number VARCHAR(20);`);
  await pool.query(`ALTER TABLE mpesa_config ADD COLUMN IF NOT EXISTS paybill_number VARCHAR(20);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mpesa_transactions (
      id                   SERIAL PRIMARY KEY,
      phone                VARCHAR(20),
      amount               NUMERIC(12,2),
      reference            VARCHAR(50),
      description          VARCHAR(100),
      merchant_request_id  VARCHAR(100),
      checkout_request_id  VARCHAR(100),
      mpesa_receipt        VARCHAR(50),
      status               VARCHAR(20) DEFAULT 'Pending',
      result_code          VARCHAR(10),
      result_desc          TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      completed_at         TIMESTAMPTZ
    );
  `);
}

// Run once when module loads
ensureTables().catch(console.error);


// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/mpesa/stk-push
//  Sends STK Push prompt to customer's phone
// ═════════════════════════════════════════════════════════════════════════════
router.post('/stk-push', authenticate, async (req, res) => {
  try {
    const {
      phone,
      amount,
      reference   = 'VES Payment',
      description = 'VES Payment',
    } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ success: false, message: 'phone and amount are required' });
    }
    if (isNaN(+amount) || +amount < 1) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }

    // Load credentials from DB (or use sandbox defaults)
    const cfg = await loadConfig();

    console.log('🔄 STK Push attempt:', { phone, amount, env: cfg.environment, shortcode: cfg.shortcode });

    // 1. Get access token
    const token = await getAccessToken(cfg.environment, cfg.consumer_key, cfg.consumer_secret);
    console.log('✅ Access token obtained');

    // 2. Build password & payload
    const ts       = timestamp();
    const password = makePassword(cfg.shortcode, cfg.passkey, ts);
    const fPhone   = formatPhone(phone);

    // Callback URL — for sandbox Daraja accepts ANY valid https URL
    // If not set in .env, use a dummy valid URL for sandbox testing
    const callbackUrl = process.env.MPESA_CALLBACK_URL ||
      (cfg.environment === 'sandbox'
        ? 'https://webhook.site/ves-mpesa-callback'   // sandbox: any valid URL works
        : null);

    if (!callbackUrl) {
      return res.status(400).json({
        success: false,
        error: 'MPESA_CALLBACK_URL not set in your backend .env file. Add it and restart the server.',
      });
    }

    const tillNumber = cfg.till_number || cfg.shortcode;

    const payload = {
      BusinessShortCode: cfg.shortcode,
      Password:          password,
      Timestamp:         ts,
      TransactionType:   cfg.till_number ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
      Amount:            Math.ceil(+amount),
      PartyA:            fPhone,
      PartyB:            cfg.till_number || cfg.shortcode,
      PhoneNumber:       fPhone,
      CallBackURL:       callbackUrl,
      AccountReference:  String(reference).slice(0, 12),
      TransactionDesc:   String(description).slice(0, 13),
    };

    console.log('📤 Sending to Daraja:', {
      ...payload,
      Password: '***',
      CallBackURL: callbackUrl,
    });

    const stkRes = await axios.post(
      `${DARAJA[cfg.environment]}/mpesa/stkpush/v1/processrequest`,
      payload,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('📥 Daraja raw response:', stkRes.data);
    const daraja = stkRes.data;

    // ResponseCode '0' = success, anything else = failure
    if (daraja.ResponseCode !== '0') {
      return res.status(500).json({
        success: false,
        error: daraja.ResponseDescription || 'STK Push rejected by Daraja',
        daraja: daraja,
      });
    }

    // 4. Save transaction to DB
    const dbRes = await pool.query(
      `INSERT INTO mpesa_transactions
         (phone, amount, reference, description, merchant_request_id, checkout_request_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Pending') RETURNING *`,
      [fPhone, +amount, reference, description, daraja.MerchantRequestID, daraja.CheckoutRequestID]
    );

    return res.json({
      success: true,
      data: {
        ...dbRes.rows[0],
        response_code:        daraja.ResponseCode,
        response_description: daraja.ResponseDescription,
        customer_message:     daraja.CustomerMessage,
      },
    });

  } catch (err) {
    const darErr = err?.response?.data;
    console.error('❌ STK Push FAILED');
    console.error('   Status:', err?.response?.status);
    console.error('   Daraja error:', JSON.stringify(darErr, null, 2));
    console.error('   Message:', err.message);

    const ERR = {
      '400.002.02': 'Invalid credentials — check Consumer Key/Secret and Shortcode',
      '400.002.05': 'Access token error — credentials may be wrong',
      '401.002.01': 'Authentication failed — check Consumer Key and Secret',
      '404.001.04': 'Invalid phone number format',
      '500.001.1001': 'Phone unreachable or M-Pesa service error',
    };

    const code = darErr?.errorCode || darErr?.ResultCode || '';
    const msg  = ERR[code] || darErr?.errorMessage || darErr?.ResultDesc || err.message || 'STK Push failed';

    return res.status(500).json({
      success: false,
      error:   msg,
      code,
      // Return full Daraja error so frontend can show it
      detail:  darErr || err.message,
    });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/mpesa/callback
//  Safaricom calls this after customer completes/cancels payment
//  ⚠️  Must be publicly accessible — use ngrok for local dev
// ═════════════════════════════════════════════════════════════════════════════
router.post('/callback', async (req, res) => {
  try {
    const cb = req.body?.Body?.stkCallback;
    if (!cb) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = cb;
    console.log('📲 M-Pesa Callback:', { CheckoutRequestID, ResultCode, ResultDesc });

    if (ResultCode === 0) {
      // ✅ Success — extract receipt details
      const items   = CallbackMetadata?.Item || [];
      const get     = (name) => items.find(i => i.Name === name)?.Value;
      const receipt = get('MpesaReceiptNumber');
      const amount  = get('Amount');
      const phone   = get('PhoneNumber');

      await pool.query(
        `UPDATE mpesa_transactions
            SET status='Success', mpesa_receipt=$1, result_code=$2, result_desc=$3, completed_at=NOW()
          WHERE checkout_request_id=$4`,
        [receipt, String(ResultCode), ResultDesc, CheckoutRequestID]
      );
      console.log(`✅ Payment confirmed: ${receipt} | KSh ${amount} from ${phone}`);
    } else {
      // ❌ Failed/cancelled
      await pool.query(
        `UPDATE mpesa_transactions
            SET status='Failed', result_code=$1, result_desc=$2, completed_at=NOW()
          WHERE checkout_request_id=$3`,
        [String(ResultCode), ResultDesc, CheckoutRequestID]
      );
      console.log(`❌ Payment failed: ${ResultDesc}`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('Callback error:', err.message);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Always ACK Safaricom
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/mpesa/transactions
// ═════════════════════════════════════════════════════════════════════════════
router.get('/transactions', authenticate, async (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    let q = `SELECT * FROM mpesa_transactions`;
    const params = [];
    if (status) { q += ` WHERE status=$1`; params.push(status); }
    q += ` ORDER BY created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const result = await pool.query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/mpesa/summary
// ═════════════════════════════════════════════════════════════════════════════
router.get('/summary', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                          AS total_count,
        COUNT(*) FILTER (WHERE status='Success')         AS success_count,
        COUNT(*) FILTER (WHERE status='Failed')          AS failed_count,
        COUNT(*) FILTER (WHERE status='Pending')         AS pending_count,
        COALESCE(SUM(amount) FILTER (WHERE status='Success'), 0)                           AS total_received,
        COALESCE(SUM(amount) FILTER (WHERE status='Success' AND created_at::date=NOW()::date), 0) AS today_received
      FROM mpesa_transactions
    `);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  PATCH /api/mpesa/transactions/:id/status
// ═════════════════════════════════════════════════════════════════════════════
router.patch('/transactions/:id/status', authenticate, async (req, res) => {
  try {
    const { status, mpesa_receipt } = req.body;
    const result = await pool.query(
      `UPDATE mpesa_transactions SET status=$1, mpesa_receipt=$2, completed_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, mpesa_receipt || null, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/mpesa/config
// ═════════════════════════════════════════════════════════════════════════════
router.get('/config', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM mpesa_config ORDER BY id DESC LIMIT 1`);
    res.json({ success: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  POST /api/mpesa/config  — save credentials to DB
// ═════════════════════════════════════════════════════════════════════════════
router.post('/config', authenticate, async (req, res) => {
  try {
    const { environment, shortcode, consumer_key, consumer_secret, passkey, till_number, paybill_number, callback_url } = req.body;

    // Upsert — delete old then insert fresh (simple approach)
    await pool.query(`DELETE FROM mpesa_config`);
    const result = await pool.query(
      `INSERT INTO mpesa_config
         (environment, shortcode, consumer_key, consumer_secret, passkey, till_number, paybill_number, callback_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [environment||'sandbox', shortcode, consumer_key, consumer_secret, passkey, till_number||null, paybill_number||null, callback_url||null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  GET /api/mpesa/token-test  — verify credentials work
// ═════════════════════════════════════════════════════════════════════════════
router.get('/token-test', authenticate, async (req, res) => {
  try {
    const cfg   = await loadConfig();
    const token = await getAccessToken(cfg.environment, cfg.consumer_key, cfg.consumer_secret);
    res.json({
      success:     true,
      message:     'Credentials working ✅',
      environment: cfg.environment,
      shortcode:   cfg.shortcode,
      token_preview: token.slice(0, 20) + '...',
    });
  } catch (err) {
    const darErr = err?.response?.data;
    res.status(500).json({
      success: false,
      message: 'Credentials FAILED ❌',
      error:   darErr?.errorMessage || err.message,
    });
  }
});


module.exports = router;