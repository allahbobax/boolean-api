"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
// Утилита для fetch с таймаутом
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    console.log(`[Fetch] Starting request to ${url} (timeout: ${timeoutMs}ms)`);
    const start = Date.now();
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        console.log(`[Fetch] Response from ${url} received in ${Date.now() - start}ms (status: ${response.status})`);
        return response;
    }
    catch (error) {
        console.error(`[Fetch] Error fetching ${url} after ${Date.now() - start}ms:`, error);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeout);
    }
}
