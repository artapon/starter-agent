import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { config } from '../../config/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure log directory exists
const logDir = path.resolve(config.logDir);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, agentId, ...meta }) => {
  const agent = agentId ? `[${agentId}] ` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${agent}${message}${metaStr}`;
});

// Shared logger map (one per agentId / module)
const loggers = new Map();

// Socket transport placeholder (set after socket manager is created)
let socketTransport = null;

export function setSocketTransport(transport) {
  socketTransport = transport;
  // Add to all existing loggers
  for (const logger of loggers.values()) {
    logger.add(transport);
  }
}

export function createLogger(agentId = 'app') {
  if (loggers.has(agentId)) return loggers.get(agentId);

  const transports = [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), consoleFormat),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: combine(timestamp(), json()),
    }),
  ];

  if (socketTransport) transports.push(socketTransport);

  const logger = winston.createLogger({
    level: config.logLevel,
    defaultMeta: { agentId },
    transports,
  });

  loggers.set(agentId, logger);
  return logger;
}
