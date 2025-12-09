const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function initMongoDB() {
  const mongoUrl = process.env.DATABASE_URL || process.env.MONGODB_URI;
  
  if (!mongoUrl) {
    console.error('❌ DATABASE_URL or MONGODB_URI not set in environment variables');
    console.error('   Please set DATABASE_URL in your .env file or environment variables');
    process.exit(1);
  }

  let client;
  try {
    console.log('🔌 Connecting to MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const usersCollection = db.collection('users');

    // Check if admin exists
    console.log('🔍 Checking for existing admin user...');
    const existingAdmin = await usersCollection.findOne({ email: 'admin@zipmetro.com' });
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists');
      // Update password to ensure it's correct
      const passwordHash = await bcrypt.hash('admin123', 10);
      await usersCollection.updateOne(
        { email: 'admin@zipmetro.com' },
        { $set: { password_hash: passwordHash, role: 'admin' } }
      );
      console.log('✅ Admin password updated');
    } else {
      console.log('📝 Creating admin user...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      await usersCollection.insertOne({
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
      console.log('✅ Admin user created');
    }

    // Verify
    const admin = await usersCollection.findOne({ email: 'admin@zipmetro.com' });
    if (admin) {
      const testValid = await bcrypt.compare('admin123', admin.password_hash);
      console.log('✅ Password verification test:', testValid ? 'PASSED' : 'FAILED');
      
      if (!testValid) {
        console.error('❌ Password verification failed! Regenerating hash...');
        const newHash = await bcrypt.hash('admin123', 10);
        await usersCollection.updateOne(
          { email: 'admin@zipmetro.com' },
          { $set: { password_hash: newHash } }
        );
        const retest = await bcrypt.compare('admin123', newHash);
        console.log('✅ Re-test after fix:', retest ? 'PASSED' : 'FAILED');
      }
    }

    // List all users
    const allUsers = await usersCollection.find({}).toArray();
    console.log(`\n📊 Total users in database: ${allUsers.length}`);
    allUsers.forEach(user => {
      console.log(`   - ${user.email} (${user.role || 'customer'})`);
    });

    console.log('\n✅ MongoDB initialization complete!');
    console.log('   Email: admin@zipmetro.com');
    console.log('   Password: admin123');
    console.log('   ⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('   Full error:', err);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 MongoDB connection closed');
    }
  }
}

initMongoDB();

