import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';

const router = Router();

// Cache for external service checks (site/launcher change rarely)
let externalCache: {
  site: { status: string; statusCode: number; responseTime: number; timestamp: number } | null;
} = { site: null };

const EXTERNAL_CACHE_TTL = 60000; // 60 seconds cache for external services

router.get('/site', async (_req: Request, res: Response) => {
  const now = Date.now();
  
  // Return cached result if fresh
  if (externalCache.site && (now - externalCache.site.timestamp) < EXTERNAL_CACHE_TTL) {
    return res.status(externalCache.site.status === 'ok' ? 200 : 503).json({
      ...externalCache.site,
      cached: true,
      timestamp: new Date().toISOString()
    });
  }

  const start = Date.now();
  try {
    const response = await fetch('https://xisedlc.lol', { 
      method: 'HEAD', // HEAD faster than GET
      signal: AbortSignal.timeout(3000) // Reduced from 10s to 3s
    });
    const responseTime = Date.now() - start;
    const isOk = response.ok;
    
    // Cache result
    externalCache.site = { 
      status: isOk ? 'ok' : 'error', 
      statusCode: response.status, 
      responseTime,
      timestamp: now 
    };
    
    return res.status(isOk ? 200 : 503).json({ status: isOk ? 'ok' : 'error', statusCode: response.status, responseTime, timestamp: new Date().toISOString() });
  } catch (error) {
    const responseTime = Date.now() - start;
    
    // Cache error too
    externalCache.site = { status: 'error', statusCode: 0, responseTime, timestamp: now };
    
    return res.status(503).json({ status: 'error', statusCode: 0, responseTime, timestamp: new Date().toISOString(), error: error instanceof Error ? error.message : 'Unknown error' });
  }
});



// Lightweight ping endpoint for status checks (no DB queries - just checks if API is alive)
router.get('/ping', (_req: Request, res: Response) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check error:', error);
    return res.json({ status: 'degraded', timestamp: new Date().toISOString(), error: 'Database connection issue' });
  }
});

export default router;
