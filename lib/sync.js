/**
 * Three-way-ish sync between a local project directory and Overleaf.
 *
 * The binding lives in `<dir>/.overleaf/state.json`: the pulled content hash per
 * file (`base`), which is the merge ancestor. `status` is local-only — which
 * files the agent or user touched since the last pull. `pull` overwrites files
 * that are untouched locally, keeps local edits that the remote did not change,
 * and reports conflicts when both sides moved. `push` uploads local changes
 * through the REST endpoints, creating folders and deleting remote entities as
 * needed, then re-records the pushed content as the new base.
 *
 * @module dsh-overleaf/sync
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { OverleafError } from './api.js';
import { flattenTree } from './realtime.js';
import { isIgnoredPath, readProjectState, writeProjectState } from './store.js';

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/** Collect project-relative file paths below a directory, skipping ignored ones. */
export function listLocalFiles(localDir) {
  const files = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (isIgnoredPath(path)) continue;
      if (entry.isDirectory()) walk(join(dir, entry.name), path);
      else if (entry.isFile()) files.push(path);
    }
  };
  walk(localDir, '');
  return files.sort();
}

function readLocalFile(localDir, path) {
  try { return readFileSync(join(localDir, path.split('/').join(sep))); } catch { return undefined; }
}

/**
 * Compare the directory against the recorded base hashes.
 * @returns `{ changed: string[], deleted: string[], added: string[] }` — local-only deltas.
 */
export function localChanges(localDir, state) {
  const base = state?.files ?? {};
  const local = new Set(listLocalFiles(localDir));
  const result = { changed: [], deleted: [], added: [] };
  for (const path of local) {
    const recorded = base[path];
    if (recorded === undefined) result.added.push(path);
    else if (sha256(readLocalFile(localDir, path)) !== recorded.base) result.changed.push(path);
  }
  for (const path of Object.keys(base)) {
    if (!local.has(path)) result.deleted.push(path);
  }
  return result;
}

/**
 * Merge a fresh zip into the project directory.
 * @returns a summary with `updated`, `keptLocal`, `conflicts`, `removed`, `newRemote`.
 */
export function applyZip(localDir, state, entries) {
  const base = state?.files ?? {};
  const summary = { updated: [], keptLocal: [], conflicts: [], removed: [], newRemote: [] };
  const seen = new Set();

  for (const [rawName, data] of entries) {
    if (rawName.endsWith('/') || rawName === '') continue;
    const path = rawName.split('/').join('/');
    if (isIgnoredPath(path)) continue;
    seen.add(path);
    const remoteHash = sha256(data);
    if (base[path]?.base === remoteHash) continue; // unchanged on both sides
    const localPath = join(localDir, path.split('/').join(sep));
    const localData = readLocalFile(localDir, path);
    const localModified = localData !== undefined
      ? base[path] !== undefined && sha256(localData) !== base[path].base
      : base[path] !== undefined; // recorded but deleted locally
    if (localModified) {
      // Edited on both sides, or deleted locally while the remote changed it:
      // keep the local state and let the user or push resolve it.
      if (localData === undefined || sha256(localData) !== remoteHash) {
        summary.conflicts.push(path);
        continue;
      }
    }
    mkdirSync(dirname(localPath), { recursive: true, mode: 0o755 });
    writeFileSync(localPath, data, { mode: 0o644 });
    if (base[path] === undefined) summary.newRemote.push(path);
    else summary.updated.push(path);
  }

  // Remote deletions: recorded files the zip no longer contains and that are
  // untouched locally are dropped from disk and from the state.
  for (const path of Object.keys(base)) {
    if (seen.has(path) || isIgnoredPath(path)) continue;
    const localPath = join(localDir, path.split('/').join(sep));
    if (existsSync(localPath)) {
      const localData = readLocalFile(localDir, path);
      if (localData !== undefined && sha256(localData) !== base[path].base) {
        summary.conflicts.push(path); // deleted remotely, edited locally
        continue;
      }
      rmSync(localPath, { force: true });
      summary.removed.push(path);
    }
  }

  const files = {};
  for (const [path, data] of entries) {
    if (path.endsWith('/') || isIgnoredPath(path)) continue;
    files[path] = { base: sha256(data) };
  }
  for (const path of summary.conflicts) files[path] = base[path];
  return { summary, files };
}

/** Ensure the directory has a state file, deriving a minimal one if needed. */
export function requireState(localDir) {
  const state = readProjectState(localDir);
  if (state?.projectId === undefined || state?.server === undefined) {
    throw new OverleafError('这个目录不是 Overleaf 工作区（缺少 .overleaf/state.json）。请先在面板中打开一个 Overleaf 项目。');
  }
  if (state.files === undefined) state.files = {};
  return state;
}

/**
 * The class the plugin and tools talk to; one instance holds the HTTP client.
 * @param options - client factory plus the local mirror root.
 */
export class OverleafSync {
  /**
   * @param options - `createClient(server) -> OverleafClient`, and `warn`.
   */
  constructor({ createClient, warn } = {}) {
    this.createClient = createClient;
    this.warn = typeof warn === 'function' ? warn : () => {};
  }

  /** Local-only delta; never touches the network. */
  status(localDir) {
    const state = requireState(localDir);
    const changes = localChanges(localDir, state);
    return { projectId: state.projectId, projectName: state.projectName, server: state.server,
      pulledAt: state.pulledAt, ...changes };
  }

  /** Download the zip and merge it into the directory. */
  async pull(localDir, { signal } = {}) {
    const state = requireState(localDir);
    const client = this.createClient(state.server);
    const entries = await client.downloadZip(state.projectId, { signal });
    const { summary, files } = applyZip(localDir, state, entries);
    state.files = files;
    state.pulledAt = new Date().toISOString();
    writeProjectState(localDir, state);
    return { projectId: state.projectId, projectName: state.projectName, ...summary };
  }

  /**
   * Push local changes to Overleaf.
   *
   * Requires the entity tree (folder and doc ids), which only the realtime
   * socket exposes, so this is the one push-time socket round trip.
   * @param options - `dryRun` lists the plan without uploading.
   */
  async push(localDir, { dryRun = false, signal } = {}) {
    const state = requireState(localDir);
    const client = this.createClient(state.server);
    const project = await client.fetchProjectTree(state.projectId, { signal });
    const { files: remoteFiles, folders: remoteFolders } = flattenTree(project);

    const changes = localChanges(localDir, state);
    const base = state.files ?? {};
    /** Locally deleted paths the remote still has. */
    const remoteDeletes = changes.deleted.filter(path => remoteFiles.has(path));
    const plan = { upload: [...changes.changed, ...changes.added], delete: remoteDeletes, skipped: [] };

    if (dryRun) return { projectId: state.projectId, projectName: state.projectName, dryRun: true, ...plan,
      conflicts: [], rootDocId: project.rootDoc_id };

    const rootFolderId = remoteFolders.get('');
    if (rootFolderId === undefined) throw new OverleafError('项目文件树异常：找不到根目录。');

    const conflictPolicy = (path) => {
      // Remote also changed since the pull: the upload overwrites it; that is the
      // documented conflict behaviour and is reported in the result.
      return base[path] !== undefined && remoteFiles.has(path) ? 'overwrite-remote-changes' : 'clean';
    };
    const results = { uploaded: [], deleted: [], overwrote: [], conflicts: [] };

    for (const path of plan.delete) {
      const entity = remoteFiles.get(path);
      await client.mutate('DELETE', `/project/${encodeURIComponent(state.projectId)}/${entity.type}/${entity.id}`);
      results.deleted.push(path);
    }

    for (const path of plan.upload) {
      const data = readLocalFile(localDir, path);
      if (data === undefined) { plan.skipped.push(path); continue; }
      const folderId = await ensureFolder(client, state.projectId, remoteFolders, parentOf(path));
      const name = lastSegment(path);
      const outcome = conflictPolicy(path);
      const response = await client.uploadFile(state.projectId, folderId, name, data);
      results.uploaded.push(path);
      if (outcome === 'overwrite-remote-changes') results.overwrote.push(path);
      if (response?.entity_type === 'doc' && response?.entity_id) {
        // Track the doc id so later pushes can rename or move it cheaply.
        remoteFiles.set(path, { id: response.entity_id, type: 'doc' });
      } else {
        remoteFiles.set(path, { id: response?.entity_id, type: 'file' });
      }
    }

    // Re-record the pushed content as the new base.
    const files = { ...base };
    for (const path of [...plan.upload, ...plan.delete]) {
      if (plan.delete.includes(path)) delete files[path];
      else {
        const data = readLocalFile(localDir, path);
        if (data !== undefined) files[path] = { base: sha256(data) };
      }
    }
    state.files = files;
    state.pulledAt = new Date().toISOString();
    state.rootDocId = project.rootDoc_id ?? state.rootDocId;
    writeProjectState(localDir, state);
    return { projectId: state.projectId, projectName: state.projectName, ...results, skipped: plan.skipped };
  }
}

async function ensureFolder(client, projectId, folders, path) {
  if (path === '') return folders.get('');
  if (folders.has(path)) return folders.get(path);
  const parentId = await ensureFolder(client, projectId, folders, parentOf(path));
  const response = await client.mutate('POST', `/project/${encodeURIComponent(projectId)}/folder`,
    { body: { name: lastSegment(path), parent_folder_id: parentId } });
  const id = response?._id;
  if (id === undefined) throw new OverleafError(`创建文件夹 ${path} 失败`);
  folders.set(path, id);
  return id;
}

function parentOf(path) {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}

function lastSegment(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}
