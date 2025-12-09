const db = require('../database/db');
const bcrypt = require('bcrypt');

async function debugLogin() {
  try {
    console.log('🔍 Debugging login issue...\n');
    
    // Wait for database connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if admin user exists
    console.log('1. Checking if admin user exists...');
    let admin = await db.getAsync(
      'SELECT * FROM users WHERE email = ?',
      ['admin@zipmetro.com']
    );
    
    if (!admin) {
      console.log('   ❌ Admin user NOT found!');
      console.log('   Creating admin user now...');
      
      const passwordHash = await bcrypt.hash('admin123', 10);
      await db.runAsync(
        `INSERT OR REPLACE INTO users (id, email, password_hash, role)
         VALUES (1, 'admin@zipmetro.com', ?, 'admin')`,
        [passwordHash]
      );
      
      const newAdmin = await db.getAsync(
        'SELECT * FROM users WHERE email = ?',
        ['admin@zipmetro.com']
      );
      console.log('   ✅ Admin user created');
      admin = newAdmin;
    } else {
      console.log('   ✅ Admin user found');
      console.log('   - ID:', admin.id);
      console.log('   - Email:', admin.email);
      console.log('   - Role:', admin.role);
      console.log('   - Has password_hash:', !!admin.password_hash);
      console.log('   - Password hash length:', admin.password_hash?.length || 0);
    }
    
    // Test password verification
    console.log('\n2. Testing password verification...');
    const testPassword = 'admin123';
    const isValid = await bcrypt.compare(testPassword, admin.password_hash);
    console.log(`   Testing password: "${testPassword}"`);
    console.log(`   Result: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (!isValid) {
      console.log('\n   ⚠️  Password hash mismatch! Regenerating...');
      const newHash = await bcrypt.hash('admin123', 10);
      await db.runAsync(
        'UPDATE users SET password_hash = ? WHERE email = ?',
        [newHash, 'admin@zipmetro.com']
      );
      console.log('   ✅ Password hash updated');
      
      // Test again
      const updatedAdmin = await db.getAsync(
        'SELECT * FROM users WHERE email = ?',
        ['admin@zipmetro.com']
      );
      const testAgain = await bcrypt.compare('admin123', updatedAdmin.password_hash);
      console.log(`   Re-test: ${testAgain ? '✅ VALID' : '❌ INVALID'}`);
    }
    
    // Check database path
    console.log('\n3. Database information:');
    console.log('   Path:', process.env.DATABASE_PATH || './data/zipmetro.db');
    
    // List all users
    console.log('\n4. All users in database:');
    const allUsers = await db.allAsync('SELECT id, email, role FROM users');
    console.log('   Total users:', allUsers.length);
    allUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.role})`);
    });
    
    console.log('\n✅ Debug complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

debugLogin();

