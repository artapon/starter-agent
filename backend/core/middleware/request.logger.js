import { createLogger } from '../logger/winston.logger.js';
const logger = createLogger('http');

export function requestLogger(req, res, next) {
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
