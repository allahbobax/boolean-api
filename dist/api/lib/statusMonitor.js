"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureStatusTable = ensureStatusTable;
exports.runCheck = runCheck;
exports.startMonitoring = startMonitoring;
exports.stopMonitoring = stopMonitoring;
exports.getLatestStatus = getLatestStatus;
const db_1 = require("./db");
const logger_1 = require("./logger");
const HISTORY_RETENTION_MINUTES = 10080; // 7 days retention
// In-memory cache for live check results
let liveCheckCache = { data: null, timestamp: 0 };
let monitoringInterval = null;
const CHECK_INTERVAL = 60000; // 1 minute
// Flag and promise to ensure table is created only once per instance
let tableEnsured = false;
let tableEnsuringPromise = null;
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
async function checkService(url) {
    const start = Date.now();
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(5000) // 5s timeout
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
async function runCheck() {
    try {
        await ensureStatusTable();
        const db = (0, db_1.getDb)();
        const now = Date.now();
        const API_URL = 'https://api.xisedlc.lol';
        // Check all services using lightweight ping endpoints
        const [authStatus, apiStatus, siteStatus] = await Promise.all([
            checkService(`${API_URL}/auth/check`),
            checkService(`${API_URL}/health/ping`),
            checkService(`${API_URL}/health/site`),
        ]);
        const checks = [
            { name: 'Auth', ...authStatus },
            { name: 'API', ...apiStatus },
            { name: 'Site', ...siteStatus },
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
        // Clean up old records in background (don't await)
        db `
      DELETE FROM status_history 
      WHERE created_at < NOW() - (INTERVAL '1 minute' * ${HISTORY_RETENTION_MINUTES})
    `.catch(err => console.error('Cleanup error:', err));
        logger_1.logger.info('Background status check completed');
        return checks;
    }
    catch (error) {
        logger_1.logger.error('Background status check failed', { error });
        return null;
    }
}
function startMonitoring() {
    if (monitoringInterval)
        return;
    // Run immediately
    runCheck();
    // Then run periodically
    monitoringInterval = setInterval(runCheck, CHECK_INTERVAL);
    logger_1.logger.info('Status monitoring started');
}
function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        logger_1.logger.info('Status monitoring stopped');
    }
}
function getLatestStatus() {
    return liveCheckCache;
}
