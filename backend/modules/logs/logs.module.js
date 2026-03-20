import { Router } from 'express';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../../core/database/db.js';

const router  = Router();
const db      = getDb();
// Resolve log dir relative to this file: backend/modules/logs/ → backend/logs/
const LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../logs');

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

/** GET /api/logs/files?file=info|error&level=&search=&page=1&perPage=30
 *  Reads agent-info.log or agent-error.log, parses JSON lines, filters, paginates.
 *  page=1 is the LAST (most recent) page. */
router.get('/files', (req, res, next) => {
  try {
    const { file = 'info', level = '', search = '', page = 1, perPage = 20 } = req.query;
    const filename = file === 'error' ? 'agent-error.log' : 'agent-info.log';
    const filePath = join(LOG_DIR, filename);

    if (!existsSync(filePath)) return res.json({ lines: [], total: 0, page: 1, totalPages: 1, size: 0, filename });

    const stat    = statSync(filePath);
    const raw     = readFileSync(filePath, 'utf8');
    const entries = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (level  && obj.level !== level) continue;
        if (search && !JSON.stringify(obj).toLowerCase().includes(search.toLowerCase())) continue;
        entries.push(obj);
      } catch {
        if (search && !trimmed.toLowerCase().includes(search.toLowerCase())) continue;
        entries.push({ level: 'info', message: trimmed, timestamp: null, agentId: null });
      }
    }

    const total      = entries.length;
    const pp         = Math.max(1, Number(perPage));
    const totalPages = Math.max(1, Math.ceil(total / pp));
    // page=1 = last page (most recent), page=totalPages = first page (oldest)
    const p          = Math.min(Math.max(1, Number(page)), totalPages);
    const fromEnd    = (p - 1) * pp;
    const slice      = entries.slice(total - fromEnd - pp, total - fromEnd);

    res.json({ lines: slice, total, page: p, totalPages, size: stat.size, filename });
  } catch (e) { next(e); }
});

/** DELETE /api/logs/files — truncate both log files */
router.delete('/files', (req, res, next) => {
  try {
    writeFileSync(join(LOG_DIR, 'agent-info.log'),  '');
    writeFileSync(join(LOG_DIR, 'agent-error.log'), '');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export const LogsModule = { router };
