const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

// Register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user exists
    const existing = await db.getAsync('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const result = await db.runAsync(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone)
       VALUES (?, ?, ?, ?, ?)`,
      [email, password_hash, first_name || '', last_name || '', phone || '']
    );

    // Create default notification preferences
    await db.runAsync(
      'INSERT INTO notification_preferences (user_id, sms, email, push) VALUES (?, 1, 1, 0)',
      [result.lastID]
    );

    // Ensure ID is a string for JWT (handles MongoDB ObjectId)
    const userId = result.lastID && result.lastID.toString ? result.lastID.toString() : result.lastID;

    // Generate token (default role is 'user')
    const token = jwt.sign(
      { id: userId, email, role: 'user' },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: userId, // Use string version for consistency
        email,
        first_name,
        last_name,
        role: 'user'
      }
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt:', { email, hasPassword: !!password });

    if (!email || !password) {
      console.log('Login failed: Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      console.log('Login failed: User not found for email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('User found:', { id: user.id, email: user.email, role: user.role, hasPasswordHash: !!user.password_hash });

    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.log('Login failed: Password mismatch for email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Login successful for:', email);

    // Ensure ID is a string for JWT (handles MongoDB ObjectId)
    const userId = user.id && user.id.toString ? user.id.toString() : user.id;

    // Generate token
    const token = jwt.sign(
      { id: userId, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: userId, // Use string version for consistency
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
});

// Verify token
router.get('/verify', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await db.getAsync(
      'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;


