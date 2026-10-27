/**
 * A fake Overleaf server, good enough to exercise the plugin's client end to
 * end: cookie login, project list, zip download, the socket.io 0.9 tree
 * handshake, upload/folder/delete, and compile with pdf/log outputs.
 *
 * Run with: node test/run.mjs   (starts the mock, runs the scenarios, stops it)
 * @module dsh-overleaf/test/mock
 */

import { createServer } from 'node:http';
import { zipSync, strToU8 } from 'fflate';

const COOKIE = 'overleaf_session2=s%3Amock-session.sig; sharelatex.sid=s%3Amock.sid';
const GCLB = 'GCLB=mock-affinity';
const CSRF = 'mock-csrf-token';

/** Mutable server state the scenarios inspect. */
export function createMock() {
  const state = {
    uploads: [], deletes: [], folders: [], compiles: [], compileQueries: [],
    tree: {
      _id: 'p1', name: 'Mock Paper', rootDoc_id: 'doc1',
      rootFolder: [{
        _id: 'root1', name: 'rootDoc',
        docs: [{ _id: 'doc1', name: 'main.tex' }, { _id: 'doc2', name: 'intro.tex' }],
        fileRefs: [{ _id: 'file1', name: 'fig.png', linkedFileData: null, created: new Date().toISOString() }],
        folders: [{ _id: 'fol1', name: 'sections', docs: [{ _id: 'doc3', name: 'methods.tex' }], fileRefs: [], folders: [] }],
      }],
    },
    projects: [{ id: 'p1', name: 'Mock Paper', lastUpdated: new Date().toISOString(), accessLevel: 'owner' }],
    zipFiles: { 'main.tex': strToU8('\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n'),
      'intro.tex': strToU8('Intro line.\n'), 'sections/methods.tex': strToU8('Methods.\n') },
    /** Binary fileRef payloads served by `/project/:id/file/:fileId`. */
    fileBytes: { file1: Buffer.from('PNG mock') },
    compileResult: 'success',
    /** Delay (ms) before an applyOtUpdate is acknowledged, to model a slow wire. */
    applyDelayMs: 0,
    /** Drop the sender's op-less echo, to model an acknowledgement lost on the wire. */
    dropEcho: false,
    compileLog: '',
    failingTree: false,
    /** Live document text and version, keyed by doc id. */
    docs: new Map([
      ['doc1', { version: 3, text: '\\documentclass{article}\n\\begin{document}\nHello 世界\n\\end{document}\n' }],
      ['doc2', { version: 1, text: 'Intro line.\n' }],
      ['doc3', { version: 1, text: 'Methods.\n' }],
    ]),
    /** Live socket sessions: sid -> { queue: string[], broadcast: boolean }. */
    sockets: new Map(),
    socketCounter: 0,
  };

  /** Frame packets for the 0.9 wire format. */
  const frame = (packet) => `\uFFFD${packet.length}\uFFFD${packet}`;
  /** Push a packet into one session's queue. */
  const enqueue = (sid, packet) => { state.sockets.get(sid)?.queue.push(packet); };
  /** Push a packet into every session except `except`. */
  const broadcast = (packet, except) => {
    for (const [sid, session] of state.sockets) if (sid !== except) session.queue.push(packet);
  };
  /** Encode text as joinDoc's latin1-packed UTF-8 line array. */
  const encodeLines = (text) => text.split('\n').map(line => Buffer.from(line, 'utf8').toString('latin1'));
  /** Apply an op list the same way the server does, for assertions. */
  const applyOpsTo = (text, ops) => {
    let result = text;
    for (const op of ops ?? []) {
      if (typeof op.i === 'string') result = result.slice(0, op.p) + op.i + result.slice(op.p);
      else if (op.d !== undefined) result = result.slice(0, op.p) + result.slice(op.p + String(op.d).length);
    }
    return result;
  };
  /** Handle one inbound packet from a client session. */
  const handleClientPacket = async (sid, packet) => {
    if (packet.startsWith('2::')) return;
    if (packet.startsWith('0::')) { state.sockets.delete(sid); return; }
    const match = /^5:(\d+)\+::([\s\S]*)$/u.exec(packet);
    if (match === null) return;
    const [, id, payload] = match;
    const { name, args } = JSON.parse(payload);
    const ack = (value) => enqueue(sid, `6:::${id}+${JSON.stringify(value)}`);
    if (name === 'joinProject') { ack([state.tree, 'owner', 2]); return; }
    if (name === 'joinDoc') {
      const doc = state.docs.get(args[0]);
      if (doc === undefined) { ack([null, [], 0, [], {}]); return; }
      ack([null, encodeLines(doc.text), doc.version, [], {}]);
      return;
    }
    if (name === 'leaveDoc') { ack([]); return; }
    if (name === 'applyOtUpdate') {
      if (state.applyDelayMs > 0) await new Promise(resolveDelay => setTimeout(resolveDelay, state.applyDelayMs));
      const update = args[1];
      const doc = state.docs.get(update.doc);
      if (doc === undefined || update.v !== doc.version) { ack([{ error: 'version' }]); return; }
      doc.text = applyOpsTo(doc.text, update.op);
      doc.version += 1;
      ack([]);
      // The sender gets an op-less acknowledgement that still bumps the version.
      if (!state.dropEcho) enqueue(sid, `5:::${JSON.stringify({ name: 'otUpdateApplied',
        args: [{ doc: update.doc, v: update.v, meta: { source: sid, ts: Date.now() } }] })}`);
      state.lastPushed = { doc: update.doc, text: doc.text, version: doc.version };
      return;
    }
    ack([]);
  };

  /** Simulate another user's edit, optionally from a different session. */
  state.remoteEdit = (docId, ops) => {
    const doc = state.docs.get(docId);
    const update = { doc: docId, v: doc.version, op: ops, meta: { source: 'other-user', ts: Date.now() } };
    doc.text = applyOpsTo(doc.text, ops);
    doc.version += 1;
    broadcast(`5:::${JSON.stringify({ name: 'otUpdateApplied', args: [update] })}`);
  };
  /** Simulate a tree event from another user. */
  state.remoteTreeEvent = (name, args) => {
    broadcast(`5:::${JSON.stringify({ name, args })}`);
  };

  /** Join the zip file map into entries for downloadZip. */
  const zipEntries = () => {
    const entries = {};
    for (const [name, content] of Object.entries(state.zipFiles)) {
      entries[name] = typeof content === 'string' ? strToU8(content) : content;
    }
    return zipSync(entries);
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://mock');
    const path = url.pathname;
    const cookieOk = (request.headers.cookie ?? '').includes('overleaf_session2=s%3Amock-session.sig');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const json = (code, value, headers = {}) => {
      response.writeHead(code, { 'content-type': 'application/json', ...headers });
      response.end(JSON.stringify(value));
    };
    const html = (code, text) => {
      response.writeHead(code, { 'content-type': 'text/html; charset=utf-8' });
      response.end(text);
    };

    if (path === '/project' && request.method === 'GET') {
      if (!cookieOk) return html(302, 'Found. Redirecting to /login');
      return html(200, `<!doctype html><html><head>
        <meta name="ol-user_id" content="user-1">
        <meta name="ol-csrfToken" content="${CSRF}">
        <meta name="ol-usersEmail" content="mock@example.com">
        </head><body>projects</body></html>`);
    }
    if (path === '/socket.io/socket.io.js') {
      response.writeHead(200, { 'content-type': 'application/javascript', 'set-cookie': GCLB });
      return response.end('// socket.io');
    }
    if (path === '/user/projects') return cookieOk ? json(200, { projects: state.projects.map(p => ({ ...p, _id: p.id })) }) : json(302, {});
    if (path === '/api/project' && request.method === 'POST') {
      if (!cookieOk) return json(302, {});
      return json(200, { projects: state.projects });
    }

    if (path === '/socket.io/1/' && request.method === 'GET') {
      if (!cookieOk) { response.writeHead(403); return response.end(); }
      const projectId = url.searchParams.get('projectId');
      const sid = `sock${++state.socketCounter}`;
      state.sockets.set(sid, { queue: [] });
      enqueue(sid, '1::');
      if (projectId !== null && !state.failingTree) {
        enqueue(sid, `5:::${JSON.stringify({ name: 'joinProjectResponse',
          args: [{ project: state.tree, publicId: `pub-${sid}`, permissionsLevel: 'owner', protocolVersion: 2 }] })}`);
      }
      response.writeHead(200, { 'content-type': 'text/plain' });
      return response.end(`${sid}:15:10:websocket,xhr-polling`);
    }
    const pollPath = /^\/socket\.io\/1\/xhr-polling\/([A-Za-z0-9_-]+)$/u.exec(path);
    if (pollPath !== null) {
      const sid = pollPath[1];
      if (request.method === 'POST') {
        if (state.sockets.has(sid)) await handleClientPacket(sid, body.toString('utf8'));
        response.writeHead(200, { 'content-type': 'text/plain' });
        return response.end('ok');
      }
      const session = state.sockets.get(sid);
      if (session === undefined) { response.writeHead(400); return response.end(); }
      // Emulate a long poll, but keep tests fast: deliver what is queued now,
      // otherwise hold briefly before answering empty.
      for (let waited = 0; session.queue.length === 0 && waited < 60 && !state.closing; waited += 10) {
        await new Promise(resolveTimer => setTimeout(resolveTimer, 10));
      }
      const packets = session.queue.splice(0, session.queue.length);
      response.writeHead(200, { 'content-type': 'text/plain' });
      return response.end(packets.map(frame).join(''));
    }

    if (path === '/project/p1/download/zip' && request.method === 'GET') {
      if (!cookieOk) { response.writeHead(302); return response.end(); }
      const zip = zipEntries();
      response.writeHead(200, { 'content-type': 'application/zip' });
      return response.end(zip);
    }
    if (path === '/project/p1/upload' && request.method === 'POST') {
      if (!cookieOk) return json(302, {});
      const name = url.searchParams.get('qqfilename');
      const folderId = url.searchParams.get('folder_id');
      state.uploads.push({ name, folderId, bytes: body.length });
      return json(200, { success: true, entity_id: `new-${state.uploads.length}`, entity_type: name.endsWith('.png') ? 'file' : 'doc' });
    }
    if (path === '/project/p1/folder' && request.method === 'POST') {
      const request_ = JSON.parse(body.toString('utf8'));
      state.folders.push(request_);
      return json(200, { _id: `fol-new-${state.folders.length}`, name: request_.name });
    }
    const fileRef = /^\/project\/p1\/file\/([^/]+)$/u.exec(path);
    if (fileRef !== null && request.method === 'GET') {
      if (!cookieOk) { response.writeHead(302); return response.end(); }
      const bytes = state.fileBytes[fileRef[1]];
      if (bytes === undefined) return json(404, { error: 'not found' });
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      return response.end(bytes);
    }
    const destroy = /^\/project\/p1\/(doc|file|folder)\/([^/]+)$/u.exec(path);
    if (destroy !== undefined && request.method === 'DELETE') {
      state.deletes.push({ type: destroy[1], id: destroy[2] });
      response.writeHead(204); return response.end();
    }
    if (path === '/project/p1/compile' && request.method === 'POST') {
      const parsed = JSON.parse(body.toString('utf8'));
      state.compiles.push(parsed);
      state.compileQueries.push(Object.fromEntries(url.searchParams.entries()));
      const build = 'b1';
      const urlBase = `/project/p1/user/user-1/build/${build}/output`;
      const outputs = [{ path: 'output.pdf', url: `${urlBase}/output.pdf`, type: 'pdf', build },
        { path: 'output.log', url: `${urlBase}/output.log`, type: 'log', build }];
      if (state.compileResult === 'success' || state.compileResult === 'failure') {
        return json(200, { status: state.compileResult, compileGroup: 'default', clsiServerId: 'clsi-1',
          outputFiles: outputs, stats: {}, timings: {} });
      }
      return json(500, { status: 'error' });
    }
    if (path.endsWith('/output/output.pdf')) {
      response.writeHead(200, { 'content-type': 'application/pdf' });
      return response.end(Buffer.from('%PDF-1.4 mock'));
    }
    if (path.endsWith('/output/output.log')) {
      response.writeHead(200, { 'content-type': 'text/plain' });
      return response.end(state.compileLog);
    }
    response.writeHead(404);
    response.end('not found');
  });

  return { server, state };
}
