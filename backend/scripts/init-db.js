const db = require('../database/db');
const bcrypt = require('bcrypt');

async function initDatabase() {
  console.log('Initializing database...');
  
  // Wait for database connection and table initialization
  // MongoDB needs more time to connect
  const waitTime = process.env.DATABASE_URL || process.env.MONGODB_URI ? 3000 : 2000;
  await new Promise(resolve => setTimeout(resolve, waitTime));

  // Create default admin user with proper password hash
  const adminPassword = 'admin123';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO users (id, email, password_hash, role)
       VALUES (1, 'admin@zipmetro.com', ?, 'admin')`,
      [passwordHash]
    );

    console.log('✅ Default admin user created:');
    console.log('   Email: admin@zipmetro.com');
    console.log('   Password: admin123');
    console.log('   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
    
    // Verify it was created
    const admin = await db.getAsync('SELECT * FROM users WHERE email = ?', ['admin@zipmetro.com']);
    if (admin) {
      const testValid = await bcrypt.compare('admin123', admin.password_hash);
      console.log('   ✅ Password verification test:', testValid ? 'PASSED' : 'FAILED');
    }
  } catch (err) {
    console.error('❌ Error creating admin user:', err);
  }

  // Seed initial products if database is empty
  try {
    const productCount = await db.getAsync('SELECT COUNT(*) as count FROM products');
    if (productCount.count === 0) {
      console.log('Seeding initial products...');
      const fs = require('fs');
      const path = require('path');
      const productsPath = path.join(__dirname, '../../../products.json');
      if (fs.existsSync(productsPath)) {
        const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
        for (const product of products) {
          await db.runAsync(
            `INSERT INTO products (name, category, desc, price, thc, image, stock)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [product.name, product.category, product.desc, product.price, product.thc, product.image, 10]
          );
        }
        console.log(`✅ Seeded ${products.length} products`);
      }
    }
  } catch (err) {
    console.error('Error seeding products:', err);
  }

  console.log('✅ Database initialization complete!');
  process.exit(0);
}

initDatabase().catch(err => {
  console.error('Error initializing database:', err);
  process.exit(1);
});