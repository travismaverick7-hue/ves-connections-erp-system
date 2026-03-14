const express = require('express');
const router  = express.Router();
const { body, validationResult } = require('express-validator');
const pool    = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/errorHandler');

router.use(authenticate);

// GET /api/products — list all with supplier name
router.get('/', async (req, res, next) => {
  try {
    const { category, branch, low_stock, search } = req.query;
    let where = ['p.is_active = TRUE'];
    const params = [];

    if (category)   { params.push(category); where.push(`p.category = $${params.length}`); }
    if (search)     { params.push(`%${search}%`); where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`); }
    if (low_stock === 'true') {
      where.push(`(p.main_branch_qty < p.min_stock OR p.west_branch_qty < p.min_stock)`);
    }

    const sql = `
      SELECT p.*, s.name AS supplier_name
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE ${where.join(' AND ')}
      ORDER BY p.category, p.name
    `;
    const { rows } = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
});

// GET /api/products/categories
router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT DISTINCT category FROM products WHERE is_active=TRUE ORDER BY category`);
    res.json({ success: true, data: rows.map(r => r.category) });
  } catch (err) { next(err); }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, s.name AS supplier_name FROM products p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.id = $1 AND p.is_active = TRUE`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/products
router.post('/',
  authorize('Admin','Manager'),
  [
    body('name').trim().notEmpty().withMessage('Name required'),
    body('sku').trim().notEmpty().withMessage('SKU required'),
    body('sell_price').isNumeric().withMessage('Sell price must be a number'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const { name, sku, barcode, category, buy_price, sell_price,
              main_branch_qty, west_branch_qty, min_stock, supplier_id } = req.body;

      const { rows } = await pool.query(
        `INSERT INTO products (name,sku,barcode,category,buy_price,sell_price,
           main_branch_qty,west_branch_qty,min_stock,supplier_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [name, sku, barcode||null, category||null, buy_price||0, sell_price,
         main_branch_qty||0, west_branch_qty||0, min_stock||5, supplier_id||null]
      );
      await auditLog(req.user.id, req.user.name, 'CREATE_PRODUCT', 'products', rows[0].id, name, req.ip);
      res.status(201).json({ success: true, message: 'Product created.', data: rows[0] });
    } catch (err) { next(err); }
  }
);

// PUT /api/products/:id
router.put('/:id', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { name, sku, barcode, category, buy_price, sell_price,
            main_branch_qty, west_branch_qty, min_stock, supplier_id } = req.body;

    const { rows } = await pool.query(
      `UPDATE products SET name=$1,sku=$2,barcode=$3,category=$4,buy_price=$5,
         sell_price=$6,main_branch_qty=$7,west_branch_qty=$8,min_stock=$9,
         supplier_id=$10,updated_at=NOW()
       WHERE id=$11 AND is_active=TRUE RETURNING *`,
      [name,sku,barcode,category,buy_price,sell_price,
       main_branch_qty,west_branch_qty,min_stock,supplier_id||null,req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });
    await auditLog(req.user.id, req.user.name, 'UPDATE_PRODUCT', 'products', req.params.id, name, req.ip);
    res.json({ success: true, message: 'Product updated.', data: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/products/:id/stock — adjust stock for a branch
router.patch('/:id/stock', authorize('Admin','Manager'), async (req, res, next) => {
  try {
    const { branch, qty, operation } = req.body; // operation: 'set' | 'add' | 'subtract'
    const col = branch === 'Main Branch' ? 'main_branch_qty' : 'west_branch_qty';
    let sql;
    if (operation === 'add')      sql = `UPDATE products SET ${col} = ${col} + $1 WHERE id = $2 RETURNING *`;
    else if (operation === 'subtract') sql = `UPDATE products SET ${col} = GREATEST(0, ${col} - $1) WHERE id = $2 RETURNING *`;
    else                          sql = `UPDATE products SET ${col} = $1 WHERE id = $2 RETURNING *`;

    const { rows } = await pool.query(sql, [qty, req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Product not found.' });
    await auditLog(req.user.id, req.user.name, 'ADJUST_STOCK', 'products', req.params.id, `${branch}: ${operation} ${qty}`, req.ip);
    res.json({ success: true, message: 'Stock updated.', data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/products/:id (soft)
router.delete('/:id', authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('UPDATE products SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DELETE_PRODUCT', 'products', req.params.id, null, req.ip);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
