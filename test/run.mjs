/**
 * End-to-end scenarios for the Overleaf client, sync and compile modules,
 * against the local mock server. No harness modules are involved.
 *
 * Run with: node test/run.mjs
 */

import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from './mock.mjs';
import { OverleafClient, blobHash, normalizeCookieInput } from '../lib/api.js';
import { parseLog } from '../lib/compile.js';
import { RealtimeSocket } from '../lib/socket.js';
import { DocumentModel, decodeJoinLines, parseJoinAck, ReceiveResult } from '../lib/documents.js';
import { applyOps, mergeBeforeWrite, mergeTexts, textToOps } from '../lib/ot.js';
import { OverleafLive, connectedCollaborators } from '../lib/live.js';
import { LiveManager } from '../lib/live-manager.js';
import { createWorkspaceFile, createWorkspaceFolder } from '../lib/workspace-files.js';
import { writeProjectState, readProjectState } from '../lib/store.js';
import { registerOverleafTools } from '../lib/tools.js';

const sleep = (ms) => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
import { OverleafSync } from '../lib/sync.js';
import { compileProject, renderCompileResult, guessMainFile, toRpcCompileResult } from '../lib/compile.js';
import { localChanges } from '../lib/sync.js';

const mock = createMock();
await new Promise((resolveListen) => mock.server.listen(0, '127.0.0.1', resolveListen));
const baseUrl = `http://127.0.0.1:${mock.server.address().port}`;
const scratch = mkdtempSync(join(tmpdir(), 'dsh-overleaf-test-'));
let passed = 0;
const test = (name, fn) => Promise.resolve()
  .then(fn)
  .then(() => { passed += 1; console.log(`ok   ${name}`); })
  .catch((error) => { console.error(`FAIL ${name}`); throw error; });

const client = new OverleafClient({ baseUrl });
const sync = new OverleafSync({ createClient: () => client });

await test('overleaf tools keep their executable handlers', async () => {
  const registered = new Map();
  const ctx = {
    tools: {
      register: (definition) => {
        registered.set(definition.name, definition);
        return () => {};
      },
    },
  };
  const host = { tools: { defineTool: (definition) => definition } };
  const runtime = {
    ctx: {},
    projectTable: { list: () => [] },
    secrets: { list: () => [] },
  };

  registerOverleafTools(ctx, host, runtime);
  assert.equal(registered.size, 6);
  const result = await registered.get('overleaf_projects').execute({}, {});
  assert.match(result, /No Overleaf server has a session yet/);
});

await test('login scrapes identity, csrf and merges Set-Cookie', async () => {
  const identity = await client.login('overleaf_session2=s%3Amock-session.sig');
  assert.equal(identity.userId, 'user-1');
  assert.equal(identity.csrfToken, 'mock-csrf-token');
  assert.equal(identity.email, 'mock@example.com');
  assert.ok(client.cookies.includes('GCLB=mock-affinity'), 'GCLB cookie merged');
});

await test('cookie normalization accepts a copied Cookie header', () => {
  assert.equal(normalizeCookieInput('Cookie: overleaf_session2=s%3Amock-session.sig'),
    'overleaf_session2=s%3Amock-session.sig');
});

await test('a redirect response means the cookie expired', async () => {
  const fresh = new OverleafClient({ baseUrl });
  await assert.rejects(fresh.listProjects(), /CookieExpiredError|过期/);
});

await test('listProjects returns normalized projects', async () => {
  const projects = await client.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, 'p1');
  assert.equal(projects[0].name, 'Mock Paper');
});

await test('fetchProjectTree parses the framed socket.io response', async () => {
  const project = await client.fetchProjectTree('p1');
  assert.equal(project._id, 'p1');
  assert.equal(project.rootFolder[0].docs.length, 2);
});

const projectDir = join(scratch, 'paper');

await test('first open seeds the directory from the zip', async () => {
  const entries = await client.downloadZip('p1');
  assert.ok(entries.has('main.tex'));
  mkdirSync(projectDir, { recursive: true });
  const { applyZip } = await import('../lib/sync.js');
  const state = { version: 1, server: baseUrl, projectId: 'p1', projectName: 'Mock Paper', files: {} };
  const { files } = applyZip(projectDir, state, entries);
  state.files = files;
  const { writeProjectState } = await import('../lib/store.js');
  writeProjectState(projectDir, state);
  assert.ok(readFileSync(join(projectDir, 'main.tex'), 'utf8').includes('\\documentclass'));
  assert.ok(existsSync(join(projectDir, 'sections', 'methods.tex')));
});

await test('status reports local edits, adds and deletes', async () => {
  writeFileSync(join(projectDir, 'main.tex'), '\\documentclass{article}\nchanged\n');
  writeFileSync(join(projectDir, 'new.tex'), 'brand new\n');
  rmSync(join(projectDir, 'intro.tex'));
  const state = JSON.parse(readFileSync(join(projectDir, '.overleaf', 'state.json'), 'utf8'));
  const changes = localChanges(projectDir, state);
  assert.deepEqual(changes.changed, ['main.tex']);
  assert.deepEqual(changes.added, ['new.tex']);
  assert.deepEqual(changes.deleted, ['intro.tex']);
});

await test('pull keeps local edits and reports remote-vs-local conflicts', async () => {
  // Remote changed intro.tex (locally deleted) and methods.tex (untouched locally).
  mock.state.zipFiles['intro.tex'] = 'Remote rewrote intro.\n';
  mock.state.zipFiles['sections/methods.tex'] = 'Remote expanded methods.\n';
  const result = await sync.pull(projectDir);
  assert.ok(result.updated.includes('sections/methods.tex'), `updated: ${result.updated}`);
  assert.ok(result.conflicts.includes('intro.tex'), `conflicts: ${result.conflicts}`);
  // The locally deleted file was not resurrected.
  assert.ok(!existsSync(join(projectDir, 'intro.tex')));
  assert.ok(readFileSync(join(projectDir, 'main.tex'), 'utf8').includes('changed'), 'local edit kept');
  // methods.tex took the remote content and is the new base.
  assert.ok(readFileSync(join(projectDir, 'sections', 'methods.tex'), 'utf8').includes('Remote expanded'));
});

await test('push uploads through the tree ids and records the new base', async () => {
  const result = await sync.push(projectDir);
  assert.ok(result.uploaded.includes('main.tex'), `uploaded: ${JSON.stringify(result)}`);
  assert.ok(result.uploaded.includes('new.tex'));
  assert.ok(result.deleted.includes('intro.tex'));
  // Deletion hit the remote doc by id.
  assert.deepEqual(mock.state.deletes, [{ type: 'doc', id: 'doc2' }]);
  // Uploads carry folder ids: new.tex to root, main.tex to root.
  for (const upload of mock.state.uploads) {
    assert.ok(upload.folderId !== undefined && upload.folderId.length > 0, `folderId for ${upload.name}`);
  }
  // After push the state equals local content, so status is clean.
  const status = sync.status(projectDir);
  assert.equal(status.changed.length + status.added.length + status.deleted.length, 0);
});

await test('push creates missing remote folders', async () => {
  mkdirSync(join(projectDir, 'figures'), { recursive: true });
  writeFileSync(join(projectDir, 'figures', 'deep.tex'), 'nested\n');
  const result = await sync.push(projectDir);
  assert.ok(result.uploaded.includes('figures/deep.tex'));
  const folder = mock.state.folders.at(-1);
  assert.equal(folder.name, 'figures');
  const upload = mock.state.uploads.at(-1);
  assert.equal(upload.name, 'deep.tex');
});

await test('upload omits _csrf from the multipart body the strict server validates', async () => {
  // Current Overleaf answers 400 "Unrecognized key: _csrf at body" for unknown
  // multipart fields; the mock mirrors that, so this only passes without it.
  const before = mock.state.uploads.length;
  const result = await client.uploadFile('p1', 'root0', 'csrf-check.tex', 'content\n');
  assert.equal(result.success, true);
  assert.equal(mock.state.uploads.length, before + 1);
  assert.equal(mock.state.uploads.at(-1).name, 'csrf-check.tex');
});

await test('compile success downloads pdf and log', async () => {
  mock.state.compileResult = 'success';
  mock.state.compileLog = [
    'This is pdfTeX, Version 1.40',
    'LaTeX Warning: Label(s) may have changed.',
    'Overfull \\hbox (12.3pt too wide) in paragraph at lines 5--9',
  ].join('\n');
  const result = await compileProject(client, projectDir);
  assert.equal(result.status, 'success');
  assert.equal(mock.state.compileQueries.at(-1).auto_compile, 'true');
  assert.equal(result.mainFile, 'main.tex');
  assert.ok(existsSync(join(projectDir, 'output.pdf')));
  assert.equal(result.warnings.length, 1);
  assert.equal(result.badBoxes.length, 1);
  assert.equal(result.errors.length, 0);
});

await test('compile sends the requested root document', async () => {
  mock.state.compileResult = 'success';
  mock.state.compileLog = 'This is pdfTeX';
  const result = await compileProject(client, projectDir, { mainFile: 'sections/methods.tex' });
  assert.equal(mock.state.compiles.at(-1).rootResourcePath, 'sections/methods.tex');
  assert.equal(result.mainFile, 'sections/methods.tex');
});

await test('compile failure parses `! ` errors with line numbers', async () => {
  mock.state.compileResult = 'failure';
  mock.state.compileLog = [
    'This is pdfTeX',
    '! Undefined control sequence.',
    'l.27 \\usepackage{nonexistent}',
    '',
    './sections/methods.tex:8: LaTeX Error: Environment foo undefined.',
  ].join('\n');
  const result = await compileProject(client, projectDir);
  assert.equal(result.status, 'failure');
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].line, 27);
  assert.equal(result.errors[0].message, 'Undefined control sequence.');
  assert.equal(result.errors[1].file, 'sections/methods.tex');
  assert.equal(result.errors[1].line, 8);
  const text = renderCompileResult(result, { localDir: projectDir });
  assert.ok(text.includes('sections/methods.tex:行 8'), text);
  assert.ok(text.includes('行 27'), text);
});

await test('guessMainFile prefers main.tex', () => {
  assert.equal(guessMainFile(projectDir), 'main.tex');
});

await test('blobHash matches the git-blob format', () => {
  assert.equal(blobHash('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

await test('textToOps advances positions like Overleaf', () => {
  assert.deepEqual(textToOps('abc', 'abXYc'), [{ p: 2, i: 'XY' }]);
  assert.deepEqual(textToOps('abc', 'ac'), [{ p: 1, d: 'b' }]);
  const mixed = textToOps('abcdef', 'acYe');
  assert.equal(applyOps('abcdef', mixed), 'acYe');
  assert.equal(applyOps('中文abc', textToOps('中文abc', '中x文abc')), '中x文abc');
});

await test('mergeTexts applies remote patches onto local edits', () => {
  const base = 'one\ntwo\nthree\n';
  const ours = 'ONE\ntwo\nthree\n';
  const theirs = 'one\ntwo\nTHREE\n';
  const merged = mergeTexts(base, ours, theirs);
  assert.equal(merged.conflict, false);
  assert.equal(merged.text, 'ONE\ntwo\nTHREE\n');
  assert.equal(mergeTexts(base, base, theirs).text, theirs);
  assert.equal(mergeTexts(base, ours, base).text, ours);
});

await test('mergeTexts without a base keeps the local text instead of throwing', () => {
  // Regression: diff-match-patch threw "Unknown call format" for an undefined
  // base, and that rejection escaped a flush timer and killed the host.
  assert.deepEqual(mergeTexts(undefined, 'local', 'remote'), { text: 'local', conflict: true });
  assert.deepEqual(mergeTexts('', undefined, 'remote'), { text: '', conflict: true });
});

await test('planWrite asks for a re-join when the merge base was lost', () => {
  const model = new DocumentModel({ docId: 'lost', path: 'main.tex' });
  model.join(['remote'], 2);
  model.baseText = undefined;
  const plan = model.planWrite('local');
  assert.equal(plan.rejoin, true);
  assert.equal(plan.send, false);
  assert.equal(plan.text, 'local');
  assert.equal(model.remoteText, 'remote', 'a missing base must not be treated as the remote text');
});

await test('an unsaved buffer merges a collaborator edit instead of failing on save', () => {
  // base is what the editor loaded; disk already carries the collaborator's
  // edit; ours is the unsaved buffer. The host applies base -> disk onto ours.
  const base = 'line1\nline2\nline3\n';
  const ours = 'line1 local\nline2\nline3\n';
  const disk = 'line1\nline2\nline3 remote\n';
  const merged = mergeTexts(base, ours, disk);
  assert.equal(merged.conflict, false);
  assert.equal(merged.text, 'line1 local\nline2\nline3 remote\n');
});

await test('mergeBeforeWrite combines a stale buffer with disk changes', () => {
  const base = 'line1\nline2\nline3\n';
  const buffer = 'line1 local\nline2\nline3\n';
  const disk = 'line1\nline2\nline3 remote\n';
  const combined = mergeBeforeWrite(base, buffer, disk);
  assert.equal(combined.merged, true);
  assert.equal(combined.conflict, false);
  assert.equal(combined.text, 'line1 local\nline2\nline3 remote\n');
  // Nothing changed on disk: a plain save must not need a merge.
  const plain = mergeBeforeWrite(base, buffer, base);
  assert.deepEqual(plain, { text: buffer, merged: false, conflict: false });
  assert.equal(mergeBeforeWrite(undefined, buffer, disk).merged, false);
});

await test('decodeJoinLines reverses the latin1 packing', () => {
  const packed = Buffer.from('你好 world', 'utf8').toString('latin1');
  assert.equal(decodeJoinLines([packed, 'line2']), '你好 world\nline2');
});

const socket = new RealtimeSocket({ client, projectId: 'p1' });
let joined;

await test('presence counts people once despite nested payloads and duplicate clients', () => {
  // The real Overleaf ack is `[null, [user]]`; one person, one client.
  assert.equal(connectedCollaborators([null, [{ user_id: 'u1', connected: true }]]), 1);
  // The same account in two browser tabs is still one person.
  assert.equal(connectedCollaborators([null, [
    { user_id: 'u1', connected: true }, { user_id: 'u1', connected: true },
    { user_id: 'u2', connected: true }, { user_id: 'u3', connected: false },
  ]]), 2);
  // Anonymous clients fall back to their per-connection id.
  assert.equal(connectedCollaborators([[{ client_id: 'P.aaa' }, { client_id: 'P.bbb' }]]), 2);
  assert.equal(connectedCollaborators([null, []]), 0);
});

await test('socket handshake joins the project over polling', async () => {
  joined = await socket.connect();
  assert.equal(joined.project._id, 'p1');
  assert.equal(joined.permissionsLevel, 'owner');
});

const docA = new DocumentModel({ docId: 'doc1', path: 'main.tex' });

await test('joinDoc returns decoded lines, version and joins the doc', async () => {
  const { lines, version } = parseJoinAck(await socket.emit('joinDoc', 'doc1', { encodeRanges: true }));
  docA.join(lines, version);
  assert.equal(docA.version, 3);
  assert.ok(docA.remoteText.includes('Hello 世界'), docA.remoteText);
  assert.equal(docA.joined, true);
});

await test('joinDoc acknowledgement parsing accepts real and legacy shapes', () => {
  const lines = ['Hello'];
  assert.deepEqual(parseJoinAck([null, lines, 7, [], {}]), { lines, version: 7 });
  assert.deepEqual(parseJoinAck([lines, 7]), { lines, version: 7 });
  assert.throws(() => parseJoinAck([null, null, 0]), /joinDoc 返回格式异常/);
  assert.throws(() => parseJoinAck([null, lines]), /joinDoc 返回格式异常/);
});

await test('a local edit produces an accepted applyOtUpdate and an op-less ack', async () => {
  const updated = docA.remoteText.replace('Hello 世界', 'Hello 世界!');
  const plan = docA.planWrite(updated);
  assert.equal(plan.send, true);
  const update = plan.update;
  assert.deepEqual(update.op, [{ p: docA.baseText.indexOf('Hello 世界') + 'Hello 世界'.length, i: '!' }]);
  const acked = new Promise((resolve) => {
    const off = socket.on('otUpdateApplied', (event) => { off(); resolve(event); });
  });
  docA.markWritten(plan.text);
  const ack = await socket.emit('applyOtUpdate', 'doc1', update);
  assert.deepEqual(ack, []);
  const echo = await acked;
  assert.equal(echo.op, undefined);
  assert.equal(docA.receive(echo), ReceiveResult.ACK);
  assert.equal(docA.version, 4);
  assert.equal(mock.state.docs.get('doc1').text, updated);
});

await test('a remote edit is delivered and applied to the document', async () => {
  const before = docA.remoteText;
  const seen = new Promise((resolve) => {
    const off = socket.on('otUpdateApplied', (event) => { if (event.op !== undefined) { off(); resolve(event); } });
  });
  mock.state.remoteEdit('doc1', [{ p: 0, i: '% remote\n' }]);
  const event = await seen;
  assert.equal(docA.receive(event), ReceiveResult.APPLIED);
  assert.equal(docA.remoteText, `% remote\n${before}`);
});

await test('planWrite merges a concurrent local edit with the remote one', () => {
  // Remote text already carries the remote edit; simulate a local edit made
  // against the pre-remote base.
  const remote = docA.remoteText;
  const base = docA.baseText;
  const local = base.replace('Hello 世界', 'Hi 世界');
  docA.baseText = base;
  docA.remoteText = remote;
  const plan = docA.planWrite(local);
  assert.equal(plan.conflict, false);
  assert.ok(plan.text.startsWith('% remote\n'), plan.text);
  assert.ok(plan.text.includes('Hi 世界'), plan.text);
});

await test('a version gap forces a re-join', () => {
  const model = new DocumentModel({ docId: 'doc2', path: 'intro.tex' });
  model.join(['Intro line.'], 1);
  assert.equal(model.receive({ doc: 'doc2', v: 5, op: [{ p: 0, i: 'x' }] }), ReceiveResult.REJOIN);
  assert.equal(model.receive({ doc: 'doc2', v: 0, op: [{ p: 0, i: 'x' }] }), ReceiveResult.STALE);
});

await socket.close();

await test('a server rejection surfaces the real reason instead of a joinProject timeout', async () => {
  // Current Overleaf has no client-driven joinProject event: it answers a bad
  // session with `connectionRejected` and drops the socket. The old client sat
  // out 20 s plus 8 s and reported a misleading joinProject timeout.
  mock.state.rejectConnection = 'invalid session';
  const started = Date.now();
  const refused = new RealtimeSocket({ client, projectId: 'p1', connectTimeoutMs: 600 });
  await assert.rejects(refused.connect(), /重新粘贴 Cookie/);
  assert.ok(Date.now() - started < 5000, `rejection must be immediate, took ${Date.now() - started}ms`);
  mock.state.rejectConnection = 'not authorized';
  const forbidden = new RealtimeSocket({ client, projectId: 'p1', connectTimeoutMs: 600 });
  await assert.rejects(forbidden.connect(), /没有该项目的访问权限/);
  mock.state.rejectConnection = false;
});

await test('a server without the projectId handshake still connects through the v1 emit', async () => {
  // Old self-hosted servers ignore `?projectId=` and only answer the
  // client-driven `joinProject` emit with an ack.
  mock.state.failingTree = true;
  const legacy = new RealtimeSocket({ client, projectId: 'p1', connectTimeoutMs: 600 });
  const joined = await legacy.connect();
  assert.equal(joined.scheme, 'v1');
  assert.equal(joined.project._id, 'p1');
  assert.equal(joined.permissionsLevel, 'owner');
  await legacy.close();
  mock.state.failingTree = false;
});

const canonicalDir = join(scratch, 'canonical');
mkdirSync(canonicalDir, { recursive: true });
const zipMain = typeof mock.state.zipFiles['main.tex'] === 'string'
  ? Buffer.from(mock.state.zipFiles['main.tex']) : Buffer.from(mock.state.zipFiles['main.tex']);
writeFileSync(join(canonicalDir, 'main.tex'), zipMain);
writeProjectState(canonicalDir, { version: 1, server: baseUrl, projectId: 'p1', projectName: 'Mock Paper',
  files: { 'main.tex': { base: createHash('sha256').update(zipMain).digest('hex') } } });
const versionBeforeCanonicalOpen = mock.state.docs.get('doc1').version;
const canonicalLive = new OverleafLive({ localDir: canonicalDir, state: readProjectState(canonicalDir),
  createClient: () => client, log: () => {} });
await test('initial zip content is not pushed over newer realtime content', async () => {
  await canonicalLive.start();
  await sleep(300);
  assert.equal(mock.state.docs.get('doc1').version, versionBeforeCanonicalOpen);
  assert.ok(readFileSync(join(canonicalDir, 'main.tex'), 'utf8').includes('Hello 世界!'));
  await canonicalLive.stop();
});

await test('bootstrap seeds docs and binary refs without a zip', async () => {
  const dir = freshWorkspace('bootstrap');
  const manager = new LiveManager({ runtime: { createClient: () => client }, log: () => {} });
  const status = await manager.bootstrap(dir, { version: 1, server: baseUrl, projectId: 'p1',
    projectName: 'Mock Paper', files: {} });
  assert.equal(status.phase, 'connected');
  assert.equal(status.hydrated.failed.length, 0);
  assert.equal(status.hydrated.downloaded, 1);
  assert.ok(existsSync(join(dir, 'fig.png')));
  assert.ok(existsSync(join(dir, 'sections', 'methods.tex')));
  assert.ok(readFileSync(join(dir, 'main.tex'), 'utf8').includes('Hello'));
  const state = readProjectState(dir);
  assert.ok(state.files['fig.png'], 'binary fileRef recorded in state');
  assert.ok(state.files['main.tex'], 'joined document recorded in state');
  await manager.stop(dir);
});

const liveDir = join(scratch, 'live');
mkdirSync(liveDir, { recursive: true });
writeProjectState(liveDir, { version: 1, server: baseUrl, projectId: 'p1', projectName: 'Mock Paper', files: {} });
const live = new OverleafLive({ localDir: liveDir, state: readProjectState(liveDir),
  createClient: () => client, log: () => {} });

await test('live session joins docs and materializes them on disk', async () => {
  await live.start();
  await sleep(400);
  assert.equal(live.phase, 'connected');
  assert.equal(live.docs.size, 3);
  const main = readFileSync(join(liveDir, 'main.tex'), 'utf8');
  assert.ok(main.includes('Hello 世界'), main);
  assert.ok(existsSync(join(liveDir, 'sections', 'methods.tex')));
});

await test('a local file edit is pushed as OT within the debounce window', async () => {
  const original = readFileSync(join(liveDir, 'main.tex'), 'utf8');
  writeFileSync(join(liveDir, 'main.tex'), `LOCAL EDIT\n${original}`);
  await sleep(1400);
  assert.ok(mock.state.docs.get('doc1').text.startsWith('LOCAL EDIT'), mock.state.docs.get('doc1').text);
  assert.equal(readFileSync(join(liveDir, 'main.tex'), 'utf8'), mock.state.docs.get('doc1').text);
  // Overleaf rejects an update carrying a hash it does not recognise; the Git
  // blob hash used for fileRefs is not the document hash, so send none.
  assert.equal(mock.state.lastPushed.update.hash, undefined);
});

await test('a remote edit lands in the local file', async () => {
  mock.state.remoteEdit('doc2', [{ p: 0, i: 'REMOTE ' }]);
  await sleep(1200);
  assert.ok(readFileSync(join(liveDir, 'intro.tex'), 'utf8').startsWith('REMOTE '));
});

await test('remote folder rename updates descendant paths', async () => {
  mock.state.remoteTreeEvent('reciveEntityRename', ['fol1', 'parts']);
  await sleep(300);
  assert.ok(existsSync(join(liveDir, 'parts', 'methods.tex')));
  assert.ok(!existsSync(join(liveDir, 'sections', 'methods.tex')));
});

await test('stopping the session closes the socket', async () => {
  await live.stop();
  assert.equal(live.phase, 'stopped');
  const persisted = readProjectState(liveDir);
  const changes = localChanges(liveDir, persisted);
  assert.equal(changes.changed.length + changes.added.length + changes.deleted.length, 0);
});

/** A throwaway workspace with a state file, for scenarios that need a fresh session. */
function freshWorkspace(name) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeProjectState(dir, { version: 1, server: baseUrl, projectId: 'p1', projectName: 'Mock Paper', files: {} });
  return dir;
}
const openSession = (dir, options = {}) => new OverleafLive({ localDir: dir, state: readProjectState(dir),
  createClient: () => client, log: () => {}, ...options });

await test('the compile RPC payload never carries undefined', () => {
  const payload = toRpcCompileResult({ status: 'failure', pdfPath: undefined,
    errors: [{ message: 'Undefined control sequence.' }], warnings: [] });
  assert.equal(payload.pdfPath, null);
  assert.deepEqual(payload.errors, [{ file: null, line: null, message: 'Undefined control sequence.' }]);
  assert.equal(JSON.stringify(payload).includes('undefined'), false);
});

await test('edits made while an update is in flight are queued, not dropped', async () => {
  const dir = freshWorkspace('rapid');
  const session = openSession(dir, { echoTimeoutMs: 300 });
  await session.start();
  await sleep(400);
  const file = join(dir, 'main.tex');
  const base = readFileSync(file, 'utf8');
  mock.state.applyDelayMs = 500;
  writeFileSync(file, `EDIT-A\n${base}`);
  await sleep(400);                       // the first update is still unacknowledged
  assert.equal(session.docs.get('doc1').inFlight, true);
  writeFileSync(file, `EDIT-B\nEDIT-A\n${base}`);
  await sleep(2200);
  mock.state.applyDelayMs = 0;
  const server = mock.state.docs.get('doc1');
  assert.ok(server.text.startsWith('EDIT-B\nEDIT-A\n'), server.text.slice(0, 40));
  assert.equal(session.docs.get('doc1').version, server.version);
  assert.equal(session.docs.get('doc1').inFlight, false);
  await session.stop();
});

await test('stopping pushes an edit still inside the debounce window', async () => {
  const dir = freshWorkspace('stop-flush');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  const file = join(dir, 'main.tex');
  const text = `STOP-SYNC\n${readFileSync(file, 'utf8')}`;
  writeFileSync(file, text);
  await session.stop();                   // well inside the 250 ms debounce window
  assert.equal(mock.state.docs.get('doc1').text, text);
  const changes = localChanges(dir, readProjectState(dir));
  assert.deepEqual(changes, { changed: [], deleted: [], added: [] });
});

await test('flush pushes a just-saved edit without stopping the session', async () => {
  const dir = freshWorkspace('flush-now');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  const file = join(dir, 'main.tex');
  const text = `FLUSH-NOW\n${readFileSync(file, 'utf8')}`;
  writeFileSync(file, text);
  const status = await session.flushNow();  // before the 250 ms debounce fires
  assert.equal(status.phase, 'connected');
  assert.equal(mock.state.docs.get('doc1').text, text);
  await session.stop();
});

await test('a rejected push is reported and the next save recovers', async () => {
  const dir = freshWorkspace('reject-push');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  const file = join(dir, 'main.tex');
  mock.state.failPushPost = true;
  writeFileSync(file, `REJECTED\n${readFileSync(file, 'utf8')}`);
  const failed = await session.flushNow();
  assert.ok(failed.pushError.includes('main.tex'), failed.pushError);
  assert.ok(failed.pushErrorAt, 'the UI needs a timestamp to attribute the failure');

  // Even if the recovery re-join never completed, the next flush must repair
  // the base rather than throw out of the timer (the old host crash).
  session.docs.get('doc1').baseText = undefined;
  session.docs.get('doc1').needsRejoin = true;
  mock.state.failPushPost = false;
  writeFileSync(file, `RECOVERED\n${readFileSync(file, 'utf8')}`);
  const recovered = await session.flushNow();
  assert.equal(recovered.pushError, '');
  assert.equal(recovered.lastPushPath, 'main.tex');
  assert.ok(mock.state.docs.get('doc1').text.startsWith('RECOVERED\nREJECTED\n'),
    mock.state.docs.get('doc1').text.slice(0, 40));
  await session.stop();
});

await test('a paused stop keeps the edit and reports it as pending', async () => {
  const dir = freshWorkspace('stop-paused');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  const file = join(dir, 'main.tex');
  const remoteBefore = mock.state.docs.get('doc1').text;
  session.setPaused(true);
  writeFileSync(file, `PAUSED\n${readFileSync(file, 'utf8')}`);
  await session.stop();
  assert.equal(mock.state.docs.get('doc1').text, remoteBefore, 'a paused edit stays local');
  const changes = localChanges(dir, readProjectState(dir));
  assert.ok(changes.added.includes('main.tex') || changes.changed.includes('main.tex'),
    JSON.stringify(changes));
});

await test('a lost acknowledgement re-joins instead of wedging the document', async () => {
  const dir = freshWorkspace('echo');
  const session = openSession(dir, { echoTimeoutMs: 300 });
  await session.start();
  await sleep(400);
  const file = join(dir, 'main.tex');
  mock.state.dropEcho = true;
  writeFileSync(file, `ECHO-LOST\n${readFileSync(file, 'utf8')}`);
  await sleep(1600);                      // pushed, acknowledged without an echo, re-joined
  mock.state.dropEcho = false;
  const model = session.docs.get('doc1');
  assert.equal(model.inFlight, false);
  assert.equal(model.remoteText, mock.state.docs.get('doc1').text);
  writeFileSync(file, `ECHO-OK\n${readFileSync(file, 'utf8')}`);
  await sleep(1200);
  assert.ok(mock.state.docs.get('doc1').text.startsWith('ECHO-OK\nECHO-LOST\n'),
    mock.state.docs.get('doc1').text.slice(0, 40));
  await session.stop();
});

await test('a dead poll reconnects instead of staying "connected" without acks', async () => {
  const dir = freshWorkspace('reconnect');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  const oldSocket = session.socket;
  for (const [, state] of mock.state.sockets) state.queue.push('0::');
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline && (session.phase !== 'connected' || session.socket === oldSocket)) {
    await sleep(100);
  }
  assert.notEqual(session.socket, oldSocket, 'a fresh socket is created');
  assert.equal(session.phase, 'connected');
  const file = join(dir, 'main.tex');
  writeFileSync(file, `RECONNECTED\n${readFileSync(file, 'utf8')}`);
  const status = await session.flushNow();
  assert.equal(status.pushError, '');
  assert.ok(mock.state.docs.get('doc1').text.startsWith('RECONNECTED\n'), mock.state.docs.get('doc1').text.slice(0, 30));
  await session.stop();
});

await test('two remote edits delivered together both land in the file', async () => {
  const dir = freshWorkspace('batch');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  mock.state.remoteEdit('doc2', [{ p: 0, i: 'R1 ' }]);
  mock.state.remoteEdit('doc2', [{ p: 0, i: 'R2 ' }]);
  await sleep(900);
  const text = readFileSync(join(dir, 'intro.tex'), 'utf8');
  assert.ok(text.startsWith('R2 R1 '), text.slice(0, 24));
  assert.equal(session.docs.get('doc2').remoteText, mock.state.docs.get('doc2').text);
  await session.stop();
});

await test('a remote folder move rewrites every descendant path', async () => {
  mock.state.tree.rootFolder[0].folders.push({ _id: 'fol2', name: 'appendix', docs: [], fileRefs: [], folders: [] });
  const dir = freshWorkspace('move');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  mock.state.remoteTreeEvent('reciveEntityMove', ['fol1', 'fol2']);
  await sleep(400);
  assert.ok(existsSync(join(dir, 'appendix', 'sections', 'methods.tex')));
  assert.ok(!existsSync(join(dir, 'sections', 'methods.tex')));
  assert.equal(session.docs.get('doc3').path, 'appendix/sections/methods.tex');
  const target = join(dir, 'appendix', 'sections', 'methods.tex');
  writeFileSync(target, `MOVED\n${readFileSync(target, 'utf8')}`);
  await sleep(1200);
  assert.ok(mock.state.docs.get('doc3').text.startsWith('MOVED\n'));
  await session.stop();
});

await test('workspace file creation never overwrites or escapes', () => {
  const dir = freshWorkspace('create-files');
  assert.deepEqual(createWorkspaceFile(dir, 'chapters/new.tex'), { path: 'chapters/new.tex' });
  assert.ok(existsSync(join(dir, 'chapters', 'new.tex')));
  assert.equal(readFileSync(join(dir, 'chapters', 'new.tex'), 'utf8'), '');
  assert.throws(() => createWorkspaceFile(dir, 'chapters/new.tex'), /已存在/);
  assert.throws(() => createWorkspaceFile(dir, '../escape.tex'), /无效/);
  assert.throws(() => createWorkspaceFile(dir, '/absolute.tex'), /无效/);
  assert.throws(() => createWorkspaceFile(dir, '.overleaf/state.tex'), /不能/);
});

await test('workspace folder creation supports nesting and rejects duplicates', () => {
  const dir = freshWorkspace('create-folders');
  assert.deepEqual(createWorkspaceFolder(dir, 'figures/plots/'), { path: 'figures/plots' });
  assert.ok(existsSync(join(dir, 'figures', 'plots')));
  assert.throws(() => createWorkspaceFolder(dir, 'figures/plots'), /已存在/);
  assert.throws(() => createWorkspaceFolder(dir, '../escape'), /无效/);
  assert.throws(() => createWorkspaceFolder(dir, '.overleaf'), /不能/);
});

await test('a local folder created by the watcher becomes a remote folder', async () => {
  const dir = freshWorkspace('watch-folders');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  mock.state.folders = [];
  mkdirSync(join(dir, 'watched', 'nested'), { recursive: true });
  await sleep(1400);
  assert.ok(mock.state.folders.some(folder => folder.name === 'watched'),
    JSON.stringify(mock.state.folders));
  assert.ok(mock.state.folders.some(folder => folder.name === 'nested'),
    JSON.stringify(mock.state.folders));
  assert.equal(session.byPath.get('watched/nested')?.type, 'folder');
  await session.stop();
});

await test('explicit folder creation updates the remote tree', async () => {
  const dir = freshWorkspace('explicit-folder');
  const session = openSession(dir);
  await session.start();
  await sleep(400);
  assert.equal(await session.createFolder('explicit/child'), true);
  assert.equal(session.byPath.get('explicit')?.type, 'folder');
  assert.equal(session.byPath.get('explicit/child')?.type, 'folder');
  assert.ok(mock.state.folders.some(folder => folder.name === 'child'));
  await session.stop();
});

await test('LiveManager creates folders only for a running session', async () => {
  const dir = freshWorkspace('manager-folder');
  const manager = new LiveManager({ runtime: { createClient: () => client }, log: () => {} });
  assert.equal(await manager.createFolder(dir, 'before'), false);
  await manager.start(dir);
  await sleep(400);
  assert.equal(await manager.createFolder(dir, 'from-manager'), true);
  assert.ok(mock.state.folders.some(folder => folder.name === 'from-manager'));
  await manager.stopAll();
});

await test('the vendored editor chunk has the module-loader contract', () => {
  const root = new URL('..', import.meta.url);
  const chunk = readFileSync(new URL('ui/client.editor.js', root), 'utf8');
  const client = readFileSync(new URL('ui/client.js', root), 'utf8');
  assert.ok(chunk.includes("chunk: 'client.editor.js'"));
  assert.ok(chunk.includes("id: 'dsh-overleaf-workshop'"));
  assert.ok(chunk.includes('__dshOverleafCodeMirror'));
  assert.ok(chunk.includes('CodeMirror 6'));
  assert.ok(!chunk.includes('CodeMirror 5.65.16'));
  const runtime = readFileSync(new URL('scripts/editor-runtime.js', root), 'utf8');
  assert.ok(!runtime.includes('defaultHighlightStyle'),
    'tokens must use the Harness palette, not the CM default');
  assert.ok(runtime.includes('search({ top: true })') && runtime.includes("Find: '查找'"),
    'search uses the compact localized panel');
  assert.ok(chunk.includes('cm-ol-comment') && chunk.includes('cm-ol-keyword'),
    'tokens must map to the Harness palette classes');
  assert.ok(existsSync(new URL('ui/codemirror-LICENSE', root)));
  assert.ok(client.includes("require.async('./client.editor.js')"));
  assert.ok(client.includes('.cm-ol-keyword{color:var(--dsw-alias-state-idle-primary'));
  assert.ok(client.includes('.cm-ol-comment{color:#6C7086'));
  assert.ok(client.includes("content:'项目文件'") && client.includes('LAYOUT_CSS + EDITOR_CSS + FILE_TREE_CSS'),
    'the Overleaf file column keeps its compact toolbar');
  assert.ok(client.includes('data-dsh-file-icon') && client.includes('data-dsh-file-kind=tex')
    && client.includes('data-dsh-file-kind=folder'),
    'the Overleaf file tree uses semantic file icons');
  assert.ok(client.includes('decorateFileTreeRows()') && client.includes('childList: true'),
    'file-tree icons refresh after native tree updates');
  assert.ok(client.includes('data-dsh-overleaf-files-locked')
    && client.includes('[data-dockkit-tab-close]')
    && client.includes('[data-dockkit-menu-close]')
    && client.includes('patchCloseAction'),
    'the Overleaf Files tab is locked against every manual close route');
  assert.ok(client.includes("addEventListener('contextmenu', onContextMenu, true)")
    && client.includes('creationDirectory(root, row)')
    && client.includes('dsh-overleaf-create')
    && client.includes('data-dsh-create-kind=file')
    && client.includes('data-dsh-create-kind=folder'),
    'the file tree supports contextual creation actions');
  assert.ok(client.includes('targetDirectory') && client.includes('directoryRel')
    && client.includes('targetDirectory.length === 0 ? name'),
    'creation dialogs compose paths under the selected directory');
  assert.ok(client.includes('closeContextMenu()') && client.includes("event.key === 'Escape'")
    && client.includes("removeEventListener('scroll', onScroll, true)"),
    'context menus clean up on dismissal and plugin disposal');
  assert.ok(client.includes('.dsh-ol-cm .cm-panel.cm-search{display:flex'),
    'search controls use the Harness dark theme');
});

await test('PDF visibility is shared by workspace, persisted, and isolated from other projects', () => {
  const source = readFileSync(new URL('../ui/client.js', import.meta.url), 'utf8');
  const start = source.indexOf('    const pdfVisibilityStores = new Map();');
  const end = source.indexOf('\n    const DRAFT_PREFIX', start);
  const saved = new Map();
  const localStorage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const load = () => runInNewContext(`${source.slice(start, end)}; pdfVisibilityStore`, { localStorage });
  const getStore = load();
  const first = getStore('/demo/project');
  const otherFile = getStore('/demo/project');
  const otherProject = getStore('/demo/other');
  let notifications = 0;
  const unsubscribe = otherFile.subscribe(() => { notifications += 1; });
  assert.equal(first.getSnapshot(), true);
  first.set(false);
  assert.equal(otherFile.getSnapshot(), false);
  assert.equal(getStore('/demo/project').getSnapshot(), false, 'newly opened files inherit the preference');
  assert.equal(otherProject.getSnapshot(), true);
  assert.equal(notifications, 1);
  assert.equal(load()('/demo/project').getSnapshot(), false, 'reload restores the preference');
  otherFile.set((value) => !value);
  assert.equal(first.getSnapshot(), true);
  assert.equal(notifications, 2);
  unsubscribe();
  first.set(false);
  assert.equal(notifications, 2);
});

await test('inline PDF reader fetches changed bytes and preserves file-service errors', async () => {
  const source = readFileSync(new URL('../ui/client.js', import.meta.url), 'utf8');
  const start = source.indexOf('    function pdfReader(ctx) {');
  const end = source.indexOf('\n    /** Render the host', start);
  const pdfReader = runInNewContext(`(${source.slice(start, end).trim()})`);
  let reads = 0;
  const signal = new AbortController().signal;
  const data = new Uint8Array([37, 80, 68, 70]);
  const files = {
    stat: async (session, path, receivedSignal) => {
      assert.equal(session, 'demo'); assert.equal(path, 'output.pdf'); assert.equal(receivedSignal, signal);
      return { ok: true, value: { version: 'v2' } };
    },
    readBytes: async () => { reads += 1; return { ok: true, value: { version: 'v2', data } }; },
  };
  const read = pdfReader({ get: (name) => name === 'remote.workspaceFiles' ? files : undefined });
  assert.equal(await read('demo', signal, 'v2'), undefined);
  assert.equal(reads, 0, 'unchanged PDF must not reload the viewer');
  assert.equal((await read('demo', signal, 'v1')).data, data);
  assert.equal(reads, 1);
  files.stat = async () => ({ ok: false, error: { message: 'permission denied' } });
  await assert.rejects(read('demo', signal), /permission denied/);
  assert.equal(reads, 1, 'failed authorization must not fall through to reading bytes');
});

await test('createOverleafLayout reserves the editor track and masks the dock while preparing a fresh session', async () => {
  const source = readFileSync(new URL('../ui/client.js', import.meta.url), 'utf8');
  assert.match(source,
    /\.dsh-ol-flipped\[data-ol-preparing="true"\]>\[class\*="rightbarCol"\]\{opacity:0!important;pointer-events:none!important;visibility:hidden!important;/,
    'preparing may mask only the right Dock');
  assert.doesNotMatch(source,
    /\.dsh-ol-flipped\[data-ol-preparing="true"\]>\[class\*="sidebarCol"\].*visibility:hidden/u,
    'the persistent root sidebar must remain visible during session navigation');
  const start = source.indexOf('    function createOverleafLayout(ctx) {');
  const end = source.indexOf('\n    /**\n     * Mount the Overleaf section', start);
  assert.ok(start > 0 && end > start, 'createOverleafLayout slice located');

  const makeStyle = () => {
    const props = new Map();
    return {
      gridTemplateColumns: '260px minmax(0px, 1fr) minmax(0px, 0px)',
      display: '',
      left: '',
      setProperty: (k, v) => props.set(k, v),
      getPropertyValue: (k) => props.get(k) ?? '',
      removeProperty: (k) => props.delete(k),
    };
  };
  const makeClassList = () => {
    const set = new Set();
    return {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
      toggle: (c, force) => (force ? set.add(c) : set.delete(c)),
    };
  };
  const attrs = new Map();
  const children = [];
  const frame = {
    clientWidth: 1460,
    isConnected: true,
    style: makeStyle(),
    classList: makeClassList(),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    removeAttribute: (k) => attrs.delete(k),
    hasAttribute: (k) => attrs.has(k),
    getAttribute: (k) => attrs.get(k) ?? null,
    append: (node) => { node.parentElement = frame; if (!children.includes(node)) children.push(node); },
  };
  const centerCol = { parentElement: frame };
  const timers = new Set();
  const observers = new Set();
  const notifyFrameMutated = () => {
    for (const obs of observers) obs.enqueue({ target: frame, type: 'attributes' });
  };
  frame.classList.add = ((orig) => (c) => { orig(c); notifyFrameMutated(); })(frame.classList.add);
  frame.style.setProperty = ((orig) => (k, v) => { orig(k, v); notifyFrameMutated(); })(frame.style.setProperty);
  const context = {
    LAYOUT_CSS: '.dsh-ol-flipped{}',
    EDITOR_CSS: '.dsh-ol-cm{}',
    FILE_TREE_CSS: '.dsh-ol-flipped [data-files-root]{}',
    CHAT_WIDTH: 400,
    decorateFileTreeRows: () => {},
    MutationObserver: class {
      constructor(cb) { this.cb = cb; this.records = []; this.scheduled = false; }
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); this.records = []; }
      takeRecords() { const out = this.records; this.records = []; return out; }
      enqueue(rec) {
        this.records.push(rec);
        if (!this.scheduled) {
          this.scheduled = true;
          queueMicrotask(() => {
            this.scheduled = false;
            if (this.records.length > 0 && observers.has(this)) this.cb(this.takeRecords());
          });
        }
      }
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    document: {
      head: { append: () => {} },
      createElement: () => ({
        className: '',
        style: makeStyle(),
        setAttribute: () => {},
        addEventListener: () => {},
        hasPointerCapture: () => false,
        releasePointerCapture: () => {},
        remove() { this.parentElement = null; },
      }),
      querySelector: (sel) => (sel === '[class*="centerCol"]' ? centerCol : null),
    },
    setTimeout: (fn) => { const id = { fn }; timers.add(id); return id; },
    clearTimeout: (id) => timers.delete(id),
  };

  const createOverleafLayout = runInNewContext(`(${source.slice(start, end).trim()})`, context);
  const layout = createOverleafLayout({});

  // Fresh session before right panel opens (rightbarMax === 0): preparing locks
  // the middle editor track at 800px (1460 - 260 - 400) and masks the dock.
  layout.setPreparing(true, true);
  assert.equal(frame.classList.contains('dsh-ol-flipped'), true);
  assert.equal(frame.getAttribute('data-ol-preparing'), 'true');
  assert.equal(frame.style.getPropertyValue('--dsh-ol-flipped-columns'),
    '260px minmax(0px, 800px) minmax(400px, 1fr)',
    'chat column must not expand across the window while the new session opens');

  // Once the Files tab opens, rightbarMax becomes non-zero and endEnter lifts
  // the mask with zero column track shift.
  frame.style.gridTemplateColumns = '260px minmax(0px, 1fr) minmax(0px, 920px)';
  layout.setPreparing(false, false);
  assert.equal(frame.hasAttribute('data-ol-preparing'), false);
  assert.equal(frame.style.getPropertyValue('--dsh-ol-flipped-columns'),
    '260px minmax(0px, 800px) minmax(400px, 1fr)',
    'lifting the preparing mask keeps the exact same column geometry');

  // During an existing-session switch Harness briefly reports a closed native
  // right track (0px). The Overleaf shell must retain the last geometry until
  // the new session's Dock is mounted instead of collapsing the editor column.
  frame.style.gridTemplateColumns = '260px minmax(0px, 1fr) minmax(0px, 0px)';
  layout.refresh();
  assert.equal(frame.style.getPropertyValue('--dsh-ol-flipped-columns'),
    '260px minmax(0px, 800px) minmax(400px, 1fr)',
    'a transient native 0px right track must not move the editor edge');
  frame.style.gridTemplateColumns = '260px minmax(0px, 1fr) minmax(0px, 920px)';
  layout.refresh();

  // Flush microtasks to verify apply()'s own DOM writes never re-trigger the
  // MutationObserver in an infinite microtask loop or schedule self-echoes.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.size, 0, 'takeRecords() drains self-mutations so no observer echo is scheduled');

  layout.dispose();
  assert.equal(frame.classList.contains('dsh-ol-flipped'), false);
  assert.equal(timers.size, 0);
});

await test('fresh session entry pre-registers session mapping, resizes 25/75 before opening main.tex, and skips duplicate PDF tab', async () => {
  const source = readFileSync(new URL('../ui/client.js', import.meta.url), 'utf8');
  let pluginDef;
  const savedStorage = new Map();
  const columnHistory = [];
  const events = [];

  const makeStyle = (initialCols = '') => {
    const props = new Map();
    return {
      gridTemplateColumns: initialCols,
      display: '',
      left: '',
      setProperty: (k, v) => {
        props.set(k, v);
        if (k === '--dsh-ol-flipped-columns') columnHistory.push(v);
      },
      getPropertyValue: (k) => props.get(k) ?? '',
      removeProperty: (k) => props.delete(k),
    };
  };
  const makeNode = (tag = 'div') => {
    const attrs = new Map();
    const classes = new Set();
    const node = {
      tagName: tag.toUpperCase(),
      className: '',
      dataset: {},
      children: [],
      childElementCount: 0,
      parentElement: null,
      isConnected: true,
      clientWidth: 1460,
      scrollTop: 0,
      style: makeStyle(),
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
        toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
      append: (...kids) => {
        for (const kid of kids) {
          if (kid && typeof kid === 'object') { kid.parentElement = node; node.children.push(kid); }
        }
        node.childElementCount = node.children.length;
      },
      prepend: (kid) => {
        if (kid && typeof kid === 'object') { kid.parentElement = node; node.children.unshift(kid); }
        node.childElementCount = node.children.length;
      },
      replaceChildren: () => { node.children = []; node.childElementCount = 0; },
      remove: () => { node.parentElement = null; },
      addEventListener: () => {},
      removeEventListener: () => {},
      hasPointerCapture: () => false,
      releasePointerCapture: () => {},
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 400, height: 600, left: 0, bottom: 20 }),
    };
    return node;
  };

  const frame = makeNode('div');
  frame.style = makeStyle('260px minmax(0px, 1fr) minmax(0px, 900px)');
  const centerCol = makeNode('div');
  centerCol.parentElement = frame;
  const regionArea = makeNode('div');
  const splitEl = makeNode('div');
  splitEl.dataset.dockkitSplit = 'split-1';

  const panes = [];
  const tabs = [];
  let mountedSession = 'old-session';
  let selectedSession = 'old-session';
  const resizedSplits = [];

  const paneActions = {
    resizeSplit: (sid, splitId, ratios) => {
      events.push(`resizeSplit:${ratios.join('/')}`);
      resizedSplits.push({ sid, splitId, ratios });
    },
    placeTab: (sid, tabId, paneId) => {
      const tab = tabs.find((item) => item.id === tabId);
      if (tab) tab.paneId = paneId;
    },
  };

  const makePane = (id, x) => {
    const pane = makeNode('div');
    pane.dataset.dockkitPane = id;
    pane.closest = (sel) => (sel === '[data-dockkit-split]' ? splitEl : null);
    pane.getBoundingClientRect = () => ({ x, y: 0, width: 300, height: 600 });
    return pane;
  };

  const rightbarCol = makeNode('div');
  rightbarCol.querySelectorAll = (sel) => {
    if (sel === '[data-dockkit-pane]') return panes;
    if (sel === '[data-dockkit-tab]' || sel === '[data-sidebar-right-tab],[data-dockkit-tab]') {
      return tabs.map((tab) => {
        const chip = makeNode('div');
        chip.setAttribute('data-dockkit-tab', tab.id);
        chip.__reactFiber$test = { memoizedProps: { sessionId: mountedSession, actions: paneActions }, return: null };
        chip.closest = (s) => {
          if (s === '[data-dockkit-pane]') return panes.find((p) => p.dataset.dockkitPane === tab.paneId) ?? null;
          return null;
        };
        chip.getBoundingClientRect = () => ({ x: 0, y: 0, width: 80, height: 28 });
        return chip;
      });
    }
    return [];
  };

  const sidebarRight = {
    mounted: { getSnapshot: () => mountedSession },
    tabsIn: () => tabs,
    active: () => tabs.at(-1),
    commandTarget: () => ({ tabId: 'guide-1' }),
    openTabFromTarget: (kind) => {
      events.push(`openTab:${kind}:preparing=${frame.getAttribute('data-ol-preparing')}`);
      frame.style.gridTemplateColumns = '260px minmax(0px, 1fr) minmax(0px, 900px)';
      if (panes.length === 0) panes.push(makePane('pane-left', 260));
      tabs.splice(0, tabs.length, { id: 'files-1', kind: 'files', paneId: 'pane-left' });
    },
    split: () => {
      events.push(`split:preparing=${frame.getAttribute('data-ol-preparing')}`);
      panes.push(makePane('pane-right', 560));
      tabs.push({ id: 'guide-seeded', kind: 'guide', paneId: 'pane-right' });
      return 'pane-right';
    },
    openResource: (address, options) => {
      events.push(`openResource:${address}:pane=${options?.paneId}:preparing=${frame.getAttribute('data-ol-preparing')}`);
      tabs.push({ id: `tab-${tabs.length + 1}`, kind: options?.kind ?? 'doc', contentId: address, paneId: options?.paneId ?? 'pane-right' });
    },
    closeIn: (_sid, tabId) => {
      events.push(`closeIn:${tabId}`);
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx >= 0) tabs.splice(idx, 1);
    },
    focus: (tabId) => { events.push(`focus:${tabId}`); },
  };

  const mainRegistrations = [];
  const ctx = {
    get: (name) => (name === 'sidebarRight' ? sidebarRight : undefined),
    effect: (fn) => { fn(); },
    inject: () => {},
    slots: {
      inject: (slotName, cb) => { if (slotName === 'main') cb(); },
      register: (meta, comp) => { mainRegistrations.push({ meta, comp }); return () => {}; },
    },
    layout: { selectPanel: () => {} },
    connection: {
      rpc: {
        call: async (_ep, method) => {
          if (method === 'overleafUi/prepare') {
            return { ok: true, value: { localDir: '/demo/paper', bound: true, mainFile: 'main.tex', hasPdf: true } };
          }
          if (method === 'overleafUi/open') {
            return { ok: true, value: { localDir: '/demo/paper', workspaceId: 'ws-1' } };
          }
          return { ok: true, value: { servers: 1, workspaces: [{ localDir: '/demo/paper', projectName: 'Paper', server: baseUrl, projectId: 'p1', bound: true, phase: 'idle', paused: false, collaborators: 0, pending: 0, error: '' }] } };
        },
      },
    },
    workspaces: {
      list: {
        getSnapshot: () => ({ items: [{ workspaceId: 'ws-1', path: '/demo/paper', sessionIds: ['old-session'] }], archivedSessionIds: [] }),
        subscribe: () => () => {},
      },
    },
    uiWorkspace: {
      selection: { getSnapshot: () => ({ sessionId: selectedSession }), subscribe: () => () => {} },
      openWorkspace: async (_wsId, onSession) => {
        // Fresh session initially has its rightbar closed (rightbarMax === 0)
        // and workspaces.list does not yet contain new-session!
        frame.style.gridTemplateColumns = '260px minmax(0px, 1fr) minmax(0px, 0px)';
        selectedSession = 'new-session';
        onSession('new-session');
        const sessionsMap = JSON.parse(savedStorage.get('dsh-overleaf:sessions') ?? '{}');
        assert.equal(sessionsMap['new-session'], '/demo/paper',
          'session mapping must be stored synchronously inside openWorkspace callback');
        assert.equal(frame.getAttribute('data-ol-preparing'), 'true',
          'preparing mask must already be active during openWorkspace');
      },
      openSession: async (id) => {
        selectedSession = id;
        mountedSession = id;
        tabs.length = 0;
        panes.length = 0;
      },
    },
  };

  const pendingTimeouts = new Set();
  const vmWindow = {
    innerWidth: 1460,
    innerHeight: 900,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    __ModuleLoader__: {
      load: ({ factory }) => {
        pluginDef = factory((mod) => {
          if (mod === 'react') {
            return {
              createElement: () => null,
              forwardRef: (fn) => fn,
              useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
              useEffect: () => {},
              useCallback: (fn) => fn,
              useRef: (v) => ({ current: v }),
              useLayoutEffect: () => {},
              useImperativeHandle: () => {},
              useSyncExternalStore: (_s, get) => get(),
            };
          }
          return {};
        });
      },
    },
  };

  runInNewContext(source, {
    window: vmWindow,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Element: class {},
    Node: class {},
    AbortController,
    MutationObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    localStorage: {
      getItem: (k) => savedStorage.get(k) ?? null,
      setItem: (k, v) => savedStorage.set(k, String(v)),
      removeItem: (k) => savedStorage.delete(k),
    },
    requestAnimationFrame: (cb) => { setImmediate(() => cb(0)); return 1; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn, ms) => {
      if (ms >= 200) { const fake = {}; pendingTimeouts.add(fake); return fake; }
      return setTimeout(fn, Math.min(ms ?? 0, 5));
    },
    clearTimeout: (id) => { pendingTimeouts.delete(id); clearTimeout(id); },
    setInterval: () => ({}),
    clearInterval: () => {},
    console,
    document: {
      visibilityState: 'visible',
      head: { append: () => {} },
      body: { append: () => {} },
      documentElement: { classList: { toggle: () => {}, remove: () => {} } },
      createElement: (tag) => makeNode(tag),
      createElementNS: (_ns, tag) => makeNode(tag),
      createTextNode: (t) => ({ textContent: t }),
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: (sel) => {
        if (sel === '[class*="centerCol"]') return centerCol;
        if (sel === '[class*="regionArea"]') return regionArea;
        if (sel === '[class*="rightbarCol"]') return rightbarCol;
        return null;
      },
      querySelectorAll: () => [],
    },
  });

  pluginDef.apply(ctx);
  const services = mainRegistrations[0].meta.inject().services;
  await services.enterWorkspace('ws-1', '/demo/paper', { fresh: true });

  assert.ok(columnHistory.length > 0 && columnHistory.every((cols) => cols.includes('minmax(0px, 800px)')),
    `columns never collapsed to 0px during fresh session switch: ${JSON.stringify(columnHistory)}`);
  assert.equal(frame.hasAttribute('data-ol-preparing'), false, 'preparing mask lifted on completion');

  const resizeIdx = events.findIndex((e) => e.startsWith('resizeSplit:0.25/0.75'));
  const openTexIdx = events.findIndex((e) => e.startsWith('openResource:dsh-resource://file/session/new-session/main.tex'));
  assert.ok(resizeIdx >= 0 && openTexIdx > resizeIdx,
    `25/75 split ratio must be set before main.tex mounts: ${JSON.stringify(events)}`);
  assert.ok(!events.some((e) => e.includes('output.pdf')),
    `standalone output.pdf tab must not auto-open when main.tex exists: ${JSON.stringify(events)}`);
  assert.ok(events.some((e) => e === 'closeIn:guide-seeded'),
    `seeded guide tab pruned before curtain lifts: ${JSON.stringify(events)}`);
});

mock.server.close();
mock.server.closeAllConnections?.();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} scenarios passed`);
