import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { getWorkspacePath, toFolderName } from '../workspace/workspace.path.js';

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

function ensureProjectFolder(folderName) {
  try {
    const dir = path.join(getWorkspacePath(), folderName);
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* non-fatal */ }
}

function renameProjectFolder(oldFolder, newFolder) {
  if (oldFolder === newFolder) return;
  try {
    const wsPath  = getWorkspacePath();
    const oldPath = path.join(wsPath, oldFolder);
    const newPath = path.join(wsPath, newFolder);
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
    } else {
      fs.mkdirSync(newPath, { recursive: true });
    }
  } catch { /* non-fatal */ }
}

export const projectStore = {
  list() {
    return load().projects;
  },

  get(id) {
    return load().projects.find(p => p.id === id) || null;
  },

  create({ title, description = '' }) {
    const data       = load();
    const folderName = toFolderName(title);
    const project = {
      id:          uuidv4(),
      title:       title.trim(),
      description: description.trim(),
      folderName,
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
    };
    data.projects.push(project);
    save(data);
    ensureProjectFolder(folderName);
    return project;
  },

  update(id, { title, description }) {
    const data = load();
    const idx  = data.projects.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const oldFolderName = data.projects[idx].folderName || toFolderName(data.projects[idx].title);
    if (title !== undefined) {
      const newFolderName = toFolderName(title);
      renameProjectFolder(oldFolderName, newFolderName);
      data.projects[idx].title      = title.trim();
      data.projects[idx].folderName = newFolderName;
    }
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

  /** Return the absolute workspace folder path for a project. */
  getFolder(id) {
    const project = this.get(id);
    if (!project) return null;
    const folderName = project.folderName || toFolderName(project.title);
    return path.join(getWorkspacePath(), folderName);
  },
};
