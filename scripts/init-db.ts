import 'dotenv/config';
import { 
  ensureUserSchema, 
  ensureKeysTable, 
  ensureLicenseKeysTable, 
  ensureIncidentsTables,
  ensureFriendshipsTable,
  ensureVersionsTable
} from '../api/lib/db';

async function initDb() {
  console.log('Initializing database schema...');
  
  console.log('Creating users table...');
  await ensureUserSchema();
  
  console.log('Creating keys table...');
  await ensureKeysTable();
  
  console.log('Creating license_keys table...');
  await ensureLicenseKeysTable();
  
  console.log('Creating incidents tables...');
  await ensureIncidentsTables();
  
  console.log('Creating friendships table...');
  await ensureFriendshipsTable();
  
  console.log('Creating versions table...');
  await ensureVersionsTable();
  
  console.log('Database initialization complete!');
  process.exit(0);
}

initDb().catch(console.error);
