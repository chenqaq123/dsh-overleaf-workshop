/**
 * Owns one {@link OverleafLive} per opened workspace.
 *
 * The manager is what the plugin services, tools and panel talk to: it starts a
 * session on explicit connection request, stops it on request or at plugin unload,
 * and answers status queries even when no session is running.
 *
 * @module dsh-overleaf/live-manager
 */

import { OverleafLive } from './live.js';
import { normalizeLocal, readProjectState } from './store.js';

export class LiveManager {
  /**
   * @param options - the shared plugin runtime.
   */
  constructor({ runtime, log }) {
    this.runtime = runtime;
    this.log = typeof log === 'function' ? log : () => {};
    /** @type {Map<string, OverleafLive>} */
    this.sessions = new Map();
    /** Concurrent auto-open attempts must share one socket handshake. */
    this.pendingStarts = new Map();
  }

  /** Start (or return) the live session for a workspace directory. */
  async start(localDir, { state: providedState } = {}) {
    localDir = normalizeLocal(localDir);
    const pending = this.pendingStarts.get(localDir);
    if (pending !== undefined) return pending;
    const promise = (async () => {
      const existing = this.sessions.get(localDir);
      if (existing !== undefined) {
        if (existing.phase === 'connected' || existing.phase === 'connecting'
          || existing.phase === 'reconnecting') {
          return existing.status;
        }
        await existing.stop().catch(() => {});
        this.sessions.delete(localDir);
      }
      const state = providedState ?? readProjectState(localDir);
      if (state === undefined) throw new Error('这个目录不是 Overleaf 工作区（缺少 .overleaf/state.json）。');
      const live = new OverleafLive({ localDir, state,
        createClient: (server) => this.runtime.createClient(server), log: this.log });
      this.sessions.set(localDir, live);
      try {
        await live.start();
      } catch (error) {
        // A failed start must not leave a reconnect loop running in the background.
        await live.stop().catch(() => {});
        this.sessions.delete(localDir);
        throw error;
      }
      return live.status;
    })();
    this.pendingStarts.set(localDir, promise);
    try {
      return await promise;
    } finally {
      if (this.pendingStarts.get(localDir) === promise) this.pendingStarts.delete(localDir);
    }
  }

  /**
   * Seed a brand-new workspace over the realtime connection: join every
   * document, fetch binary fileRefs, and record the initial sync base.
   * Unlike a zip download this starts from the project's live tree, so the
   * first open has no separate archive request to wait for.
   */
  async bootstrap(localDir, state) {
    localDir = normalizeLocal(localDir);
    await this.start(localDir, { state });
    const live = this.sessions.get(localDir);
    if (live === undefined) throw new Error('实时连接尚未建立。');
    const hydrated = await live.hydrateMissingFiles();
    return { ...live.status, hydrated };
  }

  /** Stop a session; unknown directories are a no-op. */
  async stop(localDir) {
    localDir = normalizeLocal(localDir);
    const live = this.sessions.get(localDir);
    if (live === undefined) return undefined;
    this.sessions.delete(localDir);
    return live.stop();
  }

  async stopAll() {
    const all = [...this.sessions.entries()];
    this.sessions.clear();
    await Promise.all(all.map(([, live]) => live.stop().catch(() => {})));
  }

  /** A status object, whether or not a session is running. */
  status(localDir) {
    localDir = normalizeLocal(localDir);
    const live = this.sessions.get(localDir);
    if (live !== undefined) return live.status;
    const state = readProjectState(localDir);
    return { localDir, phase: 'idle', paused: false, collaborators: 0, joinedDocs: 0, pending: 0, conflicts: 0,
      projectId: state?.projectId, projectName: state?.projectName, server: state?.server, error: '' };
  }

  /** Pause/resume pushing local changes. */
  setPaused(localDir, paused) {
    localDir = normalizeLocal(localDir);
    const live = this.sessions.get(localDir);
    if (live === undefined) throw new Error('实时同步尚未启动。');
    return live.setPaused(paused);
  }

  /** Push pending local edits before an operation that reads the remote copy. */
  async flush(localDir) {
    localDir = normalizeLocal(localDir);
    const live = this.sessions.get(localDir);
    if (live === undefined) return this.status(localDir);
    return live.flushNow();
  }

  /**
   * Ensure the remote project reflects the complete local source tree before
   * compiling. Starting the live session also uploads changes made while sync
   * was stopped; a paused, failed, or still-pending push must stop the compile
   * instead of silently compiling an older server revision.
   */
  async ensureCurrent(localDir) {
    localDir = normalizeLocal(localDir);
    let status = this.status(localDir);
    if (status.phase !== 'connected') status = await this.start(localDir);
    status = await this.flush(localDir);
    if (status.paused) throw new Error('实时同步的自动推送已暂停，无法保证编译使用最新源码。');
    if (status.pushError) throw new Error(`本地改动尚未同步到 Overleaf：${status.pushError}`);
    if (status.phase !== 'connected') throw new Error('实时同步尚未连接，无法保证编译使用最新源码。');
    if ((status.pending ?? 0) > 0 || (status.inFlight ?? 0) > 0 || status.flushing === true) {
      throw new Error('本地改动仍在同步，请稍候再编译。');
    }
    return status;
  }

  /** Create a remote folder when a session is connected; local creation is the host's job. */
  createFolder(localDir, path) {
    localDir = normalizeLocal(localDir);
    const live = this.sessions.get(localDir);
    if (live === undefined) return Promise.resolve(false);
    return live.createFolder(path);
  }
}
