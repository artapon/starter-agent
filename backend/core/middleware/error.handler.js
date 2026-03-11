import { createLogger } from '../logger/winston.logger.js';
const logger = createLogger('error');

export function errorHandler(err, req, res, next) {
  // Only forward HTTP status codes that originated from our own route handlers.
  // Errors from third-party services (LM Studio, etc.) carry their own status
  // codes (e.g. 400) which must not be forwarded to the client.
  const rawStatus = err.status || err.statusCode;
  const status = rawStatus && rawStatus >= 400 && rawStatus < 500 && err._isOurError
    ? rawStatus
    : 500;
  const message = err.message || 'Internal Server Error';

  logger.error(message, {
    status,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
