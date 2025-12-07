const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const bcrypt = require('bcrypt');

// Get user profile
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const user = await db.getAsync(
      'SELECT id, email, first_name, last_name, phone, dob, id_verified, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get notification preferences
    const notifPrefs = await db.getAsync(
      'SELECT sms, email, push FROM notification_preferences WHERE user_id = ?',
      [req.user.id]
    );

    user.notification_preferences = notifPrefs || { sms: true, email: true, push: false };

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/me', authenticateToken, async (req, res, next) => {
  try {
    const { first_name, last_name, phone, dob } = req.body;

    await db.runAsync(
      `UPDATE users 
       SET first_name = ?, last_name = ?, phone = ?, dob = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [first_name, last_name, phone, dob, req.user.id]
    );

    const user = await db.getAsync(
      'SELECT id, email, first_name, last_name, phone, dob, id_verified, role FROM users WHERE id = ?',
      [req.user.id]
    );

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Upload ID (simplified - in production, use proper file upload)
router.post('/me/id', authenticateToken, async (req, res, next) => {
  try {
    const { first_name, last_name, dob, id_type, id_image_path, consent } = req.body;

    if (!first_name || !last_name || !dob || !id_image_path || !consent) {
      return res.status(400).json({ error: 'All ID fields and consent are required' });
    }

    // In production, validate and store the ID image securely
    await db.runAsync(
      `UPDATE users 
       SET first_name = ?, last_name = ?, dob = ?, id_image_path = ?, id_verified = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [first_name, last_name, dob, id_image_path, req.user.id]
    );

    res.json({ message: 'ID submitted for verification' });
  } catch (error) {
    next(error);
  }
});

// Update notification preferences
router.put('/me/notifications', authenticateToken, async (req, res, next) => {
  try {
    const { sms, email, push } = req.body;

    const existing = await db.getAsync('SELECT id FROM notification_preferences WHERE user_id = ?', [req.user.id]);

    if (existing) {
      await db.runAsync(
        'UPDATE notification_preferences SET sms = ?, email = ?, push = ? WHERE user_id = ?',
        [sms ? 1 : 0, email ? 1 : 0, push ? 1 : 0, req.user.id]
      );
    } else {
      await db.runAsync(
        'INSERT INTO notification_preferences (user_id, sms, email, push) VALUES (?, ?, ?, ?)',
        [req.user.id, sms ? 1 : 0, email ? 1 : 0, push ? 1 : 0]
      );
    }

    const prefs = await db.getAsync(
      'SELECT sms, email, push FROM notification_preferences WHERE user_id = ?',
      [req.user.id]
    );

    res.json(prefs);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


