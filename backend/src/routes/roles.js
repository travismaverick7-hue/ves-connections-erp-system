const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

// ── Ensure tables exist ───────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS permissions (
    id         SERIAL PRIMARY KEY,
    role_id    INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    module     VARCHAR(60) NOT NULL,
    can_view   BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_edit   BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    UNIQUE(role_id, module)
  );
  -- Seed default roles if empty
  INSERT INTO roles (name, description) VALUES
    ('Admin',   'Full system access'),
    ('Manager', 'Branch management access'),
    ('Cashier', 'Sales and POS access')
  ON CONFLICT (name) DO NOTHING;
`).catch(console.error);

router.use(authenticate);

// GET /api/roles — list all roles with their permissions
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, json_agg(json_build_object(
        'id',p.id,'module',p.module,'can_view',p.can_view,
        'can_create',p.can_create,'can_edit',p.can_edit,'can_delete',p.can_delete
      ) ORDER BY p.module) FILTER (WHERE p.id IS NOT NULL) AS permissions
      FROM roles r LEFT JOIN permissions p ON p.role_id=r.id GROUP BY r.id ORDER BY r.name
    `);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// GET /api/roles/my-permissions — returns permissions for the logged-in user's role
router.get('/my-permissions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.module, p.can_view, p.can_create, p.can_edit, p.can_delete
      FROM permissions p
      JOIN roles r ON r.id = p.role_id
      WHERE r.name = $1
    `, [req.user.role]);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// POST /api/roles — create a new role
router.post('/', authorize('Admin'), async (req, res, next) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name required.' });
    const { rows } = await pool.query(
      `INSERT INTO roles (name,description) VALUES ($1,$2) RETURNING *`, [name, description||null]
    );
    await auditLog(req.user.id, req.user.name, 'CREATE', 'role', rows[0].id, name);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// PUT /api/roles/:id/permissions — save full permission set for a role
router.put('/:id/permissions', authorize('Admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'permissions must be an array' });
    }
    await client.query('BEGIN');
    for (const p of permissions) {
      await client.query(
        `INSERT INTO permissions (role_id,module,can_view,can_create,can_edit,can_delete)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (role_id,module) DO UPDATE SET
           can_view=$3, can_create=$4, can_edit=$5, can_delete=$6`,
        [req.params.id, p.module, p.can_view||false, p.can_create||false, p.can_edit||false, p.can_delete||false]
      );
    }
    await client.query('COMMIT');
    await auditLog(req.user.id, req.user.name, 'UPDATE', 'role_permissions', req.params.id);
    res.json({ success: true, message: 'Permissions updated.' });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// DELETE /api/roles/:id — delete a role (Admin only, cannot delete Admin role)
router.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT name FROM roles WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Role not found' });
    if (rows[0].name === 'Admin') return res.status(403).json({ success: false, message: 'Cannot delete Admin role' });
    await pool.query(`DELETE FROM roles WHERE id=$1`, [req.params.id]);
    res.json({ success: true, message: 'Role deleted' });
  } catch (e) { next(e); }
});

module.exports = router;