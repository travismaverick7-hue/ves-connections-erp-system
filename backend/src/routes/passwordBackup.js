/**
 * VES CONNECTIONS ERP — Password Backup & Recovery System
 * Routes:
 *   POST /api/auth/request-reset       — user requests a reset token (no auth)
 *   POST /api/auth/verify-token        — validate token is still valid (no auth)
 *   POST /api/auth/reset-password      — consume token, set new password (no auth)
 *   POST /api/auth/admin-reset         — Admin force-sets any user's password (auth + Admin)
 *   GET  /api/auth/reset-tokens        — Admin lists all tokens (auth + Admin)
 *   DELETE /api/auth/reset-tokens/:id  — Admin revoke a token (auth + Admin)
 *   GET  /api/auth/password-history/:userId — Admin view pw history (auth + Admin)
 *   POST /api/auth/set-recovery-hint   — User sets a recovery hint (auth)
 *   GET  /api/auth/users-security      — Admin view all users' security status (auth + Admin)
 */
const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const { body, validationResult } = require('express-validator');
const pool      = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Generate a cryptographically secure 32-byte hex token */
function genToken() {
  return crypto.randomBytes(32).toString('hex'); // 64 hex chars
}

/** Add N hours to now */
function expiresIn(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/** Save current password to history before changing it */
async function archivePassword(client, userId, currentHash, changedBy, changedByName, reason = 'USER_CHANGE') {
  await client.query(
    `INSERT INTO password_history (user_id, password_hash, changed_by, changed_by_name, change_reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, currentHash, changedBy, changedByName, reason]
  );
  // Keep only the last 10 history entries per user
  await client.query(
    `DELETE FROM password_history
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
       )`,
    [userId]
  );
}

/** Check if a new password matches any of the last N used passwords */
async function isPasswordReused(userId, newPassword, lastN = 5) {
  const result = await pool.query(
    `SELECT password_hash FROM password_history
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, lastN]
  );
  for (const row of result.rows) {
    const match = await bcrypt.compare(newPassword, row.password_hash);
    if (match) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/request-reset
// Any user (including unauthenticated) can request a reset token for a username.
// Returns token directly (since no email server) — token is shown to Admin.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/request-reset',
  [body('username').trim().notEmpty().withMessage('Username is required')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { username } = req.body;
      const result = await pool.query(
        'SELECT id, name, username, is_active FROM users WHERE LOWER(username) = LOWER($1)',
        [username.trim()]
      );

      // Always return the same response to prevent user enumeration
      if (!result.rows.length || !result.rows[0].is_active) {
        return res.json({
          success: true,
          message: 'If that username exists, a reset token has been generated. Contact your Admin.',
          token: null,
          masked: true,
        });
      }

      const user  = result.rows[0];
      const token = genToken();

      // Invalidate any existing unused tokens for this user
      await pool.query(
        `UPDATE password_reset_tokens SET used = TRUE, used_at = NOW()
         WHERE user_id = $1 AND used = FALSE AND token_type = 'RESET'`,
        [user.id]
      );

      await pool.query(
        `INSERT INTO password_reset_tokens
           (user_id, token, token_type, expires_at, ip_address)
         VALUES ($1, $2, 'RESET', $3, $4)`,
        [user.id, token, expiresIn(24), req.ip]
      );

      await auditLog(user.id, user.name, 'PASSWORD_RESET_REQUESTED', 'users', user.id, null, req.ip);

      res.json({
        success:     true,
        message:     `Reset token generated for ${user.name}. Token expires in 24 hours.`,
        token,                 // returned to frontend — Admin must hand this to the user
        user_name:   user.name,
        expires_in:  '24 hours',
        instructions:'Give this token to the user. They will use it to set a new password.',
      });
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify-token  { token }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-token',
  [body('token').trim().notEmpty().withMessage('Token is required')],
  async (req, res, next) => {
    try {
      const { token } = req.body;
      const result = await pool.query(
        `SELECT prt.*, u.name, u.username
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token = $1`,
        [token]
      );

      if (!result.rows.length) {
        return res.status(400).json({ success: false, message: 'Invalid or unknown token.' });
      }

      const row = result.rows[0];
      if (row.used) {
        return res.status(400).json({ success: false, message: 'This token has already been used.' });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ success: false, message: 'Token has expired. Request a new one.' });
      }

      res.json({
        success:    true,
        valid:      true,
        user_name:  row.name,
        username:   row.username,
        expires_at: row.expires_at,
        token_type: row.token_type,
      });
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password  { token, newPassword }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password',
  [
    body('token').trim().notEmpty().withMessage('Token is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { token, newPassword } = req.body;

      await client.query('BEGIN');

      const result = await client.query(
        `SELECT prt.*, u.name, u.username, u.password_hash
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
         WHERE prt.token = $1 FOR UPDATE`,
        [token]
      );

      if (!result.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Invalid or unknown token.' });
      }

      const row = result.rows[0];
      if (row.used) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Token already used.' });
      }
      if (new Date(row.expires_at) < new Date()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Token has expired. Request a new one.' });
      }

      // Check password history
      const reused = await isPasswordReused(row.user_id, newPassword, 5);
      if (reused) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'You cannot reuse one of your last 5 passwords.' });
      }

      // Archive old password
      await archivePassword(client, row.user_id, row.password_hash, row.user_id, row.name, 'USER_CHANGE');

      // Set new password
      const hash = await bcrypt.hash(newPassword, 10);
      await client.query(
        `UPDATE users
         SET password_hash = $1, updated_at = NOW(), pw_last_changed = NOW(),
             failed_attempts = 0, locked_until = NULL, must_change_pw = FALSE
         WHERE id = $2`,
        [hash, row.user_id]
      );

      // Mark token as used
      await client.query(
        `UPDATE password_reset_tokens SET used = TRUE, used_at = NOW() WHERE id = $1`,
        [row.id]
      );

      await auditLog(row.user_id, row.name, 'PASSWORD_RESET_USED', 'users', row.user_id, null, req.ip);
      await client.query('COMMIT');

      res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/admin-reset  { userId, newPassword, reason?, mustChange? }
// Admin only: directly sets a user's password and optionally flags must_change_pw
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin-reset',
  authenticate, authorize('Admin'),
  [
    body('userId').notEmpty().withMessage('User ID required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { userId, newPassword, mustChange = true, reason = '' } = req.body;

      await client.query('BEGIN');

      const uRes = await client.query(
        'SELECT id, name, username, password_hash FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE',
        [userId]
      );
      if (!uRes.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'User not found or inactive.' });
      }

      const targetUser = uRes.rows[0];

      // Archive old password
      await archivePassword(
        client, targetUser.id, targetUser.password_hash,
        req.user.id, req.user.name, 'ADMIN_RESET'
      );

      const hash = await bcrypt.hash(newPassword, 10);
      await client.query(
        `UPDATE users
         SET password_hash = $1, updated_at = NOW(), pw_last_changed = NOW(),
             failed_attempts = 0, locked_until = NULL,
             must_change_pw = $2
         WHERE id = $3`,
        [hash, mustChange, targetUser.id]
      );

      // Invalidate all existing tokens for this user
      await client.query(
        `UPDATE password_reset_tokens SET used = TRUE, used_at = NOW()
         WHERE user_id = $1 AND used = FALSE`,
        [targetUser.id]
      );

      await auditLog(
        req.user.id, req.user.name, 'ADMIN_PASSWORD_RESET', 'users', targetUser.id,
        `Reset password for ${targetUser.name}. Reason: ${reason || 'Not specified'}`,
        req.ip
      );
      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Password reset for ${targetUser.name}. ${mustChange ? 'They must change it on next login.' : ''}`,
        must_change: mustChange,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/generate-admin-token  { userId }
// Admin generates a token for a user (alternative to email flow)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate-admin-token',
  authenticate, authorize('Admin'),
  [body('userId').notEmpty().withMessage('User ID required')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { userId, expiryHours = 2, notes = '' } = req.body;

      const uRes = await pool.query(
        'SELECT id, name, username FROM users WHERE id = $1 AND is_active = TRUE',
        [userId]
      );
      if (!uRes.rows.length) return res.status(404).json({ success: false, message: 'User not found.' });

      const user  = uRes.rows[0];
      const token = genToken();

      // Invalidate previous admin tokens for this user
      await pool.query(
        `UPDATE password_reset_tokens SET used = TRUE, used_at = NOW()
         WHERE user_id = $1 AND used = FALSE AND token_type = 'ADMIN_RESET'`,
        [user.id]
      );

      await pool.query(
        `INSERT INTO password_reset_tokens
           (user_id, token, token_type, created_by, created_by_name, expires_at, ip_address, notes)
         VALUES ($1, $2, 'ADMIN_RESET', $3, $4, $5, $6, $7)`,
        [user.id, token, req.user.id, req.user.name, expiresIn(expiryHours), req.ip, notes]
      );

      await auditLog(
        req.user.id, req.user.name, 'ADMIN_GENERATED_RESET_TOKEN', 'users', user.id,
        `Token for ${user.name} (${expiryHours}h). ${notes}`, req.ip
      );

      res.json({
        success:     true,
        token,
        user_name:   user.name,
        username:    user.username,
        expires_in:  `${expiryHours} hour(s)`,
        expires_at:  expiresIn(expiryHours),
        instructions:'Share this token with the user so they can reset their password.',
      });
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/reset-tokens  — Admin: list all tokens
// ─────────────────────────────────────────────────────────────────────────────
router.get('/reset-tokens', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT prt.*, u.name AS user_name, u.username
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       ORDER BY prt.created_at DESC
       LIMIT 100`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/reset-tokens/:id  — Admin: revoke a specific token
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/reset-tokens/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE password_reset_tokens SET used = TRUE, used_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    await auditLog(req.user.id, req.user.name, 'RESET_TOKEN_REVOKED', 'password_reset_tokens', req.params.id, null, req.ip);
    res.json({ success: true, message: 'Token revoked.' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/password-history/:userId  — Admin: view user pw history
// ─────────────────────────────────────────────────────────────────────────────
router.get('/password-history/:userId', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, changed_by_name, change_reason, created_at
       FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/set-recovery-hint  { hint }  — Authenticated user sets their own hint
// ─────────────────────────────────────────────────────────────────────────────
router.post('/set-recovery-hint',
  authenticate,
  [body('hint').trim().isLength({ min: 3, max: 200 }).withMessage('Hint must be 3-200 characters')],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
      await pool.query('UPDATE users SET recovery_hint = $1 WHERE id = $2', [req.body.hint, req.user.id]);
      res.json({ success: true, message: 'Recovery hint saved.' });
    } catch (err) { next(err); }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/users-security  — Admin: all users' security metadata
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users-security', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.username, u.role, u.branch,
              u.is_active, u.last_login, u.failed_attempts, u.locked_until,
              u.must_change_pw, u.pw_last_changed, u.created_at,
              u.recovery_hint IS NOT NULL AS has_hint,
              (SELECT COUNT(*) FROM password_history ph WHERE ph.user_id = u.id) AS pw_changes,
              (SELECT COUNT(*) FROM password_reset_tokens prt
               WHERE prt.user_id = u.id AND prt.used = FALSE
                 AND prt.expires_at > NOW()) AS active_tokens
       FROM users u ORDER BY u.name`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/unlock-user  { userId }  — Admin: clear lockout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/unlock-user',
  authenticate, authorize('Admin'),
  [body('userId').notEmpty()],
  async (req, res, next) => {
    try {
      await pool.query(
        `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
        [req.body.userId]
      );
      await auditLog(req.user.id, req.user.name, 'USER_UNLOCKED', 'users', req.body.userId, null, req.ip);
      res.json({ success: true, message: 'User unlocked.' });
    } catch (err) { next(err); }
  }
);

module.exports = router;