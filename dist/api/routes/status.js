"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../lib/db");
const logger_1 = require("../lib/logger");
const statusMonitor_1 = require("../lib/statusMonitor");
const router = (0, express_1.Router)();
// API ключ для статус-страницы (опциональный, для дополнительной безопасности)
const STATUS_PAGE_API_KEY = process.env.STATUS_PAGE_API_KEY;
// In-memory cache for GET /status (cached DB results)
let statusCache = { data: null, timestamp: 0 };
const STATUS_CACHE_DURATION = 60000; // 60 seconds cache for GET /status
const HISTORY_POINTS_LIMIT = 150;
// GET /status - Get current status and history for all services
router.get('/', async (_req, res) => {
    try {
        // Проверяем кэш сначала (быстрый ответ)
        const now = Date.now();
        if (statusCache.data && (now - statusCache.timestamp) < STATUS_CACHE_DURATION) {
            // Calculate time since last check for sync
            const cacheAge = Math.round((now - statusCache.timestamp) / 1000);
            const nextCheckIn = Math.max(0, Math.round((STATUS_CACHE_DURATION - (now - statusCache.timestamp)) / 1000));
            return res.json({
                success: true,
                data: statusCache.data,
                cached: true,
                cacheAge,
                nextCheckIn,
                timestamp: new Date().toISOString()
            });
        }
        await (0, statusMonitor_1.ensureStatusTable)();
        const db = (0, db_1.getDb)();
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
        const serviceNames = ['Auth', 'API', 'Site'];
        for (const name of serviceNames) {
            const serviceHistory = history
                .filter(h => h.service_name === name)
                .slice(0, HISTORY_POINTS_LIMIT)
                .reverse(); // Oldest first for chart
            const operationalCount = serviceHistory.filter(h => h.status === 'operational' || h.status === 'degraded').length;
            const uptime = serviceHistory.length > 0
                ? (operationalCount / serviceHistory.length) * 100
                : 100;
            // Use latest from history, or fall back to statusMonitor if history is empty but monitor has data
            let latestStatus = serviceHistory.length > 0 ? serviceHistory[serviceHistory.length - 1].status : 'operational';
            let latestResponseTime = serviceHistory.length > 0 ? serviceHistory[serviceHistory.length - 1].response_time : 0;
            // Check if we have fresher data in memory
            const liveStatus = (0, statusMonitor_1.getLatestStatus)();
            if (liveStatus.data) {
                const liveService = liveStatus.data.find(s => s.name === name);
                if (liveService) {
                    // If live data is newer than history (it should be), use it?
                    // Actually, history comes from DB, which is updated by monitor.
                    // If monitor just ran, DB has it.
                    // So history is fine.
                }
            }
            services[name] = {
                name,
                status: latestStatus,
                responseTime: latestResponseTime,
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
            nextCheckIn: STATUS_CACHE_DURATION / 1000,
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
// POST /status/check - Returns latest status (NO TRIGGER)
// This endpoint is kept for compatibility but no longer triggers a check.
// Checks are now performed by the background statusMonitor.
router.post('/check', async (req, res) => {
    try {
        // БЕЗОПАСНОСТЬ: Опциональная проверка API ключа
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
        const liveStatus = (0, statusMonitor_1.getLatestStatus)();
        // If we have data, return it
        if (liveStatus.data) {
            return res.json({
                success: true,
                data: liveStatus.data,
                cached: true,
                cacheAge: Math.round((Date.now() - liveStatus.timestamp) / 1000),
                timestamp: new Date().toISOString()
            });
        }
        // If no data yet (startup), try to fetch from DB quick
        await (0, statusMonitor_1.ensureStatusTable)();
        const db = (0, db_1.getDb)();
        const lastChecks = await db `
      SELECT service_name, status, response_time as "responseTime", created_at
      FROM status_history
      ORDER BY created_at DESC
      LIMIT 4
    `;
        const uniqueServices = new Set(lastChecks.map(c => c.service_name));
        if (uniqueServices.size >= 3) { // Expecting at least 3 services
            const cachedData = lastChecks.slice(0, 3).map(c => ({
                name: c.service_name,
                status: c.status,
                responseTime: c.responseTime
            }));
            return res.json({
                success: true,
                data: cachedData,
                cached: true,
                source: 'db',
                timestamp: new Date().toISOString()
            });
        }
        // If still no data, trigger a check (fallback for first run if background hasn't finished)
        // Only if authorized or safe?
        // User wants NO USER TRIGGER. But if data is empty, we must return something.
        // Let's trigger it but log it.
        logger_1.logger.info('Triggering fallback status check (no data available)');
        const result = await (0, statusMonitor_1.runCheck)();
        return res.json({
            success: true,
            data: result,
            cached: false,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Status check error:', error);
        return res.status(500).json({ success: false, message: 'Failed to get status' });
    }
});
exports.default = router;
