import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

function load() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { projects: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return { projects: [] }; }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export const projectStore = {
  list() {
    return load().projects;
  },

  get(id) {
    return load().projects.find(p => p.id === id) || null;
  },

  create({ title, description = '' }) {
    const data = load();
    const project = {
      id:          uuidv4(),
      title:       title.trim(),
      description: description.trim(),
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    };
    data.projects.push(project);
    save(data);
    return project;
  },

  update(id, { title, description }) {
    const data = load();
    const idx  = data.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    if (title       !== undefined) data.projects[idx].title       = title.trim();
    if (description !== undefined) data.projects[idx].description = description.trim();
    data.projects[idx].updatedAt = Date.now();
    save(data);
    return data.projects[idx];
  },

  delete(id) {
    const data = load();
    const before = data.projects.length;
    data.projects = data.projects.filter(p => p.id !== id);
    save(data);
    return data.projects.length < before;
  },
};
