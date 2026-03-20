import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';

const DB_PATH = path.resolve(config.dbPath.replace(/\.db$/, '.json'));

// Max age for log entries (7 days in ms)
const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

class TableOps {
  constructor(name, store, meta, schedulePersist) {
    this._name = name;
    this._store = store;
    this._meta = meta;
    this._schedulePersist = schedulePersist;
  }

  _match(record, where) {
    if (!where || !Object.keys(where).length) return true;
    return Object.entries(where).every(([k, v]) => record[k] === v);
  }

  // Return all matching records with optional sort/limit/offset
  all(where = {}, opts = {}) {
    let result = this._store.filter(r => this._match(r, where));
    if (opts.orderBy) {
      const dir = String(opts.order || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      result = [...result].sort((a, b) => {
        if (a[opts.orderBy] < b[opts.orderBy]) return -dir;
        if (a[opts.orderBy] > b[opts.orderBy]) return dir;
        return 0;
      });
    }
    if (opts.offset) result = result.slice(Number(opts.offset));
    if (opts.limit)  result = result.slice(0, Number(opts.limit));
    return result;
  }

  // Return first matching record or undefined
  first(where = {}) {
    return this._store.find(r => this._match(r, where));
  }

  // Count matching records
  count(where = {}) {
    if (!where || !Object.keys(where).length) return this._store.length;
    return this._store.filter(r => this._match(r, where)).length;
  }

  // Insert a new record; auto-assigns integer .id if none provided
  insert(record) {
    const entry = { ...record };
    if (!('id' in entry)) {
      this._meta.lastId = (this._meta.lastId || 0) + 1;
      entry.id = this._meta.lastId;
    }
    this._store.push(entry);
    this._schedulePersist();
    return entry;
  }

  // Insert only if no existing record matches keys
  insertOrIgnore(keys, record) {
    const where = Object.fromEntries(keys.map(k => [k, record[k]]));
    if (this.first(where)) return null;
    return this.insert(record);
  }

  // Insert or update based on key fields (upsert)
  upsert(keys, record) {
    const where = Object.fromEntries(keys.map(k => [k, record[k]]));
    const idx = this._store.findIndex(r => this._match(r, where));
    if (idx >= 0) {
      this._store[idx] = { ...this._store[idx], ...record };
      this._schedulePersist();
      return this._store[idx];
    }
    return this.insert(record);
  }

  // Update all matching records; returns count updated
  update(where, data) {
    let count = 0;
    for (let i = 0; i < this._store.length; i++) {
      if (this._match(this._store[i], where)) {
        this._store[i] = { ...this._store[i], ...data };
        count++;
      }
    }
    if (count) this._schedulePersist();
    return count;
  }

  // Delete all matching records; pass empty object to delete all
  delete(where = {}) {
    const before = this._store.length;
    const keep = this._store.filter(r => !this._match(r, where));
    this._store.length = 0;
    this._store.push(...keep);
    if (this._store.length !== before) this._schedulePersist();
    return before - this._store.length;
  }
}

class JsonDb {
  constructor(filePath) {
    this._filePath = filePath;
    this._data = null;
    this._persistTimer = null;
    this._load();
    this._pruneOldLogs();

    // Final flush on process exit (sync fallback)
    process.on('exit', () => {
      if (this._persistTimer) {
        clearTimeout(this._persistTimer);
        this._flushSync();
      }
    });
  }

  _load() {
    if (fs.existsSync(this._filePath)) {
      try {
        this._data = JSON.parse(fs.readFileSync(this._filePath, 'utf-8'));
      } catch {
        this._data = { _meta: {} };
      }
    } else {
      this._data = { _meta: {} };
    }
  }

  // Prune log entries older than LOG_MAX_AGE_MS on startup to keep DB small
  _pruneOldLogs() {
    if (!Array.isArray(this._data.logs)) return;
    const cutoff = Date.now() - LOG_MAX_AGE_MS;
    const before = this._data.logs.length;
    this._data.logs = this._data.logs.filter(r => (r.ts || 0) > cutoff);
    const pruned = before - this._data.logs.length;
    if (pruned > 0) {
      console.log(`[db] Pruned ${pruned} log entries older than 7 days`);
      this._schedulePersist();
    }
  }

  // Debounced async write — coalesces rapid consecutive writes into one
  _schedulePersist() {
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      const json = JSON.stringify(this._data);
      fs.writeFile(this._filePath, json, 'utf-8', (err) => {
        if (err) console.error('[db] persist failed:', err.message);
      });
    }, 200);
  }

  // Synchronous flush for process exit
  _flushSync() {
    try {
      fs.writeFileSync(this._filePath, JSON.stringify(this._data), 'utf-8');
    } catch (err) {
      console.error('[db] final flush failed:', err.message);
    }
  }

  // Returns a TableOps for the given table name (creates table if missing)
  table(name) {
    if (!this._data[name]) this._data[name] = [];
    if (!this._data._meta[name]) this._data._meta[name] = { lastId: 0 };
    return new TableOps(name, this._data[name], this._data._meta[name], () => this._schedulePersist());
  }

  // Run a function atomically — persists once at end
  transaction(fn) {
    const result = fn();
    this._schedulePersist();
    return result;
  }
}

let _db = null;

export function getDb() {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new JsonDb(DB_PATH);
  return _db;
}
