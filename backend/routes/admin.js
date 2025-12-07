const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Get admin dashboard stats
router.get('/stats', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const todayOrders = await db.getAsync(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue, COALESCE(AVG(total), 0) as avg_basket
       FROM orders 
       WHERE DATE(created_at) = ?`,
      [today]
    );

    const weekOrders = await db.getAsync(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue, COALESCE(AVG(total), 0) as avg_basket
       FROM orders 
       WHERE DATE(created_at) >= ?`,
      [sevenDaysAgo]
    );

    const repeatCustomers = await db.getAsync(
      `SELECT COUNT(DISTINCT user_id) as repeat_count, COUNT(*) as total_orders
       FROM orders 
       WHERE user_id IS NOT NULL AND DATE(created_at) >= ?
       GROUP BY user_id
       HAVING COUNT(*) > 1`,
      [sevenDaysAgo]
    );

    res.json({
      today: {
        orders: todayOrders.count || 0,
        revenue: todayOrders.revenue || 0,
        avg_basket: todayOrders.avg_basket || 0
      },
      week: {
        orders: weekOrders.count || 0,
        revenue: weekOrders.revenue || 0,
        avg_basket: weekOrders.avg_basket || 0
      },
      repeat_customers: Array.isArray(repeatCustomers) ? repeatCustomers.length : 0
    });
  } catch (error) {
    next(error);
  }
});

// Get admin settings
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await db.allAsync('SELECT key, value FROM admin_settings');
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = s.value;
    });
    res.json(settingsObj);
  } catch (error) {
    next(error);
  }
});

// Update admin settings (e.g., homepage ad)
router.put('/settings', async (req, res, next) => {
  try {
    const { key, value } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Key is required' });
    }

    await db.runAsync(
      `INSERT INTO admin_settings (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
      [key, value, value]
    );

    res.json({ key, value });
  } catch (error) {
    next(error);
  }
});

// Get all orders (admin view)
router.get('/orders', async (req, res, next) => {
  try {
    const orders = await db.allAsync(
      `SELECT o.*, u.email 
       FROM orders o 
       LEFT JOIN users u ON o.user_id = u.id 
       ORDER BY o.created_at DESC 
       LIMIT 100`
    );

    for (let order of orders) {
      const items = await db.allAsync(
        `SELECT oi.*, p.name 
         FROM order_items oi 
         JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }

    res.json(orders);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


