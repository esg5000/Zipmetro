const path = require('path');
const fs = require('fs');

// Check if MongoDB should be used (only for determining implementation, not for connection)
const USE_MONGODB = !!(process.env.DATABASE_URL || process.env.MONGODB_URI);

let db;
let initMongo; // Will be assigned conditionally

if (USE_MONGODB) {
  // MongoDB implementation
  const { MongoClient, ObjectId } = require('mongodb');
  const bcrypt = require('bcrypt');
  let mongoClient = null;
  let mongoDb = null;
  let isConnecting = false;
  let connectionPromise = null;

  // Track if admin has been ensured (to avoid running multiple times)
  let adminEnsured = false;

  // Helper function to ensure MongoDB connection (lazy - only if already initialized)
  async function ensureConnection() {
    // If already connected, return
    if (mongoDb && mongoClient && mongoClient.topology && mongoClient.topology.isConnected()) {
      // If admin hasn't been ensured yet, do it now
      if (!adminEnsured) {
        try {
          await ensureAdmin(mongoDb);
          adminEnsured = true;
        } catch (err) {
          console.error('⚠️  Error ensuring admin on existing connection:', err.message);
        }
      }
      return;
    }

    // If not initialized, throw error - initMongo() must be called first
    if (!mongoClient) {
      throw new Error('MongoDB not initialized. Call initMongo() first.');
    }

    // If already connecting, wait for that promise
    if (isConnecting && connectionPromise) {
      await connectionPromise;
      return;
    }
  }

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

  // Initialize MongoDB connection - must be called explicitly at runtime
  initMongo = async function initMongo() {
    const MONGO_URL = process.env.DATABASE_URL || process.env.MONGODB_URI || process.env.MONGO_URL;
    
    // Check if MONGO_URL is set
    if (!MONGO_URL) {
      console.warn('⚠️  MONGO_URL not set, skipping Mongo init');
      return null;
    }

    // If already connected, return existing client
    if (mongoClient && mongoDb && mongoClient.topology && mongoClient.topology.isConnected()) {
      return mongoClient;
    }

    // If already connecting, wait for that promise
    if (isConnecting && connectionPromise) {
      await connectionPromise;
      return mongoClient;
    }

    // Start new connection with retry logic
    isConnecting = true;
    connectionPromise = (async () => {
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          console.log(`🔄 Attempting MongoDB connection (attempt ${retries + 1}/${maxRetries})...`);
          
          // Close existing client if any
          if (mongoClient) {
            try {
              await mongoClient.close();
            } catch (e) {
              // Ignore close errors
            }
          }

          // MongoDB connection options optimized for Render.com
          // MongoDB Atlas (mongodb+srv://) handles TLS automatically - don't override!
          const isAtlasConnection = MONGO_URL.startsWith('mongodb+srv://');
          const urlHasTls = MONGO_URL.includes('tls=true') || MONGO_URL.includes('ssl=true');
          
          const mongoOptions = {
            serverSelectionTimeoutMS: 30000, // 30 seconds for Render.com network latency
            connectTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            retryWrites: true,
            retryReads: true,
            // Connection pool settings
            maxPoolSize: 10,
            minPoolSize: 1,
          };
          
          // Only add TLS options for non-Atlas connections that don't already have TLS
          // MongoDB Atlas automatically handles TLS - adding our own causes conflicts!
          if (!isAtlasConnection && !urlHasTls) {
            // For non-Atlas connections without TLS in URL, add TLS if needed
            mongoOptions.tls = true;
            mongoOptions.tlsAllowInvalidCertificates = false;
            mongoOptions.tlsAllowInvalidHostnames = false;
          }
          // For Atlas connections or connections with TLS in URL, let MongoDB handle TLS
          
          console.log(`🔗 MongoDB connection type: ${isAtlasConnection ? 'Atlas (mongodb+srv://)' : 'Standard (mongodb://)'}`);
          console.log('🔌 Connecting to MongoDB...');
          
          mongoClient = new MongoClient(MONGO_URL, mongoOptions);
          
          await mongoClient.connect();
          mongoDb = mongoClient.db();
          console.log('✅ Connected to MongoDB');
          
          // Initialize collections and indexes
          await initializeMongoDB();
          
          // Ensure admin user exists (only once)
          if (!adminEnsured) {
            await ensureAdmin(mongoDb);
            adminEnsured = true;
          }
          
          isConnecting = false;
          console.log('✅ MongoDB connection established on startup');
          return mongoClient;
        } catch (err) {
          retries++;
          console.error('❌ MongoDB connection error:', err.message);
          
          // More detailed error logging for debugging on Render.com
          if (err.message.includes('SSL') || err.message.includes('TLS') || err.message.includes('tlsv1')) {
            console.error('   SSL/TLS error detected - this is often caused by:');
            console.error('   1. MongoDB connection string format issues');
            console.error('   2. TLS settings conflict (connection string vs code settings)');
            console.error('   3. Network/firewall blocking TLS handshake');
            console.error('   Try: Check your DATABASE_URL format and ensure it matches your MongoDB provider');
          } else if (err.message.includes('timeout')) {
            console.error('   Connection timeout - check network connectivity and MongoDB URL');
          } else if (err.message.includes('authentication')) {
            console.error('   Authentication failed - check MongoDB username/password');
          }
          
          if (retries < maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, retries), 10000); // Exponential backoff, max 10s
            console.log(`⚠️  MongoDB connection attempt ${retries} failed, retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.log('⚠️  MongoDB initial connection failed after all retries');
            console.log('   Server will continue but database operations may fail');
            isConnecting = false;
            // Don't throw - allow server to continue
            return null;
          }
        }
      }
      
      return mongoClient;
    })();

    await connectionPromise;
    return mongoClient;
  };

  // Ensure admin user exists in MongoDB
  async function ensureAdmin(db) {
    try {
      const usersCollection = db.collection('users');
      
      console.log('🔍 Checking for admin user...');
      
      // Check if admin user exists
      const existingAdmin = await usersCollection.findOne({ email: 'admin@zipmetro.com' });
      
      if (!existingAdmin) {
        // Admin doesn't exist, create it
        console.log('📝 Creating admin user in MongoDB...');
        const passwordHash = await bcrypt.hash('admin123', 10);
        
        const insertResult = await usersCollection.insertOne({
          email: 'admin@zipmetro.com',
          password_hash: passwordHash,
          role: 'admin',
          first_name: '',
          last_name: '',
          phone: '',
          id_verified: false,
          created_at: new Date(),
          updated_at: new Date()
        });
        
        console.log('✅ Admin user created:');
        console.log('   Email: admin@zipmetro.com');
        console.log('   Password: admin123');
        console.log('   MongoDB _id:', insertResult.insertedId);
        console.log('   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
        
        // Verify it was created and can be found
        const verifyAdmin = await usersCollection.findOne({ email: 'admin@zipmetro.com' });
        if (verifyAdmin) {
          console.log('✅ Admin user verified in database');
          const testValid = await bcrypt.compare('admin123', verifyAdmin.password_hash);
          console.log('✅ Password hash test:', testValid ? 'PASSED' : 'FAILED');
        } else {
          console.error('❌ ERROR: Admin user was created but cannot be found!');
        }
      } else {
        // Admin exists, verify password is correct
        console.log('✅ Admin user already exists');
        console.log('   MongoDB _id:', existingAdmin._id);
        console.log('   Email:', existingAdmin.email);
        console.log('   Role:', existingAdmin.role || 'customer');
        console.log('   Has password_hash:', !!existingAdmin.password_hash);
        
        // Ensure role is set to admin
        if (existingAdmin.role !== 'admin') {
          console.log('⚠️  Admin user role is not "admin", updating...');
          await usersCollection.updateOne(
            { email: 'admin@zipmetro.com' },
            { $set: { role: 'admin', updated_at: new Date() } }
          );
          console.log('✅ Admin role updated');
        }
        
        const testValid = await bcrypt.compare('admin123', existingAdmin.password_hash);
        if (!testValid) {
          // Password hash might be wrong, update it
          console.log('⚠️  Admin password hash mismatch, updating...');
          const passwordHash = await bcrypt.hash('admin123', 10);
          await usersCollection.updateOne(
            { email: 'admin@zipmetro.com' },
            { $set: { password_hash: passwordHash, role: 'admin', updated_at: new Date() } }
          );
          console.log('✅ Admin password updated');
          
          // Verify the update
          const updatedAdmin = await usersCollection.findOne({ email: 'admin@zipmetro.com' });
          const retest = await bcrypt.compare('admin123', updatedAdmin.password_hash);
          console.log('✅ Password hash re-test:', retest ? 'PASSED' : 'FAILED');
        } else {
          console.log('✅ Admin password hash is valid');
        }
      }
    } catch (err) {
      console.error('❌ Error ensuring admin user:', err.message);
      if (process.env.NODE_ENV !== 'production') {
        console.error('   Stack:', err.stack);
      }
      // Don't throw - allow server to continue, but log the error
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
              // Handle MongoDB ObjectId - convert string to ObjectId if needed
              if (typeof value === 'string' && ObjectId.isValid(value)) {
                query._id = new ObjectId(value);
              } else if (value && value.toString) {
                // If it's already an ObjectId or has toString method
                query._id = value;
              } else {
                // Fallback for numeric IDs (SQLite)
                query._id = parseInt(value) || value;
              }
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
        role TEXT DEFAULT 'user',
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

// Export db and initMongo function
module.exports = db;
if (initMongo) {
  module.exports.initMongo = initMongo;
} else {
  // For SQLite, initMongo is a no-op
  module.exports.initMongo = async function initMongo() {
    // No-op for SQLite
    return null;
  };
}
