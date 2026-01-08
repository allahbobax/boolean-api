import postgres from 'postgres';

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not configured');
    }
    sql = postgres(url, {
      ssl: 'require',
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,  // Disable prepared statements for serverless (reduces cold start)
    });
  }
  return sql;
}

// Warm up connection pool - call this early in request lifecycle
export async function warmupDb() {
  try {
    const db = getDb();
    await db`SELECT 1`;
  } catch {
    // Ignore warmup errors
  }
}

export async function ensureUserSchema() {
  const db = getDb();
  try {
    await db`
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
        hwid VARCHAR(255)
      )
    `;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(6)`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_expires TIMESTAMP WITH TIME ZONE`;
    
    // БЕЗОПАСНОСТЬ: Добавляем поля для защиты от брутфорса
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMP WITH TIME ZONE`;
    await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_failed_login TIMESTAMP WITH TIME ZONE`;
  } catch (error) {
    console.error('Ensure user schema error:', error);
  }
}

export async function ensureKeysTable() {
  const db = getDb();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        used BOOLEAN DEFAULT false,
        used_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Ensure keys table error:', error);
  }
}

export async function ensureLicenseKeysTable() {
  const db = getDb();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS license_keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        product VARCHAR(100) NOT NULL,
        duration_days INTEGER DEFAULT 30,
        is_used BOOLEAN DEFAULT false,
        used_by INTEGER REFERENCES users(id),
        used_at TIMESTAMP WITH TIME ZONE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Ensure license_keys table error:', error);
  }
}

export async function ensureIncidentsTables() {
  const db = getDb();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS incidents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'investigating',
        severity VARCHAR(50) DEFAULT 'minor',
        affected_services TEXT[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        resolved_at TIMESTAMP WITH TIME ZONE
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS incident_updates (
        id SERIAL PRIMARY KEY,
        incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
  } catch (error) {
    console.error('Ensure incidents tables error:', error);
  }
}

export async function ensureFriendshipsTable() {
  const db = getDb();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, friend_id)
      )
    `;
  } catch (error) {
    console.error('Ensure friendships table error:', error);
  }
}

export async function ensureVersionsTable() {
  const db = getDb();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS client_versions (
        id SERIAL PRIMARY KEY,
        version VARCHAR(50) NOT NULL,
        download_url TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } catch (error) {
    console.error('Ensure client_versions table error:', error);
  }
}
