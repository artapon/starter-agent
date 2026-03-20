import { Router } from 'express';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../config/index.js';
import { getDb } from '../../core/database/db.js';

const router = Router();
const db = getDb();

// ── DB log endpoints (legacy, kept for compatibility) ─────────────────────────
router.get('/', (req, res, next) => {
  try {
    const { level, agentId, limit = 100, offset = 0 } = req.query;
    const where = {};
    if (level)   where.level    = level;
    if (agentId) where.agent_id = agentId;
    const rows  = db.table('logs').all(where, { orderBy: 'ts', order: 'desc', limit: Number(limit), offset: Number(offset) });
    const total = db.table('logs').count(where);
    res.json({ logs: rows, total });
  } catch (e) { next(e); }
});

router.delete('/', (req, res, next) => {
  try { db.table('logs').delete({}); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// ── File log endpoints ────────────────────────────────────────────────────────

/** GET /api/logs/files?file=info|error&level=&search=&limit=2000
 *  Reads agent-info.log or agent-error.log, parses JSON lines, filters, tails. */
router.get('/files', (req, res, next) => {
  try {
    const { file = 'info', level = '', search = '', limit = 2000 } = req.query;
    const filename = file === 'error' ? 'agent-error.log' : 'agent-info.log';
    const filePath = join(config.logDir, filename);

    if (!existsSync(filePath)) return res.json({ lines: [], size: 0, filename });

    const stat    = statSync(filePath);
    const raw     = readFileSync(filePath, 'utf8');
    const entries = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (level  && obj.level   !== level)                       continue;
        if (search && !JSON.stringify(obj).toLowerCase().includes(search.toLowerCase())) continue;
        entries.push(obj);
      } catch {
        // non-JSON line — include as raw message
        if (search && !trimmed.toLowerCase().includes(search.toLowerCase())) continue;
        entries.push({ level: 'info', message: trimmed, timestamp: null, agentId: null });
      }
    }

    // Tail: return last N entries
    const tail = entries.slice(-Number(limit));
    res.json({ lines: tail, total: entries.length, size: stat.size, filename });
  } catch (e) { next(e); }
});

/** DELETE /api/logs/files — truncate both log files */
router.delete('/files', (req, res, next) => {
  try {
    writeFileSync(join(config.logDir, 'agent-info.log'),  '');
    writeFileSync(join(config.logDir, 'agent-error.log'), '');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export const LogsModule = { router };
