import 'dotenv/config';
import http from 'http';
import { createApp } from './app.js';
import { createSocketManager } from './core/socket/socket.manager.js';
import { createLogger } from './core/logger/winston.logger.js';
import { runMigrations } from './core/database/migrator.js';
import { getDb } from './core/database/db.js';
import { setToolSocketManager } from './core/tools/tool.implementations.js';
import { cronService } from './modules/cron/services/cron.service.js';

const logger = createLogger('server');
const PORT = process.env.PORT || 3000;

async function bootstrap() {
  // 1. Run DB migrations
  const db = getDb();
  runMigrations(db);
  logger.info('Database migrations complete');

  // 2. Create Express app
  const app = createApp();

  // 3. Create HTTP + Socket.IO server
  const httpServer = http.createServer(app);
  const socketManager = createSocketManager(httpServer);

  // Make socketManager globally accessible
  app.set('socketManager', socketManager);
  setToolSocketManager(socketManager);
  cronService.init(socketManager);

  // 4. Start listening
  httpServer.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`, { port: PORT });
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down...');
    httpServer.close(() => process.exit(0));
  });
}

bootstrap().catch((err) => {
  logger.error('Fatal bootstrap error', { error: err.message, stack: err.stack });
  process.exit(1);
});
