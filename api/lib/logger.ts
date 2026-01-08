// Структурированное логирование без чувствительных данных
interface LogContext {
  userId?: number;
  ip?: string;
  endpoint?: string;
  provider?: string;
  [key: string]: unknown;
}

type LogLevel = 'info' | 'warn' | 'error';

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
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
function sanitizeContext(context: LogContext): LogContext {
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

export const logger = {
  info(message: string, context?: LogContext) {
    console.log(formatLog('info', message, context));
  },
  
  warn(message: string, context?: LogContext) {
    console.warn(formatLog('warn', message, context));
  },
  
  error(message: string, context?: LogContext) {
    console.error(formatLog('error', message, context));
  }
};
