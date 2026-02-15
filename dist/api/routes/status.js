"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const logger_1 = require("../lib/logger");
const router = (0, express_1.Router)();
// API ключ для статус-страницы (опциональный, для дополнительной безопасности)
const STATUS_PAGE_API_KEY = process.env.STATUS_PAGE_API_KEY;
// In-memory cache for live check results (to avoid hammering external services)
let liveCheckCache = { data: null, timestamp: 0 };
// In-memory cache for GET /status (cached DB results)
let statusCache = { data: null, timestamp: 0 };
const CACHE_DURATION = 60000; // 1 minute cache
const STATUS_CACHE_DURATION = 60000; // 60 seconds cache for GET /status (increased from 30s)
const HISTORY_RETENTION_MINUTES = 10080; // 7 days retention
const HISTORY_POINTS_LIMIT = 150; // Reduced from 300 for faster queries
// Flag and promise to ensure table is created only once per instance
let tableEnsured = false;
let tableEnsuringPromise = null;
// Ensure status_history table exists
async function ensureStatusTable() {
    if (tableEnsured)
        return;
    if (tableEnsuringPromise)
        return tableEnsuringPromise;
    const db = (0, db_1.getDb)();
    tableEnsuringPromise = (async () => {
        try {
            await db `
        CREATE TABLE IF NOT EXISTS status_history (
          id SERIAL PRIMARY KEY,
          service_name VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          response_time INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
            // Create indexes for faster queries
            await db `
        CREATE INDEX IF NOT EXISTS idx_status_history_service_time 
        ON status_history(service_name, created_at DESC)
      `;
            await db `
        CREATE INDEX IF NOT EXISTS idx_status_history_created_at 
        ON status_history(created_at DESC)
      `;
            tableEnsured = true;
        }
        catch (error) {
            console.error('Ensure status_history table error:', error);
        }
        finally {
            tableEnsuringPromise = null;
        }
    })();
    return tableEnsuringPromise;
}
// Check a service and return status
async function checkService(url) {
    const start = Date.now();
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // Reduced to 3s for faster checks
        });
        const responseTime = Date.now() - start;
        if (response.ok) {
            return {
                status: responseTime > 5000 ? 'degraded' : 'operational',
                responseTime
            };
        }
        return { status: 'partial', responseTime };
    }
    catch {
        return { status: 'major', responseTime: Date.now() - start };
    }
}
// GET /status - Get current status and history for all services
router.get('/', async (_req, res) => {
    try {
        // Проверяем кэш сначала (быстрый ответ)
        const now = Date.now();
        if (statusCache.data && (now - statusCache.timestamp) < STATUS_CACHE_DURATION) {
            // Calculate time since last check for sync
            const cacheAge = Math.round((now - statusCache.timestamp) / 1000);
            const nextCheckIn = Math.max(0, Math.round((CACHE_DURATION - (now - statusCache.timestamp)) / 1000));
            return res.json({
                success: true,
                data: statusCache.data,
                cached: true,
                cacheAge,
                nextCheckIn,
                timestamp: new Date().toISOString()
            });
        }
        await ensureStatusTable();
        const db = (0, db_1.getDb)();
        // Оптимизированный запрос - простой LIMIT вместо ROW_NUMBER для скорости
        // Получаем последние N записей для каждого сервиса
        const history = await db `
      SELECT service_name, status, response_time, created_at
      FROM status_history
      WHERE created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
      LIMIT ${HISTORY_POINTS_LIMIT * 4}
    `;
        // Group by service
        const services = {};
        const serviceNames = ['Auth', 'API', 'Site', 'Launcher'];
        for (const name of serviceNames) {
            const serviceHistory = history
                .filter(h => h.service_name === name)
                .slice(0, HISTORY_POINTS_LIMIT)
                .reverse(); // Oldest first for chart
            const operationalCount = serviceHistory.filter(h => h.status === 'operational' || h.status === 'degraded').length;
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
        const result = Object.values(services);
        // Get last check time for sync
        const lastCheckResult = await db `
      SELECT created_at FROM status_history ORDER BY created_at DESC LIMIT 1
    `;
        const lastCheckTime = lastCheckResult[0]?.created_at?.toISOString() || new Date().toISOString();
        // Сохраняем в кэш
        statusCache = { data: result, timestamp: now };
        return res.json({
            success: true,
            data: result,
            cached: false,
            lastCheckTime,
            nextCheckIn: CACHE_DURATION / 1000,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get status error:', error);
        // Возвращаем кэш даже если устарел при ошибке
        if (statusCache.data) {
            return res.json({
                success: true,
                data: statusCache.data,
                cached: true,
                stale: true,
                timestamp: new Date().toISOString()
            });
        }
        return res.status(500).json({ success: false, message: 'Failed to get status' });
    }
});
// POST /status/check - Run a check and save to DB (called by cron or status page)
router.post('/check', async (req, res) => {
    try {
        // БЕЗОПАСНОСТЬ: Опциональная проверка API ключа для статус-страницы
        // Если ключ настроен, проверяем его. Если нет - разрешаем доступ (для обратной совместимости)
        if (STATUS_PAGE_API_KEY) {
            const providedKey = req.headers['x-api-key'];
            if (providedKey !== STATUS_PAGE_API_KEY) {
                logger_1.logger.warn('Unauthorized status check attempt', { ip: req.ip });
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }
        }
        // Check in-memory cache first (prevents multiple checks on page refresh)
        const now = Date.now();
        if (liveCheckCache.data && (now - liveCheckCache.timestamp) < CACHE_DURATION) {
            return res.json({
                success: true,
                data: liveCheckCache.data,
                cached: true,
                cacheAge: Math.round((now - liveCheckCache.timestamp) / 1000),
                timestamp: new Date().toISOString()
            });
        }
        await ensureStatusTable();
        const db = (0, db_1.getDb)();
        // БЫСТРЫЙ ПУТЬ: Проверяем последний чек в базе, чтобы не делать лишних запросов
        // Увеличен интервал до 50 секунд для уменьшения нагрузки
        const lastChecks = await db `
      SELECT service_name, status, response_time as "responseTime", created_at
      FROM status_history
      WHERE created_at > NOW() - INTERVAL '50 seconds'
      ORDER BY created_at DESC
      LIMIT 4
    `;
        // Если есть свежие данные для всех 4 сервисов - возвращаем их
        const uniqueServices = new Set(lastChecks.map(c => c.service_name));
        if (uniqueServices.size >= 4) {
            const cachedData = lastChecks.slice(0, 4).map(c => ({
                name: c.service_name,
                status: c.status,
                responseTime: c.responseTime
            }));
            // Update in-memory cache
            liveCheckCache = { data: cachedData, timestamp: now };
            return res.json({
                success: true,
                data: cachedData,
                cached: true,
                source: 'db',
                timestamp: new Date().toISOString()
            });
        }
        const API_URL = 'https://api.xisedlc.lol';
        // Check all services using lightweight ping endpoints
        const [authStatus, apiStatus, siteStatus, launcherStatus] = await Promise.all([
            checkService(`${API_URL}/auth/check`),
            checkService(`${API_URL}/health/ping`),
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
        // Insert all checks in a single batch
        const dataToInsert = checks.map(c => ({
            service_name: c.name,
            status: c.status,
            response_time: c.responseTime
        }));
        await db `
      INSERT INTO status_history ${db(dataToInsert, 'service_name', 'status', 'response_time')}
    `;
        // Invalidate status cache so next GET /status gets fresh data
        statusCache = { data: null, timestamp: 0 };
        // Clean up old records in background (don't await)
        db `
      DELETE FROM status_history 
      WHERE created_at < NOW() - (INTERVAL '1 minute' * ${HISTORY_RETENTION_MINUTES})
    `.catch(err => console.error('Cleanup error:', err));
        return res.json({
            success: true,
            data: checks,
            cached: false,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Status check error:', error);
        // Return cached data on error
        if (liveCheckCache.data) {
            return res.json({
                success: true,
                data: liveCheckCache.data,
                cached: true,
                stale: true,
                timestamp: new Date().toISOString()
            });
        }
        return res.status(500).json({ success: false, message: 'Failed to run status check' });
    }
});
exports.default = router;
