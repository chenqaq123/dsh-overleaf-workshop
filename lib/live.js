/**
 * One live Overleaf workspace: keeps the local directory and the remote project
 * in two-way sync over the realtime socket.
 *
 * Local file changes become OT updates for documents and uploads for binary
 * refs; remote OT updates are merged into the file on disk; remote tree events
 * are mirrored into the directory. The local directory remains a normal
 * workspace — the agent's file tools and any external editor keep working.
 *
 * All disk writes we perform ourselves are reconciled through the document
 * model, so the watcher firing on our own write is a no-op rather than a loop.
 *
 * @module dsh-overleaf/live
 */

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { OverleafError, blobHash } from './api.js';
import { DocumentModel, ReceiveResult, parseJoinAck } from './documents.js';
import { flattenTree } from './realtime.js';
import { RealtimeSocket } from './socket.js';
import { isIgnoredPath, readProjectState, writeProjectState } from './store.js';

const MAX_JOINED_DOCS = 300;
const FLUSH_DEBOUNCE_MS = 250;
const HASH_THROTTLE_MS = 5000;
const MAX_RECONNECTS = 6;
/** How long `stop()` may spend pushing the edits still inside the debounce window. */
const STOP_SETTLE_MS = 4000;
/** fs.watch reports asynchronously; stop() waits this long for a just-made write. */
const WATCH_GRACE_MS = 120;
/** The server's op-less echo normally takes one poll round trip; past this it is lost. */
const ECHO_TIMEOUT_MS = 5000;

const sleep = (ms) => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const sha1 = (data) => createHash('sha1').update(data).digest('hex');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Count the people in `clientTracking.getConnectedUsers`.
 *
 * Overleaf replies with a nested payload such as `[null, [user, user]]`, and a
 * user can appear once per open client. Counting array entries made one person
 * look like two collaborators; count unique identities instead.
 *
 * @param payload - the socket event's ack value.
 * @returns the number of distinct connected users.
 */
export function connectedCollaborators(payload) {
  const people = [];
  const collect = (value) => {
    if (Array.isArray(value)) { for (const item of value) collect(item); return; }
    if (value !== null && typeof value === 'object') people.push(value);
  };
  collect(payload);
  const identities = new Set();
  for (const person of people) {
    if (person.connected === false) continue;
    const identity = person.user_id ?? person.id ?? person.client_id;
    if (identity !== undefined && identity !== null) identities.add(String(identity));
  }
  return identities.size;
}

export class OverleafLive {
  /**
   * @param options - local directory, project state, HTTP client factory, logger.
   */
  constructor({ localDir, state, createClient, log, echoTimeoutMs = ECHO_TIMEOUT_MS }) {
    this.localDir = localDir;
    this.state = state;
    this.createClient = createClient;
    this.log = typeof log === 'function' ? log : () => {};
    this.echoTimeoutMs = echoTimeoutMs;
    /** @type {'idle'|'connecting'|'connected'|'reconnecting'|'stopped'|'error'} */
    this.phase = 'idle';
    this.error = '';
    this.paused = false;
    this.collaborators = 0;
    this.lastRemoteAt = undefined;
    this.lastPushAt = undefined;
    /** docId -> DocumentModel */
    this.docs = new Map();
    /** entityId -> {id, type, path} */
    this.entities = new Map();
    /** path -> entity */
    this.byPath = new Map();
    /** project-relative path -> hash of the last binary content we synced */
    this.binaryHashes = new Map();
    /** Paths changed on disk, awaiting the debounced flush. */
    this.pending = new Set();
    this.timer = undefined;
    this.flushing = false;
    this.reconnectAttempts = 0;
    this.closedByUs = false;
    this.treeReady = false;
  }

  /** The socket's client id, when the server told us. */
  get status() {
    return {
      localDir: this.localDir,
      projectId: this.state.projectId,
      projectName: this.state.projectName,
      server: this.state.server,
      phase: this.phase,
      paused: this.paused,
      collaborators: this.collaborators,
      joinedDocs: this.docs.size,
      pending: this.pending.size,
      lastRemoteAt: this.lastRemoteAt,
      lastPushAt: this.lastPushAt,
      error: this.error,
    };
  }

  get client() {
    return this.createClient(this.state.server);
  }

  /** Connect and start syncing. Idempotent. */
  async start() {
    if (this.phase === 'connected' || this.phase === 'connecting') return this.status;
    this.closedByUs = false;
    this.reconnectAttempts = 0;
    await this.connect();
    return this.status;
  }

  async connect() {
    this.phase = this.phase === 'connected' ? 'reconnecting' : 'connecting';
    this.error = '';
    let socket;
    try {
      socket = new RealtimeSocket({ client: this.client, projectId: this.state.projectId,
        log: this.log });
      // Keep the socket reachable while the handshake is pending so stop()
      // can abort a cancelled/opening workspace cleanly.
      this.socket = socket;
      const joined = await socket.connect();
      this.socketId = joined.publicId;
      this.bindSocket(socket);
      await this.adoptTree(joined.project);
      this.startWatcher();
      this.startPresencePoll();
      this.phase = 'connected';
      this.reconnectAttempts = 0;
      this.log(`overleaf: live sync connected for ${this.localDir} (${this.docs.size} docs)`);
      return joined;
    } catch (error) {
      if (this.socket === socket) {
        await socket?.close().catch(() => {});
        this.socket = undefined;
      }
      this.phase = 'error';
      this.error = error?.message ?? String(error);
      this.scheduleReconnect();
      throw error;
    }
  }

  bindSocket(socket) {
    // Packets arrive in order, but every handler awaits disk and network work.
    // Chaining them keeps two handlers from interleaving on the same document.
    const serial = (handler) => (...args) => {
      this.events = (this.events ?? Promise.resolve())
        .then(() => handler(...args))
        .catch((error) => this.log(`overleaf: live event failed: ${error?.message ?? error}`));
    };
    socket.on('otUpdateApplied', serial((update) => this.onRemoteUpdate(update)));
    socket.on('reciveNewDoc', serial((folderId, doc) => this.onNewDoc(folderId, doc)));
    socket.on('reciveNewFile', serial((folderId, file) => this.onNewFile(folderId, file)));
    socket.on('reciveNewFolder', serial((folderId, folder) => this.onNewFolder(folderId, folder)));
    socket.on('reciveEntityRename', serial((entityId, name) => this.onRename(entityId, name)));
    socket.on('reciveEntityMove', serial((entityId, folderId) => this.onMove(entityId, folderId)));
    socket.on('removeEntity', serial((entityId) => this.onRemove(entityId)));
    socket.on('disconnect', (reason) => {
      if (this.closedByUs) return;
      this.phase = 'reconnecting';
      this.log(`overleaf: live socket disconnected (${reason ?? 'unknown'}); reconnecting`);
      this.scheduleReconnect();
    });
    socket.on('error', (error) => {
      this.error = error?.message ?? String(error);
      this.log(`overleaf: live socket error: ${this.error}`);
    });
  }

  scheduleReconnect() {
    if (this.closedByUs || this.reconnectTimer !== undefined || this.phase === 'connected') return;
    if (this.reconnectAttempts >= MAX_RECONNECTS) {
      this.phase = 'error';
      this.error ||= '实时连接多次重连失败';
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 16_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch((error) => this.log(`overleaf: reconnect failed: ${error?.message ?? error}`));
    }, delay);
  }

  /** Stop syncing and close the socket. */
  async stop() {
    this.closedByUs = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.timer);
    this.timer = undefined;
    this.stopPresencePoll();
    // Edits typed inside the debounce window, and updates still awaiting their
    // echo, are local to this session: push them before the socket goes away.
    const synced = await this.settleBeforeStop();
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const model of this.docs.values()) {
      clearTimeout(model.echoTimer);
      model.echoTimer = undefined;
    }
    if (this.watcher !== undefined) { this.watcher.close(); this.watcher = undefined; }
    for (const watcher of this.watchers?.values() ?? []) watcher.close();
    this.watchers?.clear();
    await this.socket?.close().catch(() => {});
    this.socket = undefined;
    this.phase = 'stopped';
    // Only claim the disk equals the server when it does. Persisting state
    // after a failed or paused settle would make overleaf_status report the
    // unpushed edits as already synced, and the next push would skip them.
    if (synced) this.persistState();
    return this.status;
  }

  /**
   * Push everything still queued locally and wait for the pending echoes.
   * @returns whether the local tree is known to match the server afterwards.
   */
  async settleBeforeStop() {
    if (this.phase !== 'connected' || this.paused) return false;
    const deadline = Date.now() + STOP_SETTLE_MS;
    try {
      // The write that preceded stop() may not have reached the watcher yet;
      // the pending set alone would let it look settled.
      await sleep(WATCH_GRACE_MS);
      for (const path of this.unsyncedPaths()) this.pending.add(path);
      while (Date.now() < deadline) {
        const inFlight = [...this.docs.values()].some((model) => model.inFlight);
        if (this.flushing) { await sleep(25); continue; }
        if (this.pending.size > 0) {
          await Promise.race([this.flush(), sleep(Math.min(500, Math.max(25, deadline - Date.now())))]);
          continue;
        }
        if (!inFlight) return true;
        await sleep(25);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Paths whose disk content the document model and binary hashes do not
   * consider pushed yet. Used by `stop()`, which cannot rely on the watcher.
   */
  unsyncedPaths() {
    const dirty = new Set();
    for (const entity of this.byPath.values()) {
      if (entity.type === 'folder') continue;
      const file = this.fileOf(entity.path);
      if (!existsSync(file)) continue;
      if (entity.type === 'doc') {
        const model = this.docs.get(entity.id);
        if (model !== undefined && readFileSync(file, 'utf8') !== model.baseText) dirty.add(entity.path);
      } else if (this.binaryHashes.get(entity.path) !== sha256(readFileSync(file))) {
        dirty.add(entity.path);
      }
    }
    return dirty;
  }

  /** Toggle pushing local changes (remote changes keep arriving). */
  setPaused(paused) {
    const wasPaused = this.paused;
    this.paused = paused === true;
    if (wasPaused && !this.paused && this.pending.size > 0 && this.timer === undefined) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, FLUSH_DEBOUNCE_MS);
    }
    return this.status;
  }

  // ---------------------------------------------------------------- tree sync

  async adoptTree(project) {
    if (project?.rootFolder === undefined) throw new OverleafError('实时连接没有返回项目文件树');
    const { files, folders } = flattenTree(project);
    const rootId = folders.get('');
    this.rootFolderId = rootId;

    const nextEntities = new Map();
    const nextByPath = new Map();
    for (const [path, folderId] of folders) {
      if (path === '') continue;
      const entity = { id: folderId, type: 'folder', path };
      nextEntities.set(folderId, entity);
      nextByPath.set(path, entity);
    }
    for (const [path, info] of files) {
      const entity = { id: info.id, type: info.type, path };
      nextEntities.set(info.id, entity);
      nextByPath.set(path, entity);
    }
    this.reconcileTree(nextEntities);
    this.entities = nextEntities;
    this.byPath = nextByPath;
    this.binaryHashes.clear();
    for (const entity of this.entities.values()) {
      if (entity.type === 'file' && existsSync(this.fileOf(entity.path))) {
        this.binaryHashes.set(entity.path, sha256(readFileSync(this.fileOf(entity.path))));
      }
    }
    this.treeReady = true;

    const docs = [...files].filter(([, info]) => info.type === 'doc');
    let joined = 0;
    for (const [path, info] of docs) {
      if (joined >= MAX_JOINED_DOCS) break;
      await this.joinDoc(info.id, path).catch((error) => {
        this.log(`overleaf: could not join ${path}: ${error?.message ?? error}`);
      });
      joined += 1;
    }
  }

  /** Join one document and reconcile it with the file on disk. */
  async joinDoc(docId, path) {
    const existing = this.docs.get(docId);
    const previousBase = existing?.baseText;
    const localFile = this.fileOf(path);
    const localBefore = existsSync(localFile) ? readFileSync(localFile, 'utf8') : undefined;
    const { lines, version } = parseJoinAck(
      await this.socket.emit('joinDoc', docId, { encodeRanges: true }));
    let model = existing;
    if (model === undefined) {
      model = new DocumentModel({ docId, path });
      this.docs.set(docId, model);
    } else {
      model.path = path;
    }
    model.join(lines, version);
    clearTimeout(model.echoTimer);
    model.echoTimer = undefined;
    const recorded = this.state.files?.[path]?.base;
    const localBytes = localBefore === undefined ? undefined : Buffer.from(localBefore, 'utf8');
    const localMatchesBase = localBefore !== undefined && (
      previousBase !== undefined ? localBefore === previousBase
        : sha256(localBytes) === recorded || (recorded?.length === 40 && sha1(localBytes) === recorded));
    if (localMatchesBase) {
      await this.reconcile(model, { preferRemote: true });
    } else {
      if (previousBase !== undefined && localBefore !== undefined) model.baseText = previousBase;
      await this.reconcile(model);
    }
    return model;
  }

  /** Write the model's text into the file when the disk diverged from it. */
  async reconcile(model, { preferRemote = false } = {}) {
    const file = this.fileOf(model.path);
    if (!existsSync(file)) {
      // Nothing on disk yet (new remote doc): materialize the server text.
      this.writeText(model.path, model.remoteText);
      model.baseText = model.remoteText;
      return { text: model.remoteText, write: true, send: false, conflict: false };
    }
    const localText = readFileSync(file, 'utf8');
    if (preferRemote) {
      model.baseText = model.remoteText;
      if (localText !== model.remoteText) this.writeText(model.path, model.remoteText);
      return { text: model.remoteText, write: localText !== model.remoteText, send: false, conflict: false };
    }
    if (this.paused) {
      if (localText === model.remoteText) {
        model.baseText = localText;
      } else if (localText === model.baseText) {
        model.baseText = model.remoteText;
        this.writeText(model.path, model.remoteText);
      }
      return { text: localText, write: false, send: false, conflict: false };
    }
    if (model.inFlight) {
      // Our own update is still unacknowledged: computing a second op now would
      // use the same version. Merge the local text after the echo instead.
      this.queueModel(model);
      return { text: localText, write: false, send: false, conflict: false };
    }
    const plan = model.planWrite(localText);
    if (plan.write) this.writeText(model.path, plan.text);
    if (plan.send) await this.pushUpdate(model, plan.update, plan.text);
    return plan;
  }

  /** Remember a document whose local changes must wait for its pending echo. */
  queueModel(model) {
    if (this.queued === undefined) this.queued = new Map();
    this.queued.set(model.docId, true);
  }

  async onRemoteUpdate(update) {
    try {
      const model = this.docs.get(update?.doc);
      if (model === undefined) return;
      const result = model.receive(update);
      if (!model.inFlight) {
        clearTimeout(model.echoTimer);
        model.echoTimer = undefined;
      }
      if (result === ReceiveResult.REJOIN) {
        await this.joinDoc(model.docId, model.path).catch((error) => {
          this.log(`overleaf: re-join ${model.path} failed: ${error?.message ?? error}`);
        });
        return;
      }
      if (result === ReceiveResult.APPLIED) {
        this.lastRemoteAt = new Date().toISOString();
        await this.reconcile(model);
        return;
      }
      if (result === ReceiveResult.ACK) await this.flushPending(model);
    } catch (error) {
      this.log(`overleaf: remote document update failed: ${error?.message ?? error}`);
    }
  }

  /** Send one update; failures leave the doc for a re-join on the next event. */
  async pushUpdate(model, update, text) {
    if (this.paused) return;
    if (update === undefined) return;
    const now = Date.now();
    if (text !== undefined && now - model.lastHashAt > HASH_THROTTLE_MS) {
      update.hash = blobHash(text);
      model.lastHashAt = now;
    }
    const version = model.version;
    try {
      model.markWritten(text);
      const ack = await this.socket.emit('applyOtUpdate', model.docId, update);
      if (Array.isArray(ack) && ack[0]?.error !== undefined) {
        throw new OverleafError(`Overleaf 拒绝了 ${model.path} 的更新：${ack[0].error}`);
      }
      this.lastPushAt = new Date().toISOString();
      this.awaitEcho(model, version);
    } catch (error) {
      model.resetForRejoin();
      // planWrite optimistically moved the model to the text that failed. Make
      // the next join treat the current disk text as a new local edit instead
      // of silently preferring the stale server copy.
      model.baseText = undefined;
      this.log(`overleaf: push to ${model.path} failed: ${error?.message ?? error}`);
      await this.joinDoc(model.docId, model.path).catch(() => {});
    }
  }

  /**
   * The server acknowledges a write without an op and bumps the version; until
   * that echo lands the document is "in flight" and later edits queue behind
   * it. A dropped echo would strand those edits forever, so fall back to a
   * re-join once one fails to arrive.
   */
  awaitEcho(model, version) {
    clearTimeout(model.echoTimer);
    model.echoTimer = setTimeout(() => {
      model.echoTimer = undefined;
      if (!model.inFlight || model.version !== version) return;
      this.log(`overleaf: ${model.path} was never acknowledged; re-joining`);
      void this.joinDoc(model.docId, model.path).catch((error) => {
        this.log(`overleaf: re-join ${model.path} failed: ${error?.message ?? error}`);
      });
    }, this.echoTimeoutMs);
    model.echoTimer.unref?.();
  }

  async flushPending(model) {
    const queued = this.queued?.get(model.docId);
    if (queued === undefined) return;
    this.queued.delete(model.docId);
    const file = this.fileOf(model.path);
    if (!existsSync(file)) return;
    const plan = model.planWrite(readFileSync(file, 'utf8'));
    if (plan.write) this.writeText(model.path, plan.text);
    if (plan.send) await this.pushUpdate(model, plan.update, plan.text);
  }

  // -------------------------------------------------------------- local watch

  startWatcher() {
    if (this.watcher !== undefined || (this.watchers?.size ?? 0) > 0) return;
    try {
      this.watcher = watch(this.localDir, { recursive: true }, (_event, filename) => {
        this.noteLocalChange(filename);
      });
    } catch (error) {
      // Older Node releases on Linux do not implement recursive fs.watch.
      // Keep the plugin usable there by watching each directory separately.
      try {
        this.startFlatWatcher();
      } catch (fallbackError) {
        this.log(`overleaf: cannot watch ${this.localDir}: ${fallbackError?.message ?? error}`);
      }
    }
  }

  noteLocalChange(filename, prefix = '') {
    if (filename === null || filename === undefined) return;
    const name = String(filename).split(sep).join('/');
    const path = prefix.length === 0 ? name : `${prefix}/${name}`;
    if (path.length === 0 || isIgnoredPath(path) || path.startsWith('.overleaf/')) return;
    this.pending.add(path);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, FLUSH_DEBOUNCE_MS);
    if ((this.watchers?.size ?? 0) > 0) this.refreshFlatWatchers();
  }

  startFlatWatcher() {
    this.watchers = new Map();
    this.refreshFlatWatchers();
  }

  refreshFlatWatchers() {
    if (this.watchers === undefined) return;
    const directories = new Map();
    const walk = (dir, prefix) => {
      directories.set(dir, prefix);
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
        if (!entry.isDirectory() || isIgnoredPath(path)) continue;
        walk(join(dir, entry.name), path);
      }
    };
    try { walk(this.localDir, ''); } catch { return; }
    for (const [dir, watcher] of this.watchers) {
      if (!directories.has(dir)) { watcher.close(); this.watchers.delete(dir); }
    }
    for (const [dir, prefix] of directories) {
      if (this.watchers.has(dir)) continue;
      try {
        const watcher = watch(dir, (_event, filename) => this.noteLocalChange(filename, prefix));
        this.watchers.set(dir, watcher);
      } catch (error) {
        this.log(`overleaf: cannot watch ${dir}: ${error?.message ?? error}`);
      }
    }
  }

  /**
   * Push everything that differs from the synced model and wait briefly for
   * the server echoes. Used before compiling, so the compile sees the text the
   * user just saved rather than the previous revision.
   */
  async flushNow() {
    if (this.phase !== 'connected' || this.paused) return this.status;
    // A write made just before this call may not have reached fs.watch yet.
    await sleep(WATCH_GRACE_MS);
    for (const path of this.unsyncedPaths()) this.pending.add(path);
    await this.flush();
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const inFlight = [...this.docs.values()].some((model) => model.inFlight);
      if (!this.flushing && this.pending.size === 0 && !inFlight) break;
      await sleep(25);
    }
    return this.status;
  }

  /** Push every local change collected by the debounce window. */
  async flush() {    if (this.flushing || this.paused) return;
    this.flushing = true;
    const paths = [...this.pending];
    this.pending.clear();
    try {
      for (const path of paths) await this.flushPath(path);
    } finally {
      this.flushing = false;
    }
    if (this.pending.size > 0 && this.timer === undefined) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, FLUSH_DEBOUNCE_MS);
    }
  }

  async flushPath(path) {
    const file = this.fileOf(path);
    const entity = this.byPath.get(path);
    const exists = existsSync(file);
    if (!exists) {
      if (entity === undefined) return;
      await this.removeRemote(entity);
      return;
    }
    if (statSync(file).isDirectory()) {
      // A new local folder is not a file to upload. Create the matching remote
      // folder so empty folders sync too; before this check readFileSync(dir)
      // threw EISDIR and aborted the whole flush.
      if (entity?.type !== 'folder' && !this.paused
        && this.phase === 'connected' && this.socket !== undefined) {
        await this.ensureFolder(path);
      }
      return;
    }
    if (entity?.type === 'folder') return;

    if (entity?.type === 'doc') {
      const model = this.docs.get(entity.id) ?? await this.joinDoc(entity.id, path);
      if (model.inFlight) {
        this.queueModel(model);
        return;
      }
      const plan = model.planWrite(readFileSync(file, 'utf8'));
      if (plan.write) this.writeText(path, plan.text);
      if (plan.send) await this.pushUpdate(model, plan.update, plan.text);
      if (plan.conflict) this.log(`overleaf: merge conflict resolved locally in ${path}`);
      return;
    }

    if (entity?.type === 'file') {
      const data = readFileSync(file);
      const hash = sha256(data);
      if (this.binaryHashes.get(path) === hash) return;
      await this.replaceRemoteFile(entity, path, data);
      this.binaryHashes.set(path, hash);
      return;
    }

    // A file that does not exist remotely yet: upload creates doc or fileRef.
    const data = readFileSync(file);
    await this.createRemoteFile(path, data);
  }

  async createRemoteFile(path, data) {
    if (this.paused || this.socket === undefined) return;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const folderId = await this.ensureFolder(parentPath);
    const response = await this.client.uploadFile(this.state.projectId, folderId, basename(path), data);
    const id = response?.entity_id;
    if (id === undefined) return;
    const entity = { id, type: response.entity_type === 'doc' ? 'doc' : 'file', path };
    this.entities.set(id, entity);
    this.byPath.set(path, entity);
    if (entity.type === 'doc') {
      await this.joinDoc(id, path).catch(() => {});
    } else {
      this.binaryHashes.set(path, sha256(data));
    }
    this.lastPushAt = new Date().toISOString();
  }

  async replaceRemoteFile(entity, path, data) {
    if (this.paused) return;
    await this.client.mutate('DELETE', `/project/${encodeURIComponent(this.state.projectId)}/file/${entity.id}`)
      .catch(() => {});
    this.entities.delete(entity.id);
    this.byPath.delete(path);
    await this.createRemoteFile(path, data);
  }

  async removeRemote(entity) {
    if (this.paused) return;
    const prefix = entity.path;
    const removed = [...this.entities.values()].filter((candidate) => candidate.path === prefix
      || candidate.path.startsWith(`${prefix}/`));
    for (const candidate of removed) {
      this.entities.delete(candidate.id);
      this.byPath.delete(candidate.path);
      this.docs.delete(candidate.id);
      this.binaryHashes.delete(candidate.path);
    }
    await this.client.mutate('DELETE',
      `/project/${encodeURIComponent(this.state.projectId)}/${entity.type}/${entity.id}`).catch(() => {});
    this.lastPushAt = new Date().toISOString();
  }

  /** Create a folder locally and, when connected, its remote counterpart. */
  async createFolder(path) {
    const rel = String(path ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/gu, '');
    if (rel.length === 0 || isIgnoredPath(rel) || rel.startsWith('.overleaf')) return false;
    mkdirSync(this.fileOf(rel), { recursive: true });
    if (this.byPath.get(rel)?.type === 'folder') return true;
    if (this.phase !== 'connected' || this.socket === undefined) return false;
    await this.ensureFolder(rel);
    return this.byPath.get(rel)?.type === 'folder';
  }

  /** The remote folder id for a project-relative directory, creating it if needed. */
  async ensureFolder(path) {
    if (path === '') return this.rootFolderId;
    const existing = this.byPath.get(path);
    if (existing?.type === 'folder') return existing.id;
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parentId = await this.ensureFolder(parentPath);
    const response = await this.client.mutate('POST',
      `/project/${encodeURIComponent(this.state.projectId)}/folder`,
      { body: { name: basename(path), parent_folder_id: parentId } }).catch(() => undefined);
    const id = response?._id;
    if (id === undefined) return parentId;
    const entity = { id, type: 'folder', path };
    this.entities.set(id, entity);
    this.byPath.set(path, entity);
    return id;
  }

  // ------------------------------------------------------------- remote tree

  async onNewDoc(folderId, doc) {
    const parent = this.entities.get(folderId);
    const path = joinPath(parent?.path ?? '', doc.name);
    const entity = { id: doc._id, type: 'doc', path };
    this.entities.set(entity.id, entity);
    this.byPath.set(path, entity);
    await this.joinDoc(entity.id, path).catch((error) => {
      this.log(`overleaf: new doc ${path} failed to sync: ${error?.message ?? error}`);
    });
  }

  async onNewFile(folderId, fileRef) {
    const parent = this.entities.get(folderId);
    const path = joinPath(parent?.path ?? '', fileRef.name);
    const entity = { id: fileRef._id, type: 'file', path };
    this.entities.set(entity.id, entity);
    this.byPath.set(path, entity);
    const data = await this.client.fetchFile(this.state.projectId, entity.id).catch(() => undefined);
    if (data !== undefined) {
      this.writeBytes(path, data);
      this.binaryHashes.set(path, sha256(data));
    }
  }

  async onNewFolder(folderId, folder) {
    const parent = this.entities.get(folderId);
    const path = joinPath(parent?.path ?? '', folder.name);
    const entity = { id: folder._id, type: 'folder', path };
    this.entities.set(entity.id, entity);
    this.byPath.set(path, entity);
    mkdirSync(this.fileOf(path), { recursive: true });
    for (const doc of folder.docs ?? []) await this.onNewDoc(folder._id, doc);
    for (const file of folder.fileRefs ?? []) await this.onNewFile(folder._id, file);
    for (const child of folder.folders ?? []) await this.onNewFolder(folder._id, child);
  }

  onRename(entityId, name) {
    const entity = this.entities.get(entityId);
    if (entity === undefined) return;
    const parentPath = entity.path.includes('/') ? entity.path.slice(0, entity.path.lastIndexOf('/')) : '';
    const nextPath = joinPath(parentPath, name);
    this.updateSubtreePath(entity, nextPath);
  }

  onMove(entityId, folderId) {
    const entity = this.entities.get(entityId);
    if (entity === undefined) return;
    const parent = this.entities.get(folderId);
    const nextPath = joinPath(parent?.path ?? '', basename(entity.path));
    this.updateSubtreePath(entity, nextPath);
  }

  onRemove(entityId) {
    const entity = this.entities.get(entityId);
    if (entity === undefined) return;
    const prefix = entity.path;
    const removed = [...this.entities.values()].filter((candidate) => candidate.path === prefix
      || candidate.path.startsWith(`${prefix}/`));
    for (const candidate of removed) {
      this.entities.delete(candidate.id);
      this.byPath.delete(candidate.path);
      this.docs.delete(candidate.id);
      this.binaryHashes.delete(candidate.path);
    }
    rmSync(this.fileOf(prefix), { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- presence

  startPresencePoll() {
    this.stopPresencePoll();
    const tick = async () => {
      try {
        const users = await this.socket?.emit('clientTracking.getConnectedUsers');
        if (users !== undefined && users !== null) this.collaborators = connectedCollaborators(users);
      } catch { /* Presence is cosmetic. */ }
    };
    void tick();
    this.presenceTimer = setInterval(() => { void tick(); }, 10_000);
    this.presenceTimer.unref?.();
  }

  stopPresencePoll() {
    if (this.presenceTimer !== undefined) clearInterval(this.presenceTimer);
    this.presenceTimer = undefined;
  }

  // ------------------------------------------------------------------ helpers

  fileOf(path) {
    return join(this.localDir, path.split('/').join(sep));
  }

  writeText(path, text) {
    const file = this.fileOf(path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text, { mode: 0o644 });
  }

  writeBytes(path, data) {
    const file = this.fileOf(path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data, { mode: 0o644 });
  }

  moveLocal(from, to) {
    const source = this.fileOf(from);
    const target = this.fileOf(to);
    if (source === target || !existsSync(source)) return;
    mkdirSync(dirname(target), { recursive: true });
    try {
      renameSync(source, target);
    } catch {
      // A cross-device move is handled as a copy followed by removal.
      cpSync(source, target, { recursive: true, force: true });
      rmSync(source, { recursive: true, force: true });
    }
  }

  /** Update every descendant when a remote folder is renamed or moved. */
  updateSubtreePath(entity, nextPath) {
    const oldPath = entity.path;
    if (oldPath === nextPath || nextPath.startsWith(`${oldPath}/`)) return;
    const descendants = [...this.entities.values()].filter((candidate) => candidate.path === oldPath
      || candidate.path.startsWith(`${oldPath}/`));
    this.moveLocal(oldPath, nextPath);
    for (const candidate of descendants) {
      const previous = candidate.path;
      const suffix = previous === oldPath ? '' : previous.slice(oldPath.length);
      const updated = `${nextPath}${suffix}`;
      this.byPath.delete(previous);
      candidate.path = updated;
      this.byPath.set(updated, candidate);
      const model = this.docs.get(candidate.id);
      if (model !== undefined) model.path = updated;
      if (this.binaryHashes.has(previous)) {
        const hash = this.binaryHashes.get(previous);
        this.binaryHashes.delete(previous);
        this.binaryHashes.set(updated, hash);
      }
    }
  }

  /** Reconcile local paths after a reconnect's authoritative file tree. */
  reconcileTree(nextEntities) {
    const previous = this.entities;
    const moved = [];
    for (const oldEntity of previous.values()) {
      const next = nextEntities.get(oldEntity.id);
      if (next !== undefined && next.path !== oldEntity.path) moved.push({ oldEntity, next });
    }
    moved.sort((a, b) => a.oldEntity.path.length - b.oldEntity.path.length);
    const movedParents = [];
    for (const item of moved) {
      if (movedParents.some((parent) => item.oldEntity.path.startsWith(`${parent}/`))) continue;
      this.moveLocal(item.oldEntity.path, item.next.path);
      movedParents.push(item.oldEntity.path);
    }

    const removed = [...previous.values()].filter((entity) => !nextEntities.has(entity.id))
      .sort((a, b) => a.path.length - b.path.length);
    const removedPaths = [];
    for (const entity of removed) {
      if (removedPaths.some((parent) => entity.path.startsWith(`${parent}/`))) continue;
      rmSync(this.fileOf(entity.path), { recursive: true, force: true });
      removedPaths.push(entity.path);
    }
    for (const [id, model] of this.docs) {
      const next = nextEntities.get(id);
      if (next?.type === 'doc') model.path = next.path;
      else this.docs.delete(id);
    }
  }

  /** Record the synced content in `state.json` so offline pulls stay coherent. */
  persistState() {
    if (!this.treeReady) return;
    try {
      const files = {};
      for (const [path, entity] of this.byPath) {
        if (entity.type === 'folder') continue;
        const file = this.fileOf(path);
        if (!existsSync(file)) continue;
        files[path] = { base: sha256(readFileSync(file)) };
      }
      const state = readProjectState(this.localDir) ?? this.state;
      state.files = files;
      state.pulledAt = new Date().toISOString();
      writeProjectState(this.localDir, state);
    } catch (error) {
      this.log(`overleaf: could not persist sync state: ${error?.message ?? error}`);
    }
  }
}

function joinPath(prefix, name) {
  return prefix.length === 0 ? name : `${prefix}/${name}`;
}

function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}
