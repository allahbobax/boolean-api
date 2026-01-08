/**
 * Database migrations - run once during deployment, NOT on every request
 */
import { getDb } from './db';

export async function runMigrations() {
  const sql = getDb();
  
  console.log('Running database migrations...');
  
  try {
    // Ensure users table exists
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        subscription VARCHAR(50) DEFAULT 'free',
        subscription_end_date TIMESTAMP WITH TIME ZONE,
        registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_admin BOOLEAN DEFAULT false,
        is_banned BOOLEAN DEFAULT false,
        email_verified BOOLEAN DEFAULT false,
        verification_code VARCHAR(6),
        verification_code_expires TIMESTAMP WITH TIME ZONE,
        reset_code VARCHAR(6),
        reset_code_expires TIMESTAMP WITH TIME ZONE,
        settings JSONB DEFAULT '{}',
        avatar TEXT,
        hwid VARCHAR(255),
        failed_login_attempts INTEGER DEFAULT 0,
        account_locked_until TIMESTAMP WITH TIME ZONE,
        last_failed_login TIMESTAMP WITH TIME ZONE
      )
    `;

    // PERFORMANCE: Add indexes for faster lookups
    await sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_hwid ON users(hwid) WHERE hwid IS NOT NULL`;
    
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}
