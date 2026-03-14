const jwt = require('jsonwebtoken');
const pool = require('../../config/db');

/**
 * Verifies JWT token from Authorization header.
 * Attaches decoded user to req.user.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user still exists and is active
    const result = await pool.query(
      'SELECT id, name, username, role, branch, avatar FROM users WHERE id = $1 AND is_active = TRUE',
      [decoded.id]
    );

    if (!result.rows.length) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated.' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

/**
 * Restricts route to specific roles.
 * Usage: authorize('Admin') or authorize('Admin', 'Manager')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
