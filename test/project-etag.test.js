// A project's description written over the revision the page read only (#4726): GET /api/projects/:p sends its
// ETag (the file's text hashed), PUT with If-Match writes over that one only and sends the new one; a stale If-Match is
// a 412 whose body holds the current description and its revision, and nothing is written; a PUT with no If-Match
// (the CLI's, an older page's) writes as before. The page's side (web/js/api.js) merges and writes again.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp, app, P;
before(async () => { tmp = await scratchEnv('silinx-project-etag-'); P = await import('../server/projects.js'); app = await startApp(); });
after(async () => { await app?.close(); await fsp.rm(tmp, { recursive: true, force: true }); });

const onDisk = async name => fsp.readFile(path.join(process.env.SILINX_WORKSPACE, name, 'silinx.json'), 'utf8');
// an independent computation of the revision: the file's text, sha-256, base64url, 27 characters, quoted
const etagOfText = text => `"${crypto.createHash('sha256').update(text).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 27)}"`;

test('GET sends the revision of the file\'s text; PUT over it writes and sends the new one', async () => {
  assert.equal((await app.call('POST', '/projects', { name: 'Tagged' })).status, 200);
  const r = await app.call('GET', '/projects/Tagged');
  assert.equal(r.status, 200);
  const etag = r.headers.get('etag');
  assert.equal(etag, etagOfText(await onDisk('Tagged')));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const { fileTree, ...pj } = r.body;   // eslint-disable-line no-unused-vars
  const w = await app.call('PUT', '/projects/Tagged', { ...pj, simTop: null, top: 'a' }, { 'If-Match': etag });
  assert.equal(w.status, 200);
  assert.equal(w.body.top, 'a');
  assert.equal(w.headers.get('etag'), etagOfText(await onDisk('Tagged')));
  assert.notEqual(w.headers.get('etag'), etag);
});

test('a stale If-Match: 412 with the current description and its revision, nothing written', async () => {
  assert.equal((await app.call('POST', '/projects', { name: 'Stale' })).status, 200);
  const read = await app.call('GET', '/projects/Stale');
  const stale = read.headers.get('etag');
  // meanwhile, the MCP server registers a file (the same functions, another process's)
  await P.writeFile('Stale', 'src/mcp.vhd', 'entity mcp is end mcp;\narchitecture r of mcp is begin end r;\n');
  const before = await onDisk('Stale');
  const { fileTree, ...pj } = read.body;   // eslint-disable-line no-unused-vars
  const w = await app.call('PUT', '/projects/Stale', { ...pj, top: 'b' }, { 'If-Match': stale });
  assert.equal(w.status, 412);
  assert.equal(w.body.error, "the project 'Stale' was changed meanwhile (by another tab or process)");
  assert.deepEqual(w.body.project.files.map(f => f.path), ['src/mcp.vhd']);
  assert.equal(w.body.etag, etagOfText(before));
  assert.equal(w.headers.get('etag'), w.body.etag);
  assert.equal(await onDisk('Stale'), before, 'nothing written');
  // written again over the current revision: taken
  const again = await app.call('PUT', '/projects/Stale', { ...w.body.project, top: 'b' }, { 'If-Match': w.body.etag });
  assert.equal(again.status, 200);
  const disk = JSON.parse(await onDisk('Stale'));
  assert.equal(disk.top, 'b');
  assert.deepEqual(disk.files.map(f => f.path), ['src/mcp.vhd']);
});

test('no If-Match (the CLI, an older page): written as before; the server\'s own fields kept; a project not there, a 404', async () => {
  assert.equal((await app.call('POST', '/projects', { name: 'Blind' })).status, 200);
  const id = JSON.parse(await onDisk('Blind')).id;
  const { fileTree, ...pj } = (await app.call('GET', '/projects/Blind')).body;   // eslint-disable-line no-unused-vars
  const w = await app.call('PUT', '/projects/Blind', { ...pj, top: 'c', id: 'not-its-id' });
  assert.equal(w.status, 200);
  assert.equal(JSON.parse(await onDisk('Blind')).top, 'c');
  assert.equal(JSON.parse(await onDisk('Blind')).id, id);
  assert.equal((await app.call('GET', '/projects/Nope')).status, 404);
});

test('P.etagOf: the revision of a description read or written, none for any other object', async () => {
  assert.equal((await app.call('POST', '/projects', { name: 'Direct' })).status, 200);
  const pj = await P.readProject('Direct');
  assert.equal(P.etagOf(pj), etagOfText(await onDisk('Direct')));
  const out = await P.updateProject('Direct', p => { p.top = 'd'; });
  assert.equal(P.etagOf(out), etagOfText(await onDisk('Direct')));
  assert.equal(P.etagOf({ ...pj }), undefined);
  const now = await onDisk('Direct');
  await assert.rejects(P.writeProject('Direct', { ...pj, top: 'e' }, { ifMatch: P.etagOf(pj) }),
    e => e.status === 412 && e.etag === etagOfText(now) && e.project.top === 'd');
  assert.equal(await onDisk('Direct'), now);
});
