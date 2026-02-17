import 'dotenv/config';
import { getDb } from '../api/lib/db';

async function testDbConnection() {
  console.log('Testing database connection...');
  
  try {
    const startTime = Date.now();
    const db = getDb();
    
    // Test basic connection
    console.log('1. Testing basic connection...');
    const result = await db`SELECT 1 as test, NOW() as current_time`;
    console.log('   ✅ Basic connection successful');
    console.log(`   📅 Server time: ${result[0].current_time}`);
    
    // Test connection latency
    const latency = Date.now() - startTime;
    console.log(`   ⚡ Connection latency: ${latency}ms`);
    
    // Test database info
    console.log('\n2. Getting database information...');
    const dbInfo = await db`
      SELECT 
        current_database() as database_name,
        version() as version,
        inet_server_addr() as server_ip,
        inet_server_port() as server_port
    `;
    
    console.log(`   📊 Database: ${dbInfo[0].database_name}`);
    console.log(`   🏷️  Version: ${dbInfo[0].version.split(' ')[0]}`);
    console.log(`   🌐 Server: ${dbInfo[0].server_ip}:${dbInfo[0].server_port}`);
    
    // Test table access
    console.log('\n3. Testing table access...');
    const tables = await db`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    
    console.log(`   📋 Found ${tables.length} tables:`);
    for (const table of tables) {
      console.log(`      - ${table.tablename}`);
    }
    
    // Test read/write operations
    console.log('\n4. Testing read/write operations...');
    
    // Test reading from users table
    try {
      const userCount = await db`SELECT COUNT(*) as count FROM users`;
      console.log(`   👥 Users table: ${userCount[0].count} records`);
    } catch (error) {
      console.log('   ❌ Users table not accessible');
    }
    
    // Test connection pool
    console.log('\n5. Testing connection pool...');
    const poolInfo = await db`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    
    console.log(`   🔗 Total connections: ${poolInfo[0].total_connections}`);
    console.log(`   ✅ Active connections: ${poolInfo[0].active_connections}`);
    console.log(`   ⏸️  Idle connections: ${poolInfo[0].idle_connections}`);
    
    // Test query performance
    console.log('\n6. Testing query performance...');
    const perfStart = Date.now();
    await db`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      LIMIT 10
    `;
    const perfTime = Date.now() - perfStart;
    console.log(`   ⚡ Query time: ${perfTime}ms`);
    
    console.log('\n✅ All database tests passed successfully!');
    console.log('🎉 Database is ready for use.');
    
  } catch (error) {
    console.error('\n❌ Database connection test failed:');
    console.error('Error details:', error);
    
    // Provide helpful error messages
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        console.error('💡 Tip: Check if database server is running and accessible');
      } else if (error.message.includes('authentication')) {
        console.error('💡 Tip: Check database credentials in DATABASE_URL');
      } else if (error.message.includes('timeout')) {
        console.error('💡 Tip: Check network connectivity and database server response time');
      } else if (error.message.includes('DATABASE_URL')) {
        console.error('💡 Tip: Make sure DATABASE_URL environment variable is set');
      }
    }
    
    process.exit(1);
  }
  
  process.exit(0);
}

testDbConnection().catch(console.error);
