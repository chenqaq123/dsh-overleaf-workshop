/**
 * Desktop RPCs use the harness's existing authenticated Connection/Gateway,
 * the same way the SSH plugin's panel does.
 * @module dsh-overleaf/ui-host
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CookieExpiredError, OverleafClient, normalizeBaseUrl } from '../lib/api.js';
import { guessMainFile, toRpcCompileResult } from '../lib/compile.js';
import { isIgnoredPath, isOverleafProject, normalizeLocal, readProjectState } from '../lib/store.js';
import { createWorkspaceFile, createWorkspaceFolder, resolveWorkspacePath } from '../lib/workspace-files.js';

/** Resolve a project-relative path, refusing anything that escapes the workspace. */
function safePath(localDir, path) {
  return resolveWorkspacePath(localDir, path).absolute;
}

/** Resolve a requested main document to a workspace-relative `.tex` path. */
function mainFileUnder(localDir, value) {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  let rel = value.replace(/\\/g, '/').replace(/^(?:\.\/)+/u, '');
  if (rel.startsWith('/')) {
    const root = localDir.replace(/\/+$/u, '');
    if (!rel.startsWith(`${root}/`)) throw new Error('主文件必须位于当前工作区内。');
    rel = rel.slice(root.length + 1);
  }
  if (rel.length === 0 || rel.split('/').includes('..') || !rel.toLowerCase().endsWith('.tex')) {
    throw new Error('主文件必须是工作区内的 .tex 文件。');
  }
  return rel;
}

/** What the panel should show when an operation fails on credentials. */
function friendly(error) {
  if (error instanceof CookieExpiredError) return error.message;
  return error?.message ?? String(error);
}

export async function registerOverleafUi(ctx, host, runtime) {
  const [{ z }, { TypertRemoteService }] = await Promise.all([
    import(pathToFileURL(join(dirname(host.root), 'zod/index.js')).href),
    import(pathToFileURL(join(host.root, 'dsh-typert-protocol/lib/index.js')).href),
  ]);

  /**
   * Resolve the workspace a request talks about. The panel passes an explicit
   * path; a Sidebar editor tab knows only the Session its address names, so it
   * passes `session_id` and the session header supplies the workspace root.
   */
  function localDirOf(request) {
    if (typeof request?.local_path === 'string' && request.local_path.length > 0) {
      return normalizeLocal(request.local_path);
    }
    if (typeof request?.session_id === 'string' && request.session_id.length > 0) {
      const sessions = runtime.ctx?.get?.('sessions') ?? runtime.ctx?.sessions;
      const cwd = sessions?.get?.(request.session_id)?.header?.cwd;
      if (typeof cwd === 'string' && cwd.length > 0) return normalizeLocal(cwd);
      throw new Error('找不到这个会话的工作目录。');
    }
    throw new Error('缺少工作区路径。');
  }

  class OverleafUi extends TypertRemoteService {
    constructor(scope) { super(scope, 'overleafUi'); }

    /** Servers with sessions, remote projects, and opened local workspaces. */
    async list() {
      const runtime_ = runtime;
      const servers = runtime_.secrets.list();
      const workspaces = runtime_.projectTable.list().map((project) => ({
        ...project,
        projectName: project.projectName ?? '未命名项目',
        openedAt: project.openedAt ?? null,
        bound: isOverleafProject(project.localDir),
      }));
      let projects = [];
      const primary = servers[0]?.origin ?? runtime_.config.defaultServer;
      try {
        const client = runtime_.createClient(primary);
        projects = await client.listProjects();
      } catch (error) {
        // No session or expired cookie: the panel shows the login card instead.
        return { servers, projects: [], workspaces, error: friendly(error), primary };
      }
      return { servers, projects, workspaces, error: '', primary };
    }

    /** Validate a pasted cookie and store the session. */
    async login(request) {
      const origin = normalizeBaseUrl(request.base_url);
      const client = new OverleafClient({ baseUrl: origin });
      const identity = await client.login(request.cookie);
      runtime.secrets.set(origin, {
        cookies: client.cookies, csrfToken: identity.csrfToken,
        userId: identity.userId, email: identity.email ?? '',
      });
      return { origin, email: identity.email ?? '' };
    }

    /** Forget one server's session; project directories are untouched. */
    logout(request) {
      const origin = normalizeBaseUrl(request.base_url);
      return { removed: runtime.secrets.delete(origin) };
    }

    /** Download the zip into a local directory, register and return its path. */
    async open(request, signal) {
      const origin = normalizeBaseUrl(request.base_url);
      const opened = await runtime.ctx.overleaf.openProject({
        server: origin,
        projectId: request.project_id,
        projectName: request.project_name,
        ...(request.local_path !== undefined ? { localDir: normalizeLocal(request.local_path) } : {}),
      }, { signal });
      return { localDir: opened.localDir, workspaceId: opened.workspaceId ?? null };
    }

    /** Everything the sidebar section needs, in one round trip. */
    overview() {
      const workspaces = runtime.projectTable.list().map((project) => {
        const status = runtime.live.status(project.localDir);
        return {
          localDir: project.localDir,
          projectName: project.projectName ?? '未命名项目',
          server: project.server,
          projectId: project.projectId,
          bound: isOverleafProject(project.localDir),
          phase: status.phase ?? 'idle',
          paused: status.paused === true,
          collaborators: status.collaborators ?? 0,
          pending: status.pending ?? 0,
          error: status.error ?? '',
        };
      });
      return { workspaces, servers: runtime.secrets.list().length };
    }

    /** Live-sync status for one workspace. */
    status(request) {
      const localDir = localDirOf(request);
      return runtime.live.status(localDir);
    }

    /** Where the Sidebar should point after opening a workspace, in one round trip. */
    prepare(request) {
      const localDir = localDirOf(request);
      const bound = isOverleafProject(localDir);
      return {
        localDir,
        bound,
        mainFile: bound ? (guessMainFile(localDir) ?? null) : null,
        hasPdf: existsSync(join(localDir, 'output.pdf')),
      };
    }

    /** Cheap check for the Files-tab header controls. */
    bound(request) {
      return { bound: isOverleafProject(localDirOf(request)) };
    }

    /** Create an empty file; never overwrites an existing path. */
    createFile(request) {
      const localDir = localDirOf(request);
      if (!isOverleafProject(localDir)) throw new Error('这个目录不是 Overleaf 工作区。');
      return createWorkspaceFile(localDir, request.path);
    }

    /** Create a folder locally and, when live sync is connected, remotely. */
    async createFolder(request) {
      const localDir = localDirOf(request);
      if (!isOverleafProject(localDir)) throw new Error('这个目录不是 Overleaf 工作区。');
      const created = createWorkspaceFolder(localDir, request.path);
      const remote = await runtime.live.createFolder(localDir, created.path).catch(() => false);
      return { path: created.path, remote: remote === true };
    }

    /** Start, stop or pause the live session. */
    async live(request) {
      const localDir = localDirOf(request);
      if (request.action === 'start') return runtime.live.start(localDir);
      if (request.action === 'stop') return (await runtime.live.stop(localDir)) ?? runtime.live.status(localDir);
      if (request.action === 'pause') return runtime.live.setPaused(localDir, true);
      if (request.action === 'resume') return runtime.live.setPaused(localDir, false);
      if (request.action === 'flush') return runtime.live.flush(localDir);
      return runtime.live.status(localDir);
    }

    /** Flat list of editable files in a workspace. */
    files(request) {
      const localDir = localDirOf(request);
      if (!isOverleafProject(localDir)) throw new Error('这个目录不是 Overleaf 工作区。');
      const entries = [];
      const walk = (dir, prefix) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
          if (isIgnoredPath(path) || path.startsWith('.overleaf')) continue;
          if (entry.isDirectory()) { entries.push({ path, type: 'folder' }); walk(join(dir, entry.name), path); }
          else if (entry.isFile()) {
            const info = statSync(join(dir, entry.name));
            entries.push({ path, type: 'file', size: info.size });
          }
        }
      };
      walk(localDir, '');
      entries.sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === 'folder' ? -1 : 1));
      return { entries };
    }

    /** Read a text file for the in-panel editor. */
    readFile(request) {
      const localDir = localDirOf(request);
      const file = safePath(localDir, request.path);
      const info = statSync(file);
      if (info.size > 4 * 1024 * 1024) throw new Error('文件过大，无法在内置编辑器中打开。');
      const buffer = readFileSync(file);
      if (buffer.includes(0)) throw new Error('这是二进制文件，无法用文本编辑器打开。');
      return { text: buffer.toString('utf8'), mtimeMs: info.mtimeMs };
    }

    /** Save the editor buffer; refuses when the file changed underneath. */
    writeFile(request) {
      const localDir = localDirOf(request);
      const file = safePath(localDir, request.path);
      if (existsSync(file)) {
        const info = statSync(file);
        if (request.mtime_ms !== undefined && Math.abs(info.mtimeMs - request.mtime_ms) > 1) {
          throw new Error('文件已被其他程序修改，请重新打开后再保存。');
        }
      }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, request.text, { mode: 0o644 });
      return { mtimeMs: statSync(file).mtimeMs };
    }

    /** Compile the document the caller is looking at, or the guessed main file. */
    async compile(request, signal) {
      const localDir = localDirOf(request);
      const state = readProjectState(localDir);
      if (state === undefined) throw new Error('这个目录不是 Overleaf 工作区。');
      const mainFile = mainFileUnder(localDir, request.main_file);
      const client = runtime.createClient(state.server);
      const result = await runtime.compile(client, localDir, {
        signal,
        ...(mainFile !== undefined ? { mainFile } : {}),
      });
      return toRpcCompileResult(result);
    }
  }

  new OverleafUi(ctx);

  const server = z.object({ origin: z.string(), email: z.string(), loggedIn: z.boolean(), savedAt: z.string().nullable() });
  const project = z.object({ id: z.string(), name: z.string(), lastUpdated: z.string().nullable(),
    accessLevel: z.string().optional(), archived: z.boolean(), trashed: z.boolean() });
  const workspace = z.object({ localDir: z.string(), server: z.string(), projectId: z.string(),
    projectName: z.string(), openedAt: z.string().nullable(), bound: z.boolean() });
  /** A workspace named either directly by the panel or through a Sidebar tab's Session. */
  const target = z.object({ local_path: z.string().min(1).max(8192).optional(),
    session_id: z.string().min(1).max(256).optional() }).strict();

  const definitions = {
    list: { result: z.object({ servers: z.array(server), projects: z.array(project),
      workspaces: z.array(workspace), error: z.string(), primary: z.string() }) },
    login: { request: z.object({ base_url: z.string().min(1).max(512), cookie: z.string().min(1).max(8192) }).strict(),
      result: z.object({ origin: z.string(), email: z.string() }) },
    logout: { request: z.object({ base_url: z.string().min(1).max(512) }).strict(),
      result: z.object({ removed: z.boolean() }) },
    open: { request: z.object({ base_url: z.string().min(1).max(512), project_id: z.string().min(1).max(128),
      project_name: z.string().max(200), local_path: z.string().max(8192).optional() }).strict(),
      cancel: true, result: z.object({ localDir: z.string(), workspaceId: z.string().nullable() }) },
    compile: { request: target.extend({ main_file: z.string().min(1).max(4096).optional() }).strict(),
      cancel: true, result: z.object({ status: z.string(), pdfPath: z.string().nullable(),
        errors: z.array(z.object({ file: z.string().nullable(), line: z.number().nullable(), message: z.string() })),
        warnings: z.array(z.object({ message: z.string() })) }) },
    overview: { result: z.object({ servers: z.number(),
      workspaces: z.array(z.object({ localDir: z.string(), projectName: z.string(), server: z.string(),
        projectId: z.string(), bound: z.boolean(), phase: z.string(), paused: z.boolean(),
        collaborators: z.number(), pending: z.number(), error: z.string() })) }) },
    status: { request: z.object({ local_path: z.string().min(1).max(8192) }).strict(),
      result: z.object({ localDir: z.string(), projectId: z.string().optional(), projectName: z.string().optional(),
        server: z.string().optional(), phase: z.string(), paused: z.boolean(), collaborators: z.number(),
        joinedDocs: z.number(), pending: z.number(), flushing: z.boolean().optional(),
        inFlight: z.number().optional(), lastRemoteAt: z.string().nullable().optional(),
        lastPushAt: z.string().nullable().optional(), lastPushPath: z.string().nullable().optional(),
        pushError: z.string().optional(), pushErrorAt: z.string().nullable().optional(), error: z.string() }) },
    live: { request: target.extend({
      action: z.enum(['start', 'stop', 'pause', 'resume', 'flush', 'status']) }).strict(),
      result: z.object({ localDir: z.string(), projectId: z.string().optional(), projectName: z.string().optional(),
        server: z.string().optional(), phase: z.string(), paused: z.boolean(), collaborators: z.number(),
        joinedDocs: z.number(), pending: z.number(), flushing: z.boolean().optional(),
        inFlight: z.number().optional(), lastRemoteAt: z.string().nullable().optional(),
        lastPushAt: z.string().nullable().optional(), lastPushPath: z.string().nullable().optional(),
        pushError: z.string().optional(), pushErrorAt: z.string().nullable().optional(), error: z.string() }) },
    prepare: { request: target,
      result: z.object({ localDir: z.string(), bound: z.boolean(), mainFile: z.string().nullable(),
        hasPdf: z.boolean() }) },
    bound: { request: target, result: z.object({ bound: z.boolean() }) },
    createFile: { request: target.extend({ path: z.string().min(1).max(4096) }).strict(),
      result: z.object({ path: z.string() }) },
    createFolder: { request: target.extend({ path: z.string().min(1).max(4096) }).strict(),
      result: z.object({ path: z.string(), remote: z.boolean() }) },
    files: { request: target,
      result: z.object({ entries: z.array(z.object({ path: z.string(), type: z.enum(['file', 'folder']),
        size: z.number().optional() })) }) },
    readFile: { request: target.extend({ path: z.string().min(1).max(4096) }).strict(),
      result: z.object({ text: z.string(), mtimeMs: z.number() }) },
    writeFile: { request: target.extend({ path: z.string().min(1).max(4096),
      text: z.string(), mtime_ms: z.number().optional() }).strict(),
      result: z.object({ mtimeMs: z.number() }) },
  };

  const codec = (method, kind, schema) => ({ mode: 'strict',
    typeSymbol: `dsh-overleaf-workshop-ui#${method}:${kind}`, create: () => schema });
  ctx.typert.register({ package: 'dsh-overleaf-workshop-ui', face: 'host', schemas: [],
    invocations: Object.entries(definitions).map(([method, def]) => ({
      id: `dsh-overleaf-workshop-ui#overleafUi/${method}`, service: 'overleafUi', namespace: 'overleafUi', method,
      invocation: { kind: 'direct' }, parameters: def.request
        ? [{ name: 'request', wire: 'request', source: 'json', codec: codec(method, 'request', def.request) }] : [],
      ...(def.cancel ? { cancellation: { parameter: 'signal' } } : {}),
      result: codec(method, 'result', def.result),
    })), model: { services: [], events: [], objects: [] } });
}
