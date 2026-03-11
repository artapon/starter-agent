import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';

const DB_PATH = path.resolve(config.dbPath.replace(/\.db$/, '.json'));

class TableOps {
  constructor(name, store, meta, persist) {
    this._name = name;
    this._store = store;
    this._meta = meta;
    this._persist = persist;
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
    this._persist();
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
      this._persist();
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
    if (count) this._persist();
    return count;
  }

  // Delete all matching records; pass empty object to delete all
  delete(where = {}) {
    const before = this._store.length;
    const keep = this._store.filter(r => !this._match(r, where));
    this._store.length = 0;
    this._store.push(...keep);
    if (this._store.length !== before) this._persist();
    return before - this._store.length;
  }
}

class JsonDb {
  constructor(filePath) {
    this._filePath = filePath;
    this._data = null;
    this._load();
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

  _persist() {
    fs.writeFileSync(this._filePath, JSON.stringify(this._data, null, 2), 'utf-8');
  }

  // Returns a TableOps for the given table name (creates table if missing)
  table(name) {
    if (!this._data[name]) this._data[name] = [];
    if (!this._data._meta[name]) this._data._meta[name] = { lastId: 0 };
    return new TableOps(name, this._data[name], this._data._meta[name], () => this._persist());
  }

  // Run a function atomically (simple transaction shim — persists once at end)
  transaction(fn) {
    return () => {
      const result = fn();
      this._persist();
      return result;
    };
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
