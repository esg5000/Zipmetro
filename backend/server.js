const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();

// Import routes
const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');
const authRouter = require('./routes/auth');
const uploadRouter = require('./routes/upload');

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
// CORS configuration for Render.com
app.use(cors({
  origin: process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Ensure index.html is always served fresh (no cache) - must be before API routes
app.get('/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// API Routes - must come before static file serving
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);

// Serve static files (frontend and assets) with proper cache headers
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: '1d', // Cache for 1 day
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Don't cache HTML files - always serve fresh
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
app.use('/assets', express.static(path.join(__dirname, '../assets'), {
  maxAge: '7d', // Cache assets longer
  etag: true,
  lastModified: true
}));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve index.html for all non-API routes (SPA fallback)
app.get('*', (req, res, next) => {
  // Skip API routes and health check - let them fall through to 404
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return next();
  }
  // Always serve fresh HTML - no cache
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Serve index.html for SPA routing
  res.sendFile(path.join(__dirname, '../frontend/index.html'), (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      next(err);
    }
  });
});

// 404 handler for unmatched routes
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found', path: req.path });
  } else {
    res.status(404).json({ error: 'Route not found', path: req.path });
  }
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    path: req.path,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Initialize database connection before starting server
const db = require('./database/db');

// Wait for database to be ready (especially for MongoDB on Render.com)
async function startServer() {
  try {
    // Give database a moment to connect (non-blocking)
    // The database will retry connections automatically
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const PORT = process.env.PORT || 3001;
    
    app.listen(PORT, () => {
      console.log(`🚀 ZipMetro server running on port ${PORT}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Frontend: http://localhost:${PORT}`);
      console.log(`🔌 API: http://localhost:${PORT}/api`);
      
      // Log database status
      if (process.env.DATABASE_URL || process.env.MONGODB_URI) {
        console.log(`💾 Using MongoDB: ${process.env.DATABASE_URL ? 'DATABASE_URL set' : 'MONGODB_URI set'}`);
      } else {
        console.log(`💾 Using SQLite: ${process.env.DATABASE_PATH || './data/zipmetro.db'}`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;
