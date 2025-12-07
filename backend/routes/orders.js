const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Get all orders (authenticated users see their own, admins see all)
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const user = req.user;
    let sql = 'SELECT o.*, u.email FROM orders o LEFT JOIN users u ON o.user_id = u.id';
    const params = [];

    if (user.role !== 'admin') {
      sql += ' WHERE o.user_id = ?';
      params.push(user.id);
    }

    sql += ' ORDER BY o.created_at DESC';

    const orders = await db.allAsync(sql, params);

    // Get order items for each order
    for (let order of orders) {
      const items = await db.allAsync(
        `SELECT oi.*, p.name, p.image 
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

// Get single order
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const user = req.user;
    const { id } = req.params;

    let sql = 'SELECT o.*, u.email FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?';
    const params = [id];

    if (user.role !== 'admin') {
      sql += ' AND o.user_id = ?';
      params.push(user.id);
    }

    const order = await db.getAsync(sql, params);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await db.allAsync(
      `SELECT oi.*, p.name, p.image 
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id 
       WHERE oi.order_id = ?`,
      [id]
    );
    order.items = items;

    res.json(order);
  } catch (error) {
    next(error);
  }
});

// Create order
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { customer_name, customer_phone, delivery_address, delivery_window, order_notes, items, age_confirmed } = req.body;

    if (!customer_name || !customer_phone || !delivery_address || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!age_confirmed) {
      return res.status(400).json({ error: 'Age confirmation required' });
    }

    // Calculate total
    let total = 0;
    for (const item of items) {
      const product = await db.getAsync('SELECT price FROM products WHERE id = ? AND active = 1', [item.product_id]);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.product_id} not found` });
      }
      total += product.price * item.quantity;
    }

    // Create order
    const orderResult = await db.runAsync(
      `INSERT INTO orders (user_id, customer_name, customer_phone, delivery_address, delivery_window, order_notes, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        req.user?.id || null,
        customer_name,
        customer_phone,
        delivery_address,
        delivery_window || 'ASAP',
        order_notes || '',
        total
      ]
    );

    // Create order items
    for (const item of items) {
      const product = await db.getAsync('SELECT price FROM products WHERE id = ?', [item.product_id]);
      await db.runAsync(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderResult.lastID, item.product_id, item.quantity, product.price]
      );
    }

    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', [orderResult.lastID]);
    const orderItems = await db.allAsync(
      `SELECT oi.*, p.name, p.image 
       FROM order_items oi 
       JOIN products p ON oi.product_id = p.id 
       WHERE oi.order_id = ?`,
      [orderResult.lastID]
    );
    order.items = orderItems;

    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

// Update order status (admin only)
router.patch('/:id/status', authenticateToken, async (req, res, next) => {
  try {
    const user = req.user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await db.runAsync(
      'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', [id]);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


