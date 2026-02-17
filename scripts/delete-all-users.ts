import 'dotenv/config';
import { getDb } from '../api/lib/db';

async function deleteAllUsers() {
  console.log('⚠️  WARNING: This will delete ALL users from the database!');
  console.log('This action is irreversible.');
  console.log('');
  
  // Ask for confirmation
  console.log('Type "DELETE_ALL_USERS" to confirm:');
  
  // For safety, require explicit confirmation
  const confirmation = process.argv[2];
  
  if (confirmation !== 'DELETE_ALL_USERS') {
    console.log('❌ Operation cancelled. Confirmation not provided.');
    console.log('Usage: npm run script:delete-users DELETE_ALL_USERS');
    process.exit(1);
  }
  
  try {
    const db = getDb();
    
    // Get user count before deletion
    const userCount = await db`SELECT COUNT(*) as count FROM users`;
    console.log(`Found ${userCount[0].count} users in the database.`);
    
    if (userCount[0].count === 0) {
      console.log('No users to delete.');
      process.exit(0);
    }
    
    console.log('Deleting all users...');
    
    // Use individual queries instead of transaction for simplicity
    console.log('  - Deleting friendships...');
    await db`DELETE FROM friendships`;
    
    console.log('  - Deleting incident updates...');
    await db`DELETE FROM incident_updates`;
    
    console.log('  - Deleting incidents...');
    await db`DELETE FROM incidents`;
    
    console.log('  - Deleting license keys...');
    await db`DELETE FROM license_keys`;
    
    console.log('  - Deleting used keys...');
    await db`DELETE FROM keys WHERE used_by IS NOT NULL`;
    
    console.log('  - Deleting users...');
    const result = await db`DELETE FROM users`;
    
    console.log(`✅ Successfully deleted ${result.count} users and all related data.`);
    
    // Verify deletion
    const remainingUsers = await db`SELECT COUNT(*) as count FROM users`;
    console.log(`Remaining users: ${remainingUsers[0].count}`);
    
    // Check other tables
    const friendships = await db`SELECT COUNT(*) as count FROM friendships`;
    const incidents = await db`SELECT COUNT(*) as count FROM incidents`;
    const licenseKeys = await db`SELECT COUNT(*) as count FROM license_keys`;
    
    console.log(`Remaining friendships: ${friendships[0].count}`);
    console.log(`Remaining incidents: ${incidents[0].count}`);
    console.log(`Remaining license keys: ${licenseKeys[0].count}`);
    
    console.log('\n✅ All users and related data have been successfully deleted.');
    
  } catch (error) {
    console.error('❌ Error deleting users:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

deleteAllUsers().catch(console.error);
