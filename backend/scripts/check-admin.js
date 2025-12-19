const db = require('../database/db');
const bcrypt = require('bcrypt');

async function checkAdmin() {
  try {
    // Wait a bit for database to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const admin = await db.getAsync(
      'SELECT * FROM users WHERE email = ?',
      ['admin@zipmetro.com']
    );
    
    if (!admin) {
      console.log('❌ Admin user NOT found in database');
      console.log('Creating admin user...');
      
      const passwordHash = await bcrypt.hash('admin123', 10);
      await db.runAsync(
        `INSERT OR REPLACE INTO users (id, email, password_hash, role)
         VALUES (1, 'admin@zipmetro.com', ?, 'admin')`,
        [passwordHash]
      );
      console.log('✅ Admin user created');
    } else {
      console.log('✅ Admin user found:');
      console.log('   Email:', admin.email);
      console.log('   Role:', admin.role);
      console.log('   Password hash exists:', !!admin.password_hash);
      
      // Test password verification
      const testPassword = 'admin123';
      const isValid = await bcrypt.compare(testPassword, admin.password_hash);
      console.log('   Password "admin123" is valid:', isValid);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkAdmin();