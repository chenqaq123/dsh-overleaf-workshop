/**
 * Workspace path rules shared by the host RPCs and tests.
 *
 * Paths are lexical: symlinks are not resolved, matching the rest of the
 * plugin's file tools. Every helper keeps the target inside the workspace.
 *
 * @module dsh-overleaf/workspace-files
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { isIgnoredPath, normalizeLocal } from './store.js';

/** Resolve a project-relative path, refusing anything that escapes the workspace. */
export function resolveWorkspacePath(localDir, path) {
  const root = normalizeLocal(localDir);
  const rel = String(path ?? '').replace(/\\/g, '/');
  if (rel.length === 0 || rel.includes('\0') || isAbsolute(rel) || /^[A-Za-z]:\//u.test(rel)) {
    throw new Error('无效的文件路径。');
  }
  const segments = rel.split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('无效的文件路径。');
  }
  const absolute = normalize(join(root, segments.join(sep)));
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) throw new Error('无效的文件路径。');
  return { rel: segments.join('/'), absolute };
}

/** Create a new empty file without ever overwriting an existing one. */
export function createWorkspaceFile(localDir, path) {
  if (String(path ?? '').replace(/\\/g, '/').endsWith('/')) throw new Error('无效的文件路径。');
  const { rel, absolute } = resolveWorkspacePath(localDir, path);
  if (isIgnoredPath(rel)) throw new Error('不能在这个位置创建文件。');
  mkdirSync(dirname(absolute), { recursive: true });
  try {
    writeFileSync(absolute, '', { flag: 'wx', mode: 0o644 });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('同名文件或文件夹已存在。');
    if (error?.code === 'EISDIR') throw new Error('同名文件夹已存在。');
    if (error?.code === 'ENOTDIR') throw new Error('上级路径不是文件夹。');
    throw error;
  }
  return { path: rel };
}

/** Create a new folder, including missing parents. */
export function createWorkspaceFolder(localDir, path) {
  const raw = String(path ?? '').replace(/\\/g, '/').replace(/\/+$/u, '');
  const { rel, absolute } = resolveWorkspacePath(localDir, raw);
  if (isIgnoredPath(rel) || rel === '.overleaf') throw new Error('不能在这个位置创建文件夹。');
  if (existsSync(absolute)) throw new Error('同名文件或文件夹已存在。');
  try {
    mkdirSync(absolute, { recursive: true });
  } catch (error) {
    if (error?.code === 'ENOTDIR') throw new Error('上级路径不是文件夹。');
    throw error;
  }
  return { path: rel };
}
