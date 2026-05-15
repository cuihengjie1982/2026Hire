/**
 * Simple structured logger — replaces console.log throughout the server.
 * In production, swap the transport to pino/winston for JSON output, file rotation, etc.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (
  process.env.NODE_ENV === 'production' ? 'info' : 'debug'
);

function formatMessage(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const entry: Record<string, unknown> = {
    level,
    timestamp: new Date().toISOString(),
    message: msg,
  };
  if (meta) Object.assign(entry, meta);
  return entry;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

export const logger = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('debug')) console.debug(JSON.stringify(formatMessage('debug', msg, meta)));
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('info')) console.info(JSON.stringify(formatMessage('info', msg, meta)));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('warn')) console.warn(JSON.stringify(formatMessage('warn', msg, meta)));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog('error')) console.error(JSON.stringify(formatMessage('error', msg, meta)));
  },
};
