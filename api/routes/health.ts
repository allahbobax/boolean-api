import { Router, Request, Response } from 'express';
import { getDb, ensureKeysTable } from '../lib/db.js';

const router = Router();

router.get('/site', async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const response = await fetch('https://booleanclient.ru', { method: 'GET', signal: AbortSignal.timeout(10000) });
    const responseTime = Date.now() - start;
    return res.json({ status: response.ok ? 'ok' : 'error', statusCode: response.status, responseTime, timestamp: new Date().toISOString() });
  } catch (error) {
    const responseTime = Date.now() - start;
    return res.json({ status: 'error', statusCode: 0, responseTime, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const sql = getDb();
    await ensureKeysTable();
    
    const [usersResult, activeSubsResult, keysResult, incidentsResult] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM users`,
      sql`SELECT COUNT(*) as count FROM users WHERE subscription_end_date > NOW()`,
      sql`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE used = false) as available FROM keys`,
      sql`SELECT COUNT(*) as count FROM incidents WHERE status != 'resolved'`
    ]);

    const stats = {
      users: { total: parseInt(usersResult[0]?.count || '0'), activeSubscriptions: parseInt(activeSubsResult[0]?.count || '0') },
      keys: { total: parseInt(keysResult[0]?.total || '0'), available: parseInt(keysResult[0]?.available || '0') },
      incidents: { active: parseInt(incidentsResult[0]?.count || '0') }
    };

    return res.json({ status: 'ok', timestamp: new Date().toISOString(), stats });
  } catch (error) {
    console.error('Health check error:', error);
    return res.json({ status: 'degraded', timestamp: new Date().toISOString(), error: 'Database connection issue' });
  }
});

export default router;
