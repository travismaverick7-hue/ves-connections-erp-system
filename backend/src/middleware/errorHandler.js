const pool = require('../../config/db');

//--------Global error handler--------//
function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);

  //----Postgres constraint violations--------//
  if (err.code === '23505') {
    return res.status(409).json({ success: false, message: 'Duplicate entry — record already exists.' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Referenced record not found.' });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ success: false, message: 'Invalid ID format.' });
  }

  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

//----------Error 404 handler-----------//
function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found.` });
}

//-------------Audit logger-------------//
async function auditLog(userId, userName, action, entity = null, entityId = null, details = null, ip = null) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, userName, action, entity, entityId, details, ip]
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = { errorHandler, notFound, auditLog };
