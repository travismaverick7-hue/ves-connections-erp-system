const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// All user routes require Admin
router.use(authenticate, authorize('Admin'));

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,name,username,role,branch,avatar,is_active,created_at FROM users ORDER BY created_at'
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /api/users
router.post('/',
  [
    body('name').trim().notEmpty(),
    body('username').trim().notEmpty().isLength({ min: 3 }),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['Admin','Manager','Cashier']),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { name, username, password, role, branch } = req.body;
      const avatar = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      const hash   = await bcrypt.hash(password, 10);

      const { rows } = await pool.query(
        `INSERT INTO users (name,username,password_hash,role,branch,avatar)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,username,role,branch,avatar`,
        [name, username.toLowerCase(), hash, role, branch || null, avatar]
      );
      await auditLog(req.user.id, req.user.name, 'CREATE_USER', 'users', rows[0].id, name, req.ip);
      res.status(201).json({ success: true, message: 'User created.', data: rows[0] });
    } catch (err) { next(err); }
  }
);

// PUT /api/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, role, branch, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE users SET name=$1,role=$2,branch=$3,is_active=$4,updated_at=NOW()
       WHERE id=$5 RETURNING id,name,role,branch,is_active`,
      [name, role, branch, is_active !== undefined ? is_active : true, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    await auditLog(req.user.id, req.user.name, 'UPDATE_USER', 'users', req.params.id, null, req.ip);
    res.json({ success: true, message: 'User updated.', data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
    }
    await pool.query('UPDATE users SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DEACTIVATE_USER', 'users', req.params.id, null, req.ip);
    res.json({ success: true, message: 'User deactivated.' });
  } catch (err) { next(err); }
});

module.exports = router;
