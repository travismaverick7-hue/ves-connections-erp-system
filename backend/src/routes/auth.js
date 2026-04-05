const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');
const { auditLog }     = require('../middleware/errorHandler');

//--------------POST /api/auth/login-------------//
router.post('/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { username, password } = req.body;

      const result = await pool.query(
        `SELECT * FROM users WHERE username = $1 AND is_active = TRUE`,
        [username.toLowerCase().trim()]
      );

      if (!result.rows.length) {
        return res.status(401).json({ success: false, message: 'Invalid username or password.' });
      }

      const user = result.rows[0];

      //---------------Check account lockout----------------//
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const minutesLeft = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
        return res.status(403).json({
          success: false,
          message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
          locked: true,
          locked_until: user.locked_until,
        });
      }

      const match = await bcrypt.compare(password, user.password_hash);

      if (!match) {
        //-------------Increment failed attempts- lock after 5-----------//
        const newAttempts = (user.failed_attempts || 0) + 1;
        const lockUntil   = newAttempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null; // 30-min lockout
        await pool.query(
          `UPDATE users SET failed_attempts = $1, locked_until = $2 WHERE id = $3`,
          [newAttempts, lockUntil, user.id]
        );
        const remaining = Math.max(0, 5 - newAttempts);
        return res.status(401).json({
          success: false,
          message: remaining > 0
            ? `Invalid username or password. ${remaining} attempt(s) remaining before lockout.`
            : 'Account locked for 30 minutes due to too many failed attempts.',
          attempts_remaining: remaining,
        });
      }

      //------------Successful login---------------//
      await pool.query(
        `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
        [user.id]
      );

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      await auditLog(user.id, user.name, 'LOGIN', 'users', user.id, null, req.ip);

      res.json({
        success: true,
        message: `Welcome back, ${user.name}!`,
        token,
        must_change_password: user.must_change_pw || false,
        user: {
          id:       user.id,
          name:     user.name,
          username: user.username,
          role:     user.role,
          branch:   user.branch,
          avatar:   user.avatar,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

//------------GET /api/auth/me--------------//
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, user: req.user });
});

//---------------PUT /api/auth/change-password---------------//
router.put('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { currentPassword, newPassword } = req.body;
      const row = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const match = await bcrypt.compare(currentPassword, row.rows[0].password_hash);
      if (!match) return res.status(400).json({ success: false, message: 'Current password is incorrect.' });

      const hash = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
      await auditLog(req.user.id, req.user.name, 'CHANGE_PASSWORD', 'users', req.user.id, null, req.ip);

      res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
