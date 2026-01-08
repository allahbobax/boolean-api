"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function formatLog(level, message, context) {
    const timestamp = new Date().toISOString();
    const sanitizedContext = context ? sanitizeContext(context) : {};
    return JSON.stringify({
        timestamp,
        level,
        message,
        ...sanitizedContext
    });
}
// Удаляем чувствительные данные из контекста
function sanitizeContext(context) {
    const sanitized = { ...context };
    // Список полей, которые НЕ должны попадать в логи
    const sensitiveFields = ['token', 'password', 'secret', 'apiKey', 'authorization'];
    for (const field of sensitiveFields) {
        if (field in sanitized) {
            delete sanitized[field];
        }
    }
    return sanitized;
}
exports.logger = {
    info(message, context) {
        console.log(formatLog('info', message, context));
    },
    warn(message, context) {
        console.warn(formatLog('warn', message, context));
    },
    error(message, context) {
        console.error(formatLog('error', message, context));
    }
};
