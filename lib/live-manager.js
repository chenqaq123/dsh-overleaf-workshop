/**
 * Owns one {@link OverleafLive} per opened workspace.
 *
 * The manager is what the plugin services, tools and panel talk to: it starts a
 * session when a project is opened, stops it on request or at plugin unload,
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
  }

  /** Start (or return) the live session for a workspace directory. */
  async start(localDir, { state: providedState } = {}) {
    localDir = normalizeLocal(localDir);
    const existing = this.sessions.get(localDir);
    if (existing !== undefined) {
      if (existing.phase === 'connected' || existing.phase === 'connecting') return existing.status;
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
    return { localDir, phase: 'idle', paused: false, collaborators: 0, joinedDocs: 0, pending: 0,
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

  /** Create a remote folder when a session is connected; local creation is the host's job. */
  createFolder(localDir, path) {
    localDir = normalizeLocal(localDir);
    const live = this.sessions.get(localDir);
    if (live === undefined) return Promise.resolve(false);
    return live.createFolder(path);
  }
}
