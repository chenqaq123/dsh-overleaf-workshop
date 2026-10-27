/**
 * Socket.IO 0.9 client over xhr-polling, which is all Overleaf needs.
 *
 * The transport is a long GET (server → client packets) plus short POSTs
 * (client → server packets); each packet is `type:id:endpoint:data` and a poll
 * body may concatenate several as `U+FFFD<length>U+FFFD<packet>`. Emitted
 * events request an ack with a trailing `+` on the packet id and receive it as
 * a type-6 packet. Heartbeats (`2::`) are echoed verbatim.
 *
 * Version 2 of Overleaf's handshake takes `?projectId=` and pushes
 * `joinProjectResponse`; older servers only accept the v1 `joinProject` emit
 * with an ack, so both are supported with a single fallback.
 *
 * @module dsh-overleaf/socket
 */

import { OverleafError } from './api.js';
import { parseEvent, parsePacket, parsePackets } from './realtime.js';

const CONNECT_TIMEOUT_MS = 20_000;

export class RealtimeSocket {
  /**
   * @param options - the authenticated HTTP client, the project id, and a log sink.
   */
  constructor({ client, projectId, ackTimeoutMs = 8000, pollTimeoutMs = 45_000, log } = {}) {
    this.client = client;
    this.projectId = projectId;
    this.ackTimeoutMs = ackTimeoutMs;
    this.pollTimeoutMs = pollTimeoutMs;
    this.log = typeof log === 'function' ? log : () => {};
    this.handlers = new Map();
    this.pending = new Map();
    this.nextPacketId = 0;
    this.sid = undefined;
    this.scheme = undefined;
    this.closing = false;
    this.abort = new AbortController();
  }

  get base() {
    return this.client.baseUrl.replace(/\/+$/u, '');
  }

  get headers() {
    return { cookie: this.client.cookies, origin: this.base };
  }

  /** Subscribe to a server event (`otUpdateApplied`, `reciveNewDoc`, ...). */
  on(name, handler) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(handler);
    return () => this.handlers.get(name)?.delete(handler);
  }

  dispatch(name, args) {
    for (const handler of this.handlers.get(name) ?? []) {
      try { handler(...(args ?? [])); } catch (error) { this.log(`overleaf: event ${name} handler failed: ${error?.message ?? error}`); }
    }
    if (name !== 'error') return;
  }

  /** Fetch once, absorbing any Set-Cookie (the GCLB affinity cookie). */
  async fetch(url, init = {}) {
    const response = await this.client.fetch(url, {
      ...init,
      headers: { ...this.headers, ...(init.headers ?? {}) },
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.pollTimeoutMs)]),
    });
    this.client.absorbCookies(response);
    return response;
  }

  /** Handshake, start polling, and join the project. Tries v2 then v1. */
  async connect() {
    try {
      return await this.connectWith('v2');
    } catch (error) {
      if (this.closing) throw error;
      this.log(`overleaf: v2 handshake failed (${error?.message ?? error}); trying v1`);
      await this.closeSocket().catch(() => {});
      this.abort = new AbortController();
      return this.connectWith('v1');
    }
  }

  async connectWith(scheme) {
    this.scheme = scheme;
    const query = scheme === 'v2' ? `?projectId=${encodeURIComponent(this.projectId)}&t=${Date.now()}` : `?t=${Date.now()}`;
    const response = await this.fetch(`${this.base}/socket.io/1/${query}`);
    if (!response.ok) throw new OverleafError(`实时连接握手失败（HTTP ${response.status}）`);
    const body = await response.text();
    const [sid, heartbeat, close] = body.split(':');
    if (!sid || !/^[A-Za-z0-9_-]+$/u.test(sid)) throw new OverleafError('实时连接握手返回异常');
    this.sid = sid;
    this.heartbeatMs = Number(heartbeat) * 1000 || 25_000;
    this.serverCloseMs = Number(close) * 1000 || 60_000;

    if (scheme === 'v2') {
      const joined = this.waitFor('joinProjectResponse', CONNECT_TIMEOUT_MS);
      this.polling = this.pollLoop().catch((error) => {
        if (!this.closing && !this.abort.signal.aborted) this.dispatch('error', [error]);
      });
      const payload = await joined;
      return this.joinResult(payload);
    }
    this.polling = this.pollLoop().catch((error) => {
      if (!this.closing && !this.abort.signal.aborted) this.dispatch('error', [error]);
    });
    const ack = await this.emit('joinProject', { project_id: this.projectId });
    const [project, permissionsLevel, protocolVersion] = ack ?? [];
    if (project === undefined) throw new OverleafError('joinProject 没有返回项目数据');
    return { scheme, project, permissionsLevel, protocolVersion, publicId: undefined };
  }

  joinResult(payload) {
    const publicId = payload?.publicId;
    const project = payload?.project;
    if (project === undefined) throw new OverleafError('joinProjectResponse 缺少项目数据');
    return { scheme: 'v2', project, publicId, permissionsLevel: payload.permissionsLevel,
      protocolVersion: payload.protocolVersion };
  }

  /** Resolve once `name` fires, or reject on timeout / socket error. */
  waitFor(name, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new OverleafError(`等待 ${name} 超时`)); }, timeoutMs);
      const off = this.on(name, (payload) => { clearTimeout(timer); off(); resolve(payload); });
      const offError = this.on('error', (error) => { clearTimeout(timer); off(); offError(); reject(error); });
    });
  }

  /** The long-poll loop: one GET at a time, dispatch every packet it returns. */
  async pollLoop() {
    while (!this.closing && !this.abort.signal.aborted) {
      let response;
      try {
        response = await this.fetch(`${this.base}/socket.io/1/xhr-polling/${this.sid}?projectId=${encodeURIComponent(this.projectId)}&t=${Date.now()}`);
      } catch (error) {
        if (this.closing || this.abort.signal.aborted) return;
        this.dispatch('error', [error]);
        return;
      }
      if (!response.ok) {
        if (this.closing) return;
        // 400 after a close means the session is gone; both cases end the loop.
        this.dispatch('disconnect', [`HTTP ${response.status}`]);
        return;
      }
      const body = await response.text().catch(() => '');
      for (const raw of parsePackets(body)) this.handlePacket(raw);
    }
  }

  handlePacket(raw) {
    const { type, id, data } = parsePacket(raw);
    if (type === 2) { this.post('2::').catch(() => {}); return; }
    if (type === 0) { this.dispatch('disconnect', ['server']); return; }
    if (type === 7) { this.dispatch('error', [new OverleafError(data || '实时连接出错')]); return; }
    if (type === 6) { this.resolveAck(data); return; }
    if (type !== 5) return;
    let event;
    try { event = parseEvent(data); } catch { return; }
    if (typeof id === 'string' && id.endsWith('+')) {
      // Server-initiated events may request an ack of their own.
      this.post(`6:::${id.slice(0, -1)}+[]`).catch(() => {});
    }
    this.dispatch(event.name, event.args ?? []);
  }

  resolveAck(data) {
    const match = /^(\d+)\+([\s\S]*)$/u.exec(String(data ?? ''));
    if (match === null) return;
    const entry = this.pending.get(Number(match[1]));
    if (entry === undefined) return;
    this.pending.delete(Number(match[1]));
    clearTimeout(entry.timer);
    let value = [];
    try { value = JSON.parse(match[2]); } catch { /* An empty ack body is legal. */ }
    entry.resolve(value);
  }

  /** Emit an event and wait for its ack payload. */
  emit(name, ...args) {
    const id = ++this.nextPacketId;
    const packet = `5:${id}+::${JSON.stringify({ name, args })}`;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new OverleafError(`Overleaf 未确认 ${name}（超时）`));
      }, this.ackTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.post(packet).catch((error) => {
      const entry = this.pending.get(id);
      if (entry === undefined) return;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(error);
    });
    return promise;
  }

  async post(packet) {
    const response = await this.fetch(`${this.base}/socket.io/1/xhr-polling/${this.sid}?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: packet,
    });
    if (!response.ok) throw new OverleafError(`实时连接发送失败（HTTP ${response.status}）`);
    return response;
  }

  /** Close the socket politely so the server frees it immediately. */
  async close() {
    if (this.closing) return;
    this.closing = true;
    for (const [, entry] of this.pending) { clearTimeout(entry.timer); entry.reject(new OverleafError('实时连接已关闭')); }
    this.pending.clear();
    await this.post('0::').catch(() => {});
    await this.closeSocket();
  }

  async closeSocket() {
    const sid = this.sid;
    this.abort.abort();
    if (sid === undefined) return;
    try {
      await this.client.fetch(`${this.base}/socket.io/1/xhr-polling/${sid}?t=${Date.now()}&disconnect=1`,
        { headers: this.headers, signal: AbortSignal.timeout(3000) });
    } catch { /* Best effort; the server expires the session anyway. */ }
  }
}
