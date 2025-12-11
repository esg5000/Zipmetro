const jwt = require('jsonwebtoken');
const db = require('../database/db');

// Authenticate token middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    
    console.log('🔍 Auth check - decoded token:', { id: decoded.id, email: decoded.email, role: decoded.role, idType: typeof decoded.id });

    const user = await db.getAsync(
      'SELECT id, email, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      console.error('❌ User not found for ID:', decoded.id, 'Type:', typeof decoded.id);
      return res.status(401).json({ error: 'User not found. Please log in again.' });
    }
    
    console.log('✅ User authenticated:', { id: user.id, email: user.email, role: user.role });

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      const user = await db.getAsync(
        'SELECT id, email, role FROM users WHERE id = ?',
        [decoded.id]
      );
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Require admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin
};


