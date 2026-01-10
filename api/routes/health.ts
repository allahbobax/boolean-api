import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';

const router = Router();

// Cache for external service checks (site/launcher change rarely)
let externalCache: {
  site: { status: string; statusCode: number; responseTime: number; timestamp: number } | null;
  launcher: { status: string; statusCode: number; responseTime: number; timestamp: number } | null;
} = { site: null, launcher: null };

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
    const response = await fetch('https://booleanclient.ru', { 
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

// Check launcher download availability (GitHub releases)
const LAUNCHER_DOWNLOAD_URLS = [
  'https://github.com/nihmadev/hoka/releases/download/v1/Boolean.Launcher_0.1.0_x64-setup.exe',
  'https://github.com/nihmadev/hoka/releases/download/v1/Boolean.Launcher_0.1.0_x64_en-US.msi',
  'https://github.com/nihmadev/hoka/releases/download/v1/Boolean.Launcher_0.1.0_aarch64.dmg',
  'https://github.com/nihmadev/hoka/releases/download/v1/Boolean.Launcher_0.1.0_x64.dmg',
  'https://github.com/nihmadev/hoka/releases/download/v1/Boolean.Launcher-0.1.0-1.x86_64.rpm',
  'https://github.com/nihmadev/hoka/releases/download/v1/Boolean.Launcher_0.1.0_amd64.deb',
  'https://github.com/nihmadev/hoka/releases/download/v1/Boolean.Launcher_0.1.0_amd64.AppImage'

];

router.get('/launcher', async (_req: Request, res: Response) => {
  const now = Date.now();
  
  // Return cached result if fresh
  if (externalCache.launcher && (now - externalCache.launcher.timestamp) < EXTERNAL_CACHE_TTL) {
    return res.status(externalCache.launcher.status === 'ok' ? 200 : 503).json({
      ...externalCache.launcher,
      service: 'launcher',
      cached: true,
      timestamp: new Date().toISOString()
    });
  }

  const start = Date.now();
  try {
    // Check main download link (Windows EXE)
    // GitHub releases redirect, so we follow redirects and check final response
    const response = await fetch(LAUNCHER_DOWNLOAD_URLS[0], { 
      method: 'HEAD', 
      signal: AbortSignal.timeout(3000), // Reduced from 10s to 3s
      redirect: 'follow'
    });
    
    const responseTime = Date.now() - start;
    // Consider 200-399 as success (includes redirects that were followed)
    const isOk = response.status >= 200 && response.status < 400;
    
    // Cache result
    externalCache.launcher = { 
      status: isOk ? 'ok' : 'error', 
      statusCode: response.status, 
      responseTime,
      timestamp: now 
    };
    
    return res.status(isOk ? 200 : 503).json({ 
      status: isOk ? 'ok' : 'error', 
      service: 'launcher',
      statusCode: response.status,
      responseTime,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    const responseTime = Date.now() - start;
    
    // Cache error too
    externalCache.launcher = { status: 'error', statusCode: 0, responseTime, timestamp: now };
    
    return res.status(503).json({ 
      status: 'error', 
      service: 'launcher',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString() 
    });
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
