/**
 * Persistent tables: opened projects and per-project sync state.
 *
 * `projects.json` mirrors the SSH plugin's mount table: it records which local
 * directory stands for which Overleaf project, so sessions, the sidebar and the
 * agent tools can all refer to the same workspace. Per-project sync state lives
 * *inside* the project directory at `.overleaf/state.json` — the pulled file
 * hashes and remote identity — so a directory carries its binding with it and
 * moving it does not break the link.
 *
 * @module dsh-overleaf/store
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, normalize } from 'node:path';

/** Normalize a local project directory once. */
export function normalizeLocal(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new Error('本地工作区路径必须是绝对路径。');
  }
  return normalize(path).replace(/\/+$/u, '') || '/';
}

/** Read and parse a JSON file, returning `fallback` when absent or malformed. */
export function readJson(file, fallback, warn = () => {}) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') warn(`cannot read ${file}: ${error.message}`);
    return fallback;
  }
}

function writeJsonAtomic(file, value, mode = 0o600) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode });
    renameSync(temp, file);
  } finally { rmSync(temp, { force: true }); }
}

/**
 * The table of opened Overleaf projects.
 * @param options - storage file path plus a warning sink.
 */
export class ProjectTable {
  constructor({ storageFile, warn } = {}) {
    this.storageFile = storageFile;
    this.warn = typeof warn === 'function' ? warn : () => {};
    this.projects = new Map();
    this.load();
  }

  load() {
    const data = readJson(this.storageFile, { version: 1, projects: [] }, this.warn);
    for (const project of Array.isArray(data.projects) ? data.projects : []) {
      if (typeof project?.localDir === 'string' && project.localDir.startsWith('/')) {
        this.projects.set(project.localDir, project);
      }
    }
    return this.projects;
  }

  list() {
    return [...this.projects.values()].sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''));
  }

  get(localDir) {
    return this.projects.get(normalizeLocal(localDir));
  }

  put(project) {
    this.projects.set(project.localDir, project);
    this.save();
    return project;
  }

  remove(localDir) {
    const removed = this.projects.delete(normalizeLocal(localDir));
    if (removed) this.save();
    return removed;
  }

  save() {
    writeJsonAtomic(this.storageFile, { version: 1, projects: this.list() });
  }
}

/** Marker directory inside every Overleaf workspace. */
export const STATE_DIR = '.overleaf';

/** The absolute path of a project's sync state file. */
export function statePath(localDir) {
  return join(localDir, STATE_DIR, 'state.json');
}

/** The sync binding recorded inside a project directory, if any. */
export function readProjectState(localDir, warn = () => {}) {
  return readJson(statePath(localDir), undefined, warn);
}

/** Write the sync binding for a project directory. */
export function writeProjectState(localDir, state) {
  writeJsonAtomic(statePath(localDir), state, 0o644);
}

/** True when the directory carries an Overleaf sync binding. */
export function isOverleafProject(localDir) {
  return existsSync(statePath(localDir));
}

/**
 * Default local directory for a new project: `<root>/<slug>-<projectId8>`.
 * @param options - the mirror root, project name and id.
 */
export function defaultLocalDir(mirrorRoot, projectName, projectId) {
  const slug = String(projectName ?? 'project')
    .normalize('NFKD').replace(/[^\w.-]+/gu, '-').replace(/^[-.]+|[-.]+$/gu, '')
    .slice(0, 40) || 'project';
  const suffix = String(projectId).replace(/[^\w-]/gu, '').slice(-8);
  return join(mirrorRoot, `${slug}-${suffix}`);
}

/** Files the sync must never consider: outputs, logs, editor droppings. */
const IGNORED = [
  /^\.overleaf(?:\/|$)/u, /^\.DS_Store$/u, /^\.git(?:\/|$)/u,
  /^output\.(pdf|log|synctex\.gz|bbl|blg|run\.xml|soc|toc)$/iu,
  /\.aux$|\.log$|\.synctex\.gz$|\.out$|\.bbl$|\.blg$|\.fls$|\.fdb_latexmk$|\.toc$/iu,
];

/** True when a project-relative path is excluded from sync. */
export function isIgnoredPath(path) {
  return IGNORED.some(pattern => pattern.test(path));
}
