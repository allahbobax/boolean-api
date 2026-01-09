import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';
import { logger } from '../lib/logger';

const router = Router();

// API ключ для статус-страницы (опциональный, для дополнительной безопасности)
const STATUS_PAGE_API_KEY = process.env.STATUS_PAGE_API_KEY;

// In-memory cache for live check results (to avoid hammering external services)
let liveCheckCache: {
  data: Array<{ name: string; status: string; responseTime: number }> | null;
  timestamp: number;
} = { data: null, timestamp: 0 };

const CACHE_DURATION = 40000; // 40 seconds cache (matches check interval)
const HISTORY_RETENTION_MINUTES = 60; // 40s * 90 checks = 3600s = 60 minutes

// Ensure status_history table exists
async function ensureStatusTable() {
  const db = getDb();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS status_history (
        id SERIAL PRIMARY KEY,
        service_name VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        response_time INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    // Create index for faster queries
    await db`
      CREATE INDEX IF NOT EXISTS idx_status_history_service_time 
      ON status_history(service_name, created_at DESC)
    `;
  } catch (error) {
    console.error('Ensure status_history table error:', error);
  }
}

// Check a service and return status
async function checkService(url: string): Promise<{ status: string; responseTime: number }> {
  const start = Date.now();
  try {
    const response = await fetch(url, { 
      method: 'GET', 
      signal: AbortSignal.timeout(3000) // Reduced to 3s for faster checks
    });
    const responseTime = Date.now() - start;
    
    if (response.ok) {
      return { 
        status: responseTime > 2000 ? 'degraded' : 'operational',
        responseTime 
      };
    }
    return { status: 'partial', responseTime };
  } catch {
    return { status: 'major', responseTime: Date.now() - start };
  }
}

interface StatusHistoryRow {
  service_name: string;
  status: string;
  response_time: number;
  created_at: Date;
}

// GET /status - Get current status and history for all services
router.get('/', async (_req: Request, res: Response) => {
  try {
    await ensureStatusTable();
    const db = getDb();
    
    // Get history for last 90 checks per service (60 minutes at ~40s intervals)
    const retentionInterval = `${HISTORY_RETENTION_MINUTES} minutes`;
    const history = await db<StatusHistoryRow[]>`
      SELECT service_name, status, response_time, created_at
      FROM status_history
      WHERE created_at > NOW() - ${retentionInterval}::interval
      ORDER BY service_name, created_at DESC
    `;
    
    // Group by service
    const services: Record<string, { 
      name: string;
      status: string;
      responseTime: number;
      uptime: number;
      history: Array<{ time: string; responseTime: number; status: string }>;
    }> = {};
    
    const serviceNames = ['Auth', 'API', 'Site', 'Launcher'];
    
    for (const name of serviceNames) {
      const serviceHistory = history
        .filter(h => h.service_name === name)
        .slice(0, 90)
        .reverse();
      
      const operationalCount = serviceHistory.filter(
        h => h.status === 'operational' || h.status === 'degraded'
      ).length;
      
      const uptime = serviceHistory.length > 0 
        ? (operationalCount / serviceHistory.length) * 100 
        : 100;
      
      const latest = serviceHistory[serviceHistory.length - 1];
      
      services[name] = {
        name,
        status: latest?.status || 'operational',
        responseTime: latest?.response_time || 0,
        uptime,
        history: serviceHistory.map(h => ({
          time: h.created_at.toISOString(),
          responseTime: h.response_time,
          status: h.status
        }))
      };
    }
    
    return res.json({ 
      success: true, 
      data: Object.values(services),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get status' });
  }
});

// POST /status/check - Run a check and save to DB (called by cron or status page)
router.post('/check', async (req: Request, res: Response) => {
  try {
    // БЕЗОПАСНОСТЬ: Опциональная проверка API ключа для статус-страницы
    // Если ключ настроен, проверяем его. Если нет - разрешаем доступ (для обратной совместимости)
    if (STATUS_PAGE_API_KEY) {
      const providedKey = req.headers['x-api-key'] as string;
      if (providedKey !== STATUS_PAGE_API_KEY) {
        logger.warn('Unauthorized status check attempt', { ip: req.ip });
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }
    }

    // Check cache first
    const now = Date.now();
    if (liveCheckCache.data && (now - liveCheckCache.timestamp) < CACHE_DURATION) {
      return res.json({ 
        success: true, 
        data: liveCheckCache.data,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    await ensureStatusTable();
    const db = getDb();
    
    const API_URL = 'https://api.booleanclient.ru';
    
    // Check all services using lightweight ping endpoints
    const [authStatus, apiStatus, siteStatus, launcherStatus] = await Promise.all([
      checkService(`${API_URL}/auth/check`),
      checkService(`${API_URL}/health/ping`),  // Use lightweight ping instead of heavy /health
      checkService(`${API_URL}/health/site`),
      checkService(`${API_URL}/health/launcher`),
    ]);
    
    const checks = [
      { name: 'Auth', ...authStatus },
      { name: 'API', ...apiStatus },
      { name: 'Site', ...siteStatus },
      { name: 'Launcher', ...launcherStatus },
    ];
    
    // Update cache
    liveCheckCache = {
      data: checks,
      timestamp: now
    };
    
    // Insert all checks
    for (const check of checks) {
      await db`
        INSERT INTO status_history (service_name, status, response_time)
        VALUES (${check.name}, ${check.status}, ${check.responseTime})
      `;
    }
    
    // Clean up old records (older than retention period)
    const cleanupInterval = `${HISTORY_RETENTION_MINUTES} minutes`;
    await db`
      DELETE FROM status_history 
      WHERE created_at < NOW() - ${cleanupInterval}::interval
    `;
    
    return res.json({ 
      success: true, 
      data: checks,
      cached: false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ success: false, message: 'Failed to run status check' });
  }
});

export default router;
