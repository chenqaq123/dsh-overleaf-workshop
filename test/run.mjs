/**
 * End-to-end scenarios for the Overleaf client, sync and compile modules,
 * against the local mock server. No harness modules are involved.
 *
 * Run with: node test/run.mjs
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMock } from './mock.mjs';
import { OverleafClient, blobHash, normalizeCookieInput } from '../lib/api.js';
import { parseLog } from '../lib/compile.js';
import { RealtimeSocket } from '../lib/socket.js';
import { DocumentModel, decodeJoinLines, parseJoinAck, ReceiveResult } from '../lib/documents.js';
import { applyOps, mergeTexts, textToOps } from '../lib/ot.js';
import { OverleafLive, connectedCollaborators } from '../lib/live.js';
import { LiveManager } from '../lib/live-manager.js';
import { createWorkspaceFile, createWorkspaceFolder } from '../lib/workspace-files.js';
import { writeProjectState, readProjectState } from '../lib/store.js';

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
  assert.ok(chunk.includes('CodeMirror 5.65.16'));
  assert.ok(existsSync(new URL('ui/codemirror-LICENSE', root)));
  assert.ok(client.includes("require.async('./client.editor.js')"));
});

mock.server.close();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} scenarios passed`);
