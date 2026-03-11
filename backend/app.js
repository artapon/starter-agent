import express from 'express';
import cors from 'cors';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'node:fs';
import { requestLogger } from './core/middleware/request.logger.js';
import { errorHandler } from './core/middleware/error.handler.js';

// Modules
import { AgentsModule } from './modules/agents/agents.module.js';
import { ResearcherModule } from './modules/researcher/researcher.module.js';
import { PlannerModule } from './modules/planner/planner.module.js';
import { WorkerModule } from './modules/worker/worker.module.js';
import { ReviewerModule } from './modules/reviewer/reviewer.module.js';
import { WorkflowModule } from './modules/workflow/workflow.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { MemoryModule } from './modules/memory/memory.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { LogsModule } from './modules/logs/logs.module.js';
import { WorkspaceModule } from './modules/workspace/workspace.module.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

export function createApp() {
  const app = express();

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use(cors({ origin: '*', credentials: true }));

  // Handlebars template engine
  app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'core/templates/layouts'),
    partialsDir: path.join(__dirname, 'core/templates/partials'),
  }));
  app.set('view engine', 'hbs');
  app.set('views', path.join(__dirname, 'core/templates/pages'));

  // Static files (frontend dist in production)
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));

  // Serve generated HTML reports
  app.use('/reports', express.static(REPORTS_DIR));

  // Request logging
  app.use(requestLogger);

  // API Routes
  app.use('/api/agents', AgentsModule.router);
  app.use('/api/researcher', ResearcherModule.router);
  app.use('/api/planner', PlannerModule.router);
  app.use('/api/worker', WorkerModule.router);
  app.use('/api/reviewer', ReviewerModule.router);
  app.use('/api/workflow', WorkflowModule.router);
  app.use('/api/chat', ChatModule.router);
  app.use('/api/memory', MemoryModule.router);
  app.use('/api/settings', SettingsModule.router);
  app.use('/api/dashboard', DashboardModule.router);
  app.use('/api/logs', LogsModule.router);
  app.use('/api/workspace', WorkspaceModule.router);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ts: Date.now() });
  });

  // Reports — list sessions that have a walkthrough.html
  app.get('/api/reports/sessions', (req, res) => {
    try {
      if (!existsSync(REPORTS_DIR)) return res.json({ sessions: [] });
      const sessions = readdirSync(REPORTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && existsSync(path.join(REPORTS_DIR, d.name, 'walkthrough.html')))
        .map(d => d.name);
      res.json({ sessions });
    } catch { res.json({ sessions: [] }); }
  });

  // SPA fallback — serve Vue app or HBS shell
  app.get('*', (req, res) => {
    const dist = path.join(__dirname, '../frontend/dist/index.html');
    import('fs').then(({ existsSync }) => {
      if (existsSync(dist)) {
        res.sendFile(dist);
      } else {
        res.render('index', {
          runtimeConfig: JSON.stringify({
            apiBaseUrl: process.env.VITE_API_BASE_URL || '',
          }),
        });
      }
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}
