const express = require('express');
const router  = express.Router();
const pool    = require('../../config/db');
const { authenticate } = require('../middleware/auth');
const { auditLog }     = require('../middleware/errorHandler');

router.use(authenticate);

// ── GET all documents ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { category, search } = req.query;
    let where = [];
    const params = [];

    if (category && category !== 'All') {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(title ILIKE $${params.length} OR tags::text ILIKE $${params.length})`);
    }

    const sql = `
      SELECT id, doc_number, title, category, description, linked_to,
             tags, file_name, file_size, file_type, uploaded_by,
             uploaded_at, created_at
      FROM documents
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC
    `;
    // Note: file_data intentionally excluded from list to keep response small
    const { rows } = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

// ── GET single document with file data ───────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ── POST upload document ──────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { title, category, description, linked_to, tags, file_name, file_size, file_type, file_data } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'Title is required.' });

    // Generate doc number
    const countRes = await pool.query('SELECT COUNT(*) FROM documents');
    const doc_number = `DOC-${String(parseInt(countRes.rows[0].count) + 1).padStart(4, '0')}`;

    const { rows } = await pool.query(
      `INSERT INTO documents
         (doc_number, title, category, description, linked_to, tags, file_name, file_size, file_type, file_data, uploaded_by, uploaded_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, doc_number, title, category, description, linked_to, tags, file_name, file_size, file_type, uploaded_by, uploaded_at, created_at`,
      [
        doc_number, title, category || 'Other', description || null,
        linked_to || null,
        tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean)) : [],
        file_name || null, file_size || null, file_type || null,
        file_data || null,
        req.user.name, req.user.id
      ]
    );

    await auditLog(req.user.id, req.user.name, 'CREATE', 'document', rows[0].id,
      `Uploaded: ${title} (${category})`);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ── DELETE document ───────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT title FROM documents WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Document not found.' });
    await pool.query('DELETE FROM documents WHERE id=$1', [req.params.id]);
    await auditLog(req.user.id, req.user.name, 'DELETE', 'document', req.params.id, `Deleted: ${rows[0].title}`);
    res.json({ success: true, message: 'Document deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;