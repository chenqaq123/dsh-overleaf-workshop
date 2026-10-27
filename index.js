/**
 * dsh-overleaf-workshop — open Overleaf projects as local DSH workspaces.
 *
 * An Overleaf workspace is a plain local directory, seeded on first open from
 * the live project tree (with a zip fallback), so the harness's normal
 * `read`/`write`/`edit`/`glob`/`grep`/`bash` tools, the sidebar file tree and
 * the built-in PDF preview all work unchanged. The plugin adds what
 * Overleaf-specific flows need: a session store for the server cookie, a panel
 * for login and opening projects, and four agent tools (`overleaf_status`,
 * `overleaf_pull`, `overleaf_push`, `overleaf_compile`) that sync the directory
 * and compile on the server.
 *
 * The plugin deliberately does not touch `ctx.fs` or `ctx.shell`, so it can be
 * installed alongside the SSH remote plugin.
 *
 * @module dsh-overleaf-workshop
 */

import { homedir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadHostModules } from './lib/host-modules.js';
import { CookieExpiredError, OverleafClient } from './lib/api.js';
import { compileProject } from './lib/compile.js';
import { SecretStore } from './lib/secrets.js';
import { OverleafSync, applyZip } from './lib/sync.js';
import { LiveManager } from './lib/live-manager.js';
import { ProjectTable, defaultLocalDir, normalizeLocal, readProjectState as readStateOf, writeProjectState as writeStateOf } from './lib/store.js';
import { registerOverleafTools } from './lib/tools.js';
import { registerOverleafUi } from './ui/host.js';

/** Load the harness seam classes once, before the plugin is instantiated. */
const host = await loadHostModules();

export const name = 'overleaf';
export const inject = ['tools'];

/** Defaults for every configuration key. */
function defaults() {
  return {
    mirrorRoot: join(dshHome(), 'overleaf', 'projects'),
    storageFile: join(dshHome(), 'overleaf', 'projects.json'),
    secretsFile: join(dshHome(), 'overleaf', 'secrets.json'),
    defaultServer: 'https://www.overleaf.com',
  };
}

function asAbsolute(value, fallback, key) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw new Error(`overleaf: config.${key} must be an absolute path`);
  }
  return value;
}

/**
 * Validate and normalize the plugin configuration.
 * @param raw - the config object supplied by the loader.
 * @returns the resolved configuration.
 */
export function resolveConfig(raw) {
  const fallback = defaults();
  const config = { ...fallback, ...(raw ?? {}) };
  for (const key of ['mirrorRoot', 'storageFile', 'secretsFile']) {
    config[key] = asAbsolute(config[key], fallback[key], key);
  }
  if (typeof config.defaultServer !== 'string' || config.defaultServer.length === 0) {
    throw new Error('overleaf: config.defaultServer must be a non-empty string');
  }
  return config;
}

/** The plugin home directory, used for persistence and the project mirror. */
function dshHome() {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh');
}

/**
 * Mount the Overleaf world.
 * @param ctx - the plugin's cordis context.
 * @param rawConfig - deployment configuration.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  const secrets = new SecretStore({ file: config.secretsFile,
    warn: message => ctx.logger?.warn?.('overleaf: %s', message) });
  const projectTable = new ProjectTable({ storageFile: config.storageFile,
    warn: message => ctx.logger?.warn?.('overleaf: %s', message) });

  const runtime = { ctx, config, secrets, projectTable };

  /** Build a client for a server origin from the stored session. */
  runtime.createClient = (server) => {
    const session = secrets.get(server);
    if (session === undefined) throw new CookieExpiredError();
    return new OverleafClient({ baseUrl: server, cookies: session.cookies,
      csrfToken: session.csrfToken, userId: session.userId, email: session.email });
  };
  runtime.sync = new OverleafSync({ createClient: runtime.createClient,
    warn: message => ctx.logger?.warn?.('overleaf: %s', message) });
  runtime.compile = compileProject;
  runtime.live = new LiveManager({ runtime,
    log: message => ctx.logger?.info?.('overleaf: %s', message) });
  ctx.effect(() => () => { void runtime.live.stopAll(); }, 'overleaf-live');

  registerOverleafTools(ctx, host, runtime);
  new OverleafService(ctx, runtime);
  ctx.inject(['typert', 'overleaf'], (scope) => registerOverleafUi(scope, host, runtime));
  ctx.logger?.info?.('overleaf: ready — %d server(s) with a session, %d opened project(s), mirror %s',
    secrets.list().length, projectTable.list().length, config.mirrorRoot);
}

/**
 * `ctx.overleaf` — the plugin's operational handle for host code and other plugins.
 */
class OverleafService extends host.cordis.Service {
  constructor(ctx, runtime) {
    super(ctx, 'overleaf');
    this.pluginCtx = ctx;
    this.runtime = runtime;
    this.secrets = runtime.secrets;
    this.projects = runtime.projectTable;
    this.config = runtime.config;
  }

  /** A client for one server; throws CookieExpiredError when no session is stored. */
  createClient(server) {
    return this.runtime.createClient(server);
  }

  /**
   * Open (or re-open) a project as a local workspace.
   * @param options - server origin, project id/name, optional local directory.
   * @returns the directory and the registered workspace id.
   */
  async openProject({ server, projectId, projectName, localDir }, { signal } = {}) {
    const dir = normalizeLocal(localDir ?? defaultLocalDir(this.config.mirrorRoot, projectName, projectId));
    const existing = readStateOf(dir);
    const state = existing ?? { version: 1, server, projectId, projectName, files: {} };
    if (existing !== undefined && (existing.projectId !== projectId || existing.server !== server)) {
      throw new Error('这个本地目录已经是其他 Overleaf 项目的工作区。');
    }
    const firstOpen = existing === undefined;
    if (firstOpen) mkdirSync(dir, { recursive: true, mode: 0o755 });
    let liveStarted = false;
    if (firstOpen) {
      // Seed from the live project tree: join the docs and fetch binary
      // fileRefs, instead of downloading and unzipping the whole project.
      try {
        const bootstrapped = await this.runtime.live.bootstrap(dir, state);
        const { hydrated } = bootstrapped;
        if (hydrated.failed.length > 0 || hydrated.failedDocs.length > 0 || hydrated.missingDocs > 0) {
          throw new Error(`${hydrated.failed.length + hydrated.failedDocs.length + hydrated.missingDocs} 个文件未能完整拉取`);
        }
        liveStarted = true;
      } catch (error) {
        this.pluginCtx?.logger?.warn?.('overleaf: live bootstrap failed for %s (%s); falling back to zip',
          dir, error?.message ?? error);
        await this.runtime.live.stop(dir).catch(() => {});
        // stop() persists a state file when it believes the tree was synced.
        // Remove it before the fallback so a failed zip leaves no half-seeded
        // workspace that a later open would mistake for complete.
        rmSync(join(dir, '.overleaf', 'state.json'), { force: true });
        const client = this.createClient(server);
        const entries = await client.downloadZip(projectId, { signal });
        const { files } = applyZip(dir, state, entries);
        state.files = files;
        state.pulledAt = new Date().toISOString();
        writeStateOf(dir, state);
      }
    }
    const workspace = await this.ensureWorkspace(dir);
    this.projects.put({ localDir: dir, server, projectId, projectName: state.projectName ?? projectName,
      openedAt: new Date().toISOString() });
    // Real-time sync starts with the project; a failure here must not block
    // opening the workspace (the snapshot pull/push tools stay available).
    if (!liveStarted) {
      await this.runtime.live.start(dir).catch((error) => {
        this.pluginCtx?.logger?.warn?.('overleaf: live sync did not start for %s: %s', dir, error?.message ?? error);
      });
    }
    return { localDir: dir, workspaceId: workspace?.id };
  }

  /**
   * Register the directory as a harness workspace, or reuse the existing one.
   * Without this the panel cannot open a session for a brand-new directory.
   */
  async ensureWorkspace(dir) {
    const registry = this.pluginCtx?.get?.('workspaceRegistry');
    if (registry === undefined) return undefined;
    const existing = registry.list().find((workspace) => workspace.path === dir);
    if (existing !== undefined) return existing;
    return registry.create(dir);
  }
}
