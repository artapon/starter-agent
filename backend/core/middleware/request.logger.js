import { createLogger } from '../logger/winston.logger.js';
const logger = createLogger('http');

// High-frequency polling routes that would flood the log
const SKIP_PATHS = new Set([
  '/',
  '/runs',
  '/stats',
  '/tokens',
  '/wm/stats',
]);
const SKIP_PREFIXES = ['/api/reports/'];

export function requestLogger(req, res, next) {
  const skip =
    SKIP_PATHS.has(req.path) ||
    SKIP_PREFIXES.some(p => req.path.startsWith(p));

  if (skip) return next();

  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      ms,
      ip: req.ip,
    });
  });
  next();
}
