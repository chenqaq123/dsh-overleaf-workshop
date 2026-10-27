/**
 * Minimal socket.io 0.9 client used for exactly one thing: fetching the project
 * entity tree (folder/doc/file ids) that REST endpoints need for push.
 *
 * Overleaf's realtime layer is still socket.io v0.9 over xhr-polling or websocket.
 * For a one-shot tree fetch the polling transport is enough — no WebSocket
 * dependency, just `fetch` — which is the same trick olsync uses.
 *
 * Wire format (v0.9): a poll response is zero or more packets, each framed as
 * `U+FFFD <byte length> U+FFFD <packet>`. A packet is `type[:id][:endpoint][:data]`;
 * type 1 connects, 2 is a heartbeat that must be echoed, 5 is an event with a JSON
 * payload, 0 disconnects. With `?projectId=` in the query the server performs the
 * join during the handshake and pushes a `joinProjectResponse` event.
 *
 * @module dsh-overleaf/realtime
 */

import { OverleafError } from './api.js';

const POLL_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 30_000;

/** Parse one poll body into packets, tolerating the length-framed and bare forms. */
export function parsePackets(text) {
  const packets = [];
  const frame = /�(\d+)�/g;
  let match;
  let cursor = 0;
  while ((match = frame.exec(text)) !== null) {
    const length = Number(match[1]);
    const start = match.index + match[0].length;
    if (Number.isSafeInteger(length) && start + length <= text.length) {
      packets.push(text.slice(start, start + length));
      frame.lastIndex = start + length;
      cursor = start + length;
    }
  }
  if (cursor === 0 && text.length > 0) {
    // Bare packets (one per poll) are legal in v0.9.
    for (const line of text.split('�').filter(Boolean)) packets.push(line);
  }
  return packets;
}

/** Split `5:12+::{"name":...}` into its colon-separated fields. */
export function parsePacket(packet) {
  const parts = packet.split(':');
  return {
    type: Number(parts[0]),
    id: parts[1] || undefined,
    endpoint: parts[2] ?? '',
    data: parts.slice(3).join(':'),
  };
}

/** Event payloads arrive as `{name, args:[...]}`; args may itself be JSON text. */
export function parseEvent(data) {
  const payload = JSON.parse(data);
  if (typeof payload.args === 'string') payload.args = JSON.parse(payload.args);
  return payload;
}

/** The joinProjectResponse args have changed shape over the years; accept them all. */
export function projectFromJoinResponse(args) {
  for (const candidate of args ?? []) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === 'object' && candidate.project !== undefined) {
      if (candidate.project?.rootFolder !== undefined) return candidate.project;
    }
    if (typeof candidate === 'object' && candidate.rootFolder !== undefined) return candidate;
  }
  return undefined;
}

/**
 * Fetch the full project model over xhr-polling.
 * @param session - baseUrl, cookies, csrfToken, fetchImpl and an abort signal.
 * @param projectId - the Overleaf project id.
 * @returns the project object with `rootFolder`.
 */
export async function fetchProjectTree(session, projectId) {
  const { baseUrl, cookies, fetchImpl = fetch, signal } = session;
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  const base = baseUrl.replace(/\/+$/u, '');
  const headers = { cookie: cookies, origin: base };

  const handshake = await fetchImpl(`${base}/socket.io/1/?projectId=${encodeURIComponent(projectId)}&t=${Date.now()}`,
    { headers, signal: signal ?? AbortSignal.timeout(POLL_TIMEOUT_MS) });
  if (!handshake.ok) {
    throw new OverleafError(`实时连接握手失败（HTTP ${handshake.status}）`);
  }
  const info = await handshake.text();
  const sid = info.split(':')[0];
  if (!sid) throw new OverleafError('实时连接握手返回异常，无法获取文件树。');

  const pollUrl = (extra) => `${base}/socket.io/1/xhr-polling/${sid}?projectId=${encodeURIComponent(projectId)}&t=${Date.now()}${extra}`;
  let connected = false;

  for (let round = 0; Date.now() < deadline; round += 1) {
    const response = await fetchImpl(pollUrl(round === 0 ? '&disconnect=0' : ''),
      { headers, signal: signal ?? AbortSignal.timeout(POLL_TIMEOUT_MS) });
    if (!response.ok) {
      if (response.status === 400 && round > 0) break; // session closed by the server
      throw new OverleafError(`实时连接轮询失败（HTTP ${response.status}）`);
    }
    const body = await response.text();
    const packets = parsePackets(body);
    for (const packet of packets) {
      const { type, data } = parsePacket(packet);
      if (type === 0) throw new OverleafError('服务器在获取文件树前断开了实时连接。');
      if (type === 1) connected = true;
      if (type === 2) {
        // Echo the heartbeat so the session stays open through long polls.
        await fetchImpl(pollUrl(''), { method: 'POST', headers: { ...headers, 'content-type': 'text/plain;charset=UTF-8' },
          body: '2::', signal: signal ?? AbortSignal.timeout(POLL_TIMEOUT_MS) }).catch(() => {});
      }
      if (type === 5 && connected) {
        let event;
        try { event = parseEvent(data); } catch { continue; }
        if (event?.name === 'joinProjectResponse') {
          const project = projectFromJoinResponse(event.args);
          if (project !== undefined) {
            await disconnect(base, sid, headers, fetchImpl, signal);
            return project;
          }
        }
      }
    }
  }
  throw new OverleafError('等待项目文件树超时；该服务器可能不支持 projectId 握手。');
}

async function disconnect(base, sid, headers, fetchImpl, signal) {
  try {
    await fetchImpl(`${base}/socket.io/1/xhr-polling/${sid}?t=${Date.now()}`,
      { method: 'POST', headers: { ...headers, 'content-type': 'text/plain;charset=UTF-8' },
        body: '0::', signal: signal ?? AbortSignal.timeout(5000) });
  } catch { /* Best effort; the session expires on its own. */ }
}

/**
 * Flatten `rootFolder` into path-keyed maps for the push logic.
 * @returns `{ files: Map<path, {id, type}> , folders: Map<path, id> }`
 * where `type` is `doc` for text entities and `file` for binary refs.
 */
export function flattenTree(project) {
  const files = new Map();
  const folders = new Map([['', project.rootFolder?.[0]?._id]]);
  const walk = (folder, prefix) => {
    for (const doc of folder.docs ?? []) files.set(joinPath(prefix, doc.name), { id: doc._id, type: 'doc' });
    for (const file of folder.fileRefs ?? []) files.set(joinPath(prefix, file.name), { id: file._id, type: 'file' });
    for (const child of folder.folders ?? []) {
      const path = joinPath(prefix, child.name);
      folders.set(path, child._id);
      walk(child, path);
    }
  };
  const root = project.rootFolder?.[0];
  if (root) walk(root, '');
  return { files, folders };
}

function joinPath(prefix, name) {
  return prefix.length === 0 ? name : `${prefix}/${name}`;
}
