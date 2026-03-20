import { Router } from 'express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/index.js';
import { getDb } from '../../core/database/db.js';

const router = Router();
const db = getDb();

router.get('/', (req, res, next) => {
  try {
    const { level, agentId, limit = 100, offset = 0 } = req.query;

    const where = {};
    if (level) where.level = level;
    if (agentId) where.agent_id = agentId;

    const rows = db.table('logs').all(where, {
      orderBy: 'ts',
      order: 'desc',
      limit: Number(limit),
      offset: Number(offset),
    });
    const total = db.table('logs').count(where);
    res.json({ logs: rows, total });
  } catch (e) { next(e); }
});

router.delete('/', (req, res, next) => {
  try {
    db.table('logs').delete({});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/files', (req, res, next) => {
  try {
    const logDir = config.logDir;
    writeFileSync(join(logDir, 'agent-info.log'),  '');
    writeFileSync(join(logDir, 'agent-error.log'), '');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export const LogsModule = { router };
