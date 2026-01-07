import { Router, Request, Response } from 'express';
import { getDb } from '../lib/db';

const router = Router();

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
      signal: AbortSignal.timeout(10000) 
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
    return { status: 'major', responseTime: 0 };
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
    
    // Get history for last 90 checks per service (15 minutes at 10s intervals)
    const history = await db<StatusHistoryRow[]>`
      SELECT service_name, status, response_time, created_at
      FROM status_history
      WHERE created_at > NOW() - INTERVAL '15 minutes'
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
router.post('/check', async (_req: Request, res: Response) => {
  try {
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
    
    // Insert all checks
    for (const check of checks) {
      await db`
        INSERT INTO status_history (service_name, status, response_time)
        VALUES (${check.name}, ${check.status}, ${check.responseTime})
      `;
    }
    
    // Clean up old records (older than 15 minutes)
    await db`
      DELETE FROM status_history 
      WHERE created_at < NOW() - INTERVAL '15 minutes'
    `;
    
    return res.json({ 
      success: true, 
      data: checks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ success: false, message: 'Failed to run status check' });
  }
});

export default router;
