const path = require('path');
const fs = require('fs');

// Check if MongoDB should be used
const USE_MONGODB = !!(process.env.DATABASE_URL || process.env.MONGODB_URI);
const MONGO_URL = process.env.DATABASE_URL || process.env.MONGODB_URI;

let db;

if (USE_MONGODB) {
  // MongoDB implementation
  const { MongoClient } = require('mongodb');
  let mongoClient;
  let mongoDb;
  let isConnecting = false;
  let connectionPromise = null;

  // Helper function to ensure MongoDB connection
  async function ensureConnection() {
    // If already connected, return
    if (mongoDb && mongoClient && mongoClient.topology && mongoClient.topology.isConnected()) {
      return;
    }

    // If already connecting, wait for that promise
    if (isConnecting && connectionPromise) {
      await connectionPromise;
      return;
    }

    // Start new connection
    isConnecting = true;
    connectionPromise = (async () => {
      try {
        console.log('🔌 Connecting to MongoDB...');
        
        // Close existing client if any
        if (mongoClient) {
          try {
            await mongoClient.close();
          } catch (e) {
            // Ignore close errors
          }
        }

        mongoClient = new MongoClient(MONGO_URL, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
        });
        
        await mongoClient.connect();
        mongoDb = mongoClient.db();
        console.log('✅ Connected to MongoDB');
        
        // Initialize collections and indexes
        await initializeMongoDB();
        isConnecting = false;
      } catch (err) {
        isConnecting = false;
        console.error('❌ MongoDB connection error:', err.message);
        console.error('   Server will continue but database operations may fail');
        console.error('   Please check your DATABASE_URL and MongoDB connection');
        throw err;
      }
    })();

    await connectionPromise;
  }

  // Initialize MongoDB connection (non-blocking)
  (async () => {
    try {
      await ensureConnection();
    } catch (err) {
      // Connection failed, but don't crash - will retry on first use
      console.log('⚠️  MongoDB initial connection failed, will retry on first database operation');
    }
  })();

  async function initializeMongoDB() {
    try {
      // Create indexes (ignore errors if they already exist)
      await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {});
      await mongoDb.collection('products').createIndex({ category: 1 }).catch(() => {});
      await mongoDb.collection('orders').createIndex({ user_id: 1 }).catch(() => {});
      await mongoDb.collection('order_items').createIndex({ order_id: 1 }).catch(() => {});
      console.log('✅ MongoDB collections initialized');
    } catch (err) {
      console.error('⚠️  Error initializing MongoDB indexes:', err.message);
    }
  }

  // Helper to get collection name from SQL table name
  function getCollectionName(sql) {
    const tableMatch = sql.match(/FROM\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)/i);
    if (tableMatch) {
      return tableMatch[1] || tableMatch[2] || tableMatch[3];
    }
    return null;
  }

  // Convert SQL WHERE clause to MongoDB query
  function sqlToMongoQuery(sql, params) {
    const query = {};
    let paramIndex = 0;

    // Handle WHERE clauses
    if (sql.includes('WHERE')) {
      const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
      if (whereMatch) {
        let whereClause = whereMatch[1];
        
        // Handle 1=1 (always true, used for building queries)
        whereClause = whereClause.replace(/1\s*=\s*1\s*AND\s*/gi, '');
        
        // Parse conditions
        const conditions = whereClause.split(/\s+AND\s+/i);
        
        conditions.forEach(condition => {
          condition = condition.trim();
          
          // Handle field = ?
          const eqMatch = condition.match(/(\w+)\s*=\s*\?/);
          if (eqMatch) {
            const field = eqMatch[1];
            const value = params[paramIndex++];
            
            if (field === 'id') {
              query._id = parseInt(value) || value;
            } else if (field === 'active') {
              query.active = value === 1 || value === true || value === '1';
            } else {
              query[field] = value;
            }
            return;
          }
          
          // Handle LIKE patterns
          const likeMatch = condition.match(/(\w+)\s+LIKE\s+\?/);
          if (likeMatch) {
            const field = likeMatch[1];
            const pattern = params[paramIndex++];
            if (pattern) {
              const regexPattern = pattern.replace(/%/g, '.*').replace(/_/g, '.');
              query[field] = { $regex: regexPattern, $options: 'i' };
            }
            return;
          }
          
          // Handle (name LIKE ? OR desc LIKE ?)
          const orLikeMatch = condition.match(/\((\w+)\s+LIKE\s+\?\s+OR\s+(\w+)\s+LIKE\s+\?\)/);
          if (orLikeMatch) {
            const field1 = orLikeMatch[1];
            const field2 = orLikeMatch[2];
            const pattern1 = params[paramIndex++];
            const pattern2 = params[paramIndex++];
            const regex1 = pattern1 ? pattern1.replace(/%/g, '.*').replace(/_/g, '.') : '';
            const regex2 = pattern2 ? pattern2.replace(/%/g, '.*').replace(/_/g, '.') : '';
            
            query.$or = [
              { [field1]: { $regex: regex1, $options: 'i' } },
              { [field2]: { $regex: regex2, $options: 'i' } }
            ];
            return;
          }
        });
      }
    }

    return query;
  }

  // Convert SQL SELECT to MongoDB find
  db = {
    async getAsync(sql, params = []) {
      // Ensure connection before use
      await ensureConnection();

      // Handle COUNT queries
      if (sql.toUpperCase().includes('SELECT COUNT(*)')) {
        const collectionName = getCollectionName(sql);
        if (!collectionName) throw new Error('Could not determine collection from SQL');
        
        const query = sqlToMongoQuery(sql, params);
        const count = await mongoDb.collection(collectionName).countDocuments(query);
        return { count };
      }

      const collectionName = getCollectionName(sql);
      if (!collectionName) throw new Error('Could not determine collection from SQL');

      const query = sqlToMongoQuery(sql, params);
      const doc = await mongoDb.collection(collectionName).findOne(query);
      
      // Convert _id to id for compatibility
      if (doc && doc._id) {
        doc.id = doc._id;
        delete doc._id;
      }
      
      return doc || null;
    },

    async allAsync(sql, params = []) {
      // Ensure connection before use
      await ensureConnection();

      const collectionName = getCollectionName(sql);
      if (!collectionName) throw new Error('Could not determine collection from SQL');

      const query = sqlToMongoQuery(sql, params);
      let cursor = mongoDb.collection(collectionName).find(query);

      // Handle ORDER BY
      if (sql.includes('ORDER BY')) {
        const orderMatch = sql.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)?/i);
        if (orderMatch) {
          const field = orderMatch[1];
          const direction = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
          cursor = cursor.sort({ [field]: direction });
        }
      }

      const docs = await cursor.toArray();
      
      // Convert _id to id for compatibility
      return docs.map(doc => {
        if (doc._id) {
          doc.id = doc._id;
          delete doc._id;
        }
        return doc;
      });
    },

    async runAsync(sql, params = []) {
      // Ensure connection before use
      await ensureConnection();

      const collectionName = getCollectionName(sql);
      if (!collectionName) throw new Error('Could not determine collection from SQL');

      // INSERT
      if (sql.toUpperCase().startsWith('INSERT')) {
        const fieldsMatch = sql.match(/INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\((.+?)\)/i);
        if (!fieldsMatch) throw new Error('Could not parse INSERT fields');
        
        const fields = fieldsMatch[1].split(',').map(f => f.trim());
        const doc = {};
        
        fields.forEach((field, index) => {
          if (params[index] !== undefined) {
            // Convert id to _id for MongoDB
            if (field === 'id') {
              doc._id = params[index];
            } else {
              doc[field] = params[index];
            }
          }
        });

        // Add timestamps if not provided
        if (!doc.created_at) doc.created_at = new Date();
        if (!doc.updated_at) doc.updated_at = new Date();

        // Handle INSERT OR REPLACE
        if (sql.toUpperCase().includes('INSERT OR REPLACE')) {
          const result = await mongoDb.collection(collectionName).replaceOne(
            { _id: doc._id },
            doc,
            { upsert: true }
          );
          return { lastID: doc._id || result.upsertedId, changes: result.modifiedCount || 1 };
        } else {
          const result = await mongoDb.collection(collectionName).insertOne(doc);
          return { lastID: result.insertedId, changes: 1 };
        }
      }

      // UPDATE
      if (sql.toUpperCase().startsWith('UPDATE')) {
        const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
        if (!setMatch) throw new Error('Could not parse UPDATE SET clause');
        
        const query = sqlToMongoQuery(sql, params);
        const setClause = setMatch[1];
        const updates = {};
        
        // Parse SET fields - handle both single and multiple fields
        const setFields = setClause.split(',').map(f => f.trim());
        let paramOffset = 0;
        
        // Count WHERE params to know where SET params start
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
        if (whereMatch) {
          const whereClause = whereMatch[1];
          // Count ? in WHERE clause
          paramOffset = (whereClause.match(/\?/g) || []).length;
        }
        
        setFields.forEach((field, index) => {
          const fieldMatch = field.match(/(\w+)\s*=\s*\?/);
          if (fieldMatch) {
            const fieldName = fieldMatch[1];
            const value = params[paramOffset + index];
            if (fieldName === 'id') {
              updates._id = value;
            } else {
              updates[fieldName] = value;
            }
          }
        });

        updates.updated_at = new Date();
        const result = await mongoDb.collection(collectionName).updateOne(query, { $set: updates });
        return { lastID: null, changes: result.modifiedCount };
      }

      // DELETE
      if (sql.toUpperCase().startsWith('DELETE')) {
        const query = sqlToMongoQuery(sql, params);
        const result = await mongoDb.collection(collectionName).deleteOne(query);
        return { lastID: null, changes: result.deletedCount };
      }

      throw new Error('Unsupported SQL operation for MongoDB');
    }
  };

} else {
  // SQLite implementation (original)
  const sqlite3 = require('sqlite3').verbose();
  const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../data/zipmetro.db');

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
    } else {
      console.log('✅ Connected to SQLite database');
      initializeDatabase();
    }
  });

  function initializeDatabase() {
    // Products table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        desc TEXT,
        price REAL NOT NULL,
        thc INTEGER DEFAULT 0,
        image TEXT,
        stock INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        phone TEXT,
        dob DATE,
        id_verified BOOLEAN DEFAULT 0,
        id_image_path TEXT,
        role TEXT DEFAULT 'customer',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Orders table
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        delivery_window TEXT,
        order_notes TEXT,
        status TEXT DEFAULT 'pending',
        total REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Order items table
    db.run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    // Notifications preferences table
    db.run(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        sms BOOLEAN DEFAULT 1,
        email BOOLEAN DEFAULT 1,
        push BOOLEAN DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Admin settings table
    db.run(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized');
  }

  // Promisify database methods
  db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  db.getAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  db.allAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };
}

module.exports = db;
