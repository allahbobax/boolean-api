import 'dotenv/config';
import { getDb } from '../api/lib/db';

async function checkDbSize() {
  console.log('Checking database size...');
  
  try {
    const db = getDb();
    
    // Get total database size
    const dbSize = await db`
      SELECT pg_database_size(current_database()) as total_size_bytes,
             pg_size_pretty(pg_database_size(current_database())) as total_size_readable
    `;
    
    console.log('=== Database Size ===');
    console.log(`Total size: ${dbSize[0].total_size_readable} (${dbSize[0].total_size_bytes} bytes)`);
    
    // Get size of each table
    const tableSizes = await db`
      SELECT 
        t.tablename,
        pg_size_pretty(pg_total_relation_size('public.' || t.tablename)) as size,
        pg_total_relation_size('public.' || t.tablename) as size_bytes
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      ORDER BY pg_total_relation_size('public.' || t.tablename) DESC
    `;
    
    console.log('\n=== Table Sizes ===');
    let totalTableSize = 0;
    for (const table of tableSizes) {
      console.log(`${table.tablename}: ${table.size} (${table.size_bytes} bytes)`);
      totalTableSize += Number(table.size_bytes);
    }
    
    console.log(`\nTotal tables size: ${pg_size_pretty(totalTableSize)} (${totalTableSize} bytes)`);
    
    // Get row counts for each table
    const rowCounts = await db`
      SELECT 
        t.tablename,
        COALESCE(s.n_live_tup, 0) as live_rows,
        COALESCE(s.n_dead_tup, 0) as dead_rows,
        COALESCE(s.n_tup_ins, 0) as total_inserts,
        COALESCE(s.n_tup_upd, 0) as total_updates,
        COALESCE(s.n_tup_del, 0) as total_deletes
      FROM pg_tables t
      LEFT JOIN pg_stat_user_tables s ON s.schemaname = t.schemaname AND s.relname = t.tablename
      WHERE t.schemaname = 'public'
      ORDER BY COALESCE(s.n_live_tup, 0) DESC
    `;
    
    console.log('\n=== Row Statistics ===');
    for (const table of rowCounts) {
      console.log(`${table.tablename}:`);
      console.log(`  Live rows: ${table.live_rows}`);
      console.log(`  Dead rows: ${table.dead_rows}`);
      console.log(`  Total inserts: ${table.total_inserts}`);
      console.log(`  Total updates: ${table.total_updates}`);
      console.log(`  Total deletes: ${table.total_deletes}`);
      console.log('');
    }
    
    // Get connection info
    const connections = await db`
      SELECT count(*) as active_connections
      FROM pg_stat_activity 
      WHERE state = 'active'
    `;
    
    console.log(`Active database connections: ${connections[0].active_connections}`);
    
  } catch (error) {
    console.error('Error checking database size:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Helper function for pretty formatting
function pg_size_pretty(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

checkDbSize().catch(console.error);
