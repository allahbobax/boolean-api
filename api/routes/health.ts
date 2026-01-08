import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';

const router = Router();

router.get('/site', async (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const response = await fetch('https://booleanclient.ru', { method: 'GET', signal: AbortSignal.timeout(10000) });
    const responseTime = Date.now() - start;
    const isOk = response.ok;
    return res.status(isOk ? 200 : 503).json({ status: isOk ? 'ok' : 'error', statusCode: response.status, responseTime, timestamp: new Date().toISOString() });
  } catch (error) {
    const responseTime = Date.now() - start;
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
  const start = Date.now();
  try {
    // Check main download link (Windows EXE)
    // GitHub releases redirect, so we follow redirects and check final response
    const response = await fetch(LAUNCHER_DOWNLOAD_URLS[0], { 
      method: 'HEAD', 
      signal: AbortSignal.timeout(10000),
      redirect: 'follow'
    });
    
    const responseTime = Date.now() - start;
    // Consider 200-399 as success (includes redirects that were followed)
    const isOk = response.status >= 200 && response.status < 400;
    
    return res.status(isOk ? 200 : 503).json({ 
      status: isOk ? 'ok' : 'error', 
      service: 'launcher',
      statusCode: response.status,
      responseTime,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    const responseTime = Date.now() - start;
    return res.status(503).json({ 
      status: 'error', 
      service: 'launcher',
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString() 
    });
  }
});

// Lightweight ping endpoint for status checks (no heavy DB queries)
router.get('/ping', async (_req: Request, res: Response) => {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health ping error:', error);
    return res.status(500).json({ status: 'error', timestamp: new Date().toISOString() });
  }
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
