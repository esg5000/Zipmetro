const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// Get all products
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { category, search, active } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (name LIKE ? OR desc LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (active !== undefined) {
      sql += ' AND active = ?';
      params.push(active === 'true' ? 1 : 0);
    } else {
      sql += ' AND active = 1';
    }

    sql += ' ORDER BY created_at DESC';

    const products = await db.allAsync(sql, params);
    res.json(products);
  } catch (error) {
    next(error);
  }
});

// Get single product
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Create product (admin only)
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const user = req.user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, category, desc, price, thc, image, stock } = req.body;

    if (!name || !category || price === undefined) {
      return res.status(400).json({ error: 'Name, category, and price are required' });
    }

    const result = await db.runAsync(
      `INSERT INTO products (name, category, desc, price, thc, image, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, category, desc || '', price, thc || 0, image || '', stock || 0]
    );

    const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [result.lastID]);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

// Update product (admin only)
router.put('/:id', authenticateToken, async (req, res, next) => {
  try {
    const user = req.user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { name, category, desc, price, thc, image, stock, active } = req.body;

    const existing = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await db.runAsync(
      `UPDATE products 
       SET name = ?, category = ?, desc = ?, price = ?, thc = ?, image = ?, stock = ?, active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        name ?? existing.name,
        category ?? existing.category,
        desc !== undefined ? desc : existing.desc,
        price ?? existing.price,
        thc !== undefined ? thc : existing.thc,
        image !== undefined ? image : existing.image,
        stock !== undefined ? stock : existing.stock,
        active !== undefined ? (active ? 1 : 0) : existing.active,
        id
      ]
    );

    const product = await db.getAsync('SELECT * FROM products WHERE id = ?', [id]);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Delete product (admin only)
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const user = req.user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const result = await db.runAsync('DELETE FROM products WHERE id = ?', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;


