// The HTTP API's names (#4754): a project's routes with the project in the address (program, prom, Open in VS Code), the
// older forms with { project } in the body kept; the imports at /import-zip and /import-xise (their older names kept), an
// import's lock its new project's, never a project named import-zip; Merge Contribution's choices in a JSON body with
// the zip, not in a header (the older form kept); and X-Silinx-Version: the server's said to a page of another version,
// even when its token is refused, and to nobody else (#1236); the page offering a reload (web/js/stale-page.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { scratchEnv, startApp, writeConfig } from './server-helpers.js';
import { VERSION } from '../core/version.js';
import { watchStale, staleText } from '../web/js/stale-page.js';

let tmp, app;
before(async () => { tmp = await scratchEnv('silinx-http-naming-'); await writeConfig({ mode: 'silinx' }); app = await startApp(); });
after(async () => { await app?.close(); await fs.rm(tmp, { recursive: true, force: true }); });

test('X-Silinx-Version: the server\'s to a page of another version, none to the same version nor to a client that names none', async () => {
  let r = await app.call('GET', '/workspace', undefined, { 'X-Silinx-Version': '0.0.1' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-silinx-version'), VERSION);
  r = await app.call('GET', '/workspace', undefined, { 'X-Silinx-Version': VERSION });
  assert.equal(r.headers.get('x-silinx-version'), null);
  r = await app.call('GET', '/workspace');
  assert.equal(r.headers.get('x-silinx-version'), null);
});

test('X-Silinx-Version: said with the token\'s refusal too (a page left open across an upgrade)', async () => {
  const a = await startApp({ token: 'the-server-token-4754' });
  try {
    const r = await a.call('GET', '/workspace', undefined, { 'X-Silinx-Version': '0.0.1', 'X-Silinx-Token': 'the-old-token' });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get('x-silinx-version'), VERSION);
  } finally { await a.close(); }
});

test('program, prom, Open in VS Code: the project in the address, as their older form with it in the body; the two differing refused', async () => {
  for (const [path, older] of [['program', '/program'], ['prom', '/prom'], ['editor/open', '/editor/open']]) {
    const ghost = await app.call('POST', `/projects/Ghost/${path}`, {});
    const was = await app.call('POST', older, { project: 'Ghost' });
    assert.deepEqual([ghost.status, ghost.body], [was.status, was.body], path);
    assert.equal(ghost.status, 404, path);
    const two = await app.call('POST', `/projects/Ghost/${path}`, { project: 'Other' });
    assert.deepEqual([two.status, two.body], [400, { error: 'project: \'Other\' in the body, \'Ghost\' in the address' }], path);
  }
});

test('the imports at /import-zip and /import-xise, their older names kept', async () => {
  await app.call('POST', '/projects', { name: 'Src', template: 'gates' });
  const zip = (await app.call('GET', '/projects/Src/export.zip?kind=silinx')).body;
  let r = await app.call('POST', '/import-zip?name=NewZip', new Uint8Array(zip));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.project.name, 'NewZip');
  r = await app.call('POST', '/projects/import-zip?name=OldZip', new Uint8Array(zip));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const xise = (await app.call('GET', '/projects/Src/export.xise')).body;
  r = await app.call('POST', '/import-xise', { name: 'NewXise', xise, files: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.project.name, 'NewXise');
});

test('Merge Contribution: the choices and the label in a JSON body with the zip (base64); the older form kept', async () => {
  await app.call('POST', '/projects', { name: 'M', template: 'gates' });
  const zip = Buffer.from((await app.call('GET', '/projects/M/export.zip?kind=silinx&copy=1')).body);
  let r = await app.call('POST', '/projects/M/merge', { zip: zip.toString('base64'), resolve: {}, label: 'Ana\'s copy' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.lines.some(l => l.includes('Ana\'s copy')), r.body.lines.join('\n'));
  r = await app.call('POST', '/projects/M/merge', { zip: zip.toString('base64'), resolve: [] });
  assert.deepEqual([r.status, r.body], [400, { error: 'resolve: the choices, an object' }]);
  r = await app.call('POST', '/projects/M/merge', { resolve: {} });
  assert.deepEqual([r.status, r.body], [400, { error: 'zip: the contribution\'s zip, in base64' }]);
  r = await app.call('POST', '/projects/M/merge?label=older', new Uint8Array(zip), { 'X-Silinx-Resolve': encodeURIComponent('{}') });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.lines.some(l => l.includes('older')), r.body.lines.join('\n'));
});

test('the page: a server of another version said once in the console, a reload offered; Later reloads nothing', async () => {
  const target = new EventTarget(), lines = [], asked = [];
  let reloads = 0, answer = true;
  const stop = watchStale({ logWarning: t => lines.push(t), confirmDlg: async (...a) => { asked.push(a); return answer; }, reload: () => { reloads++; }, target });
  target.dispatchEvent(new CustomEvent('silinx-stale', { detail: { page: '15.28.0', server: VERSION } }));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(lines, [`This page is Silinx 15.28.0, the server Silinx ${VERSION}: reload the page to use it (its requests may be refused until then).`]);
  assert.equal(staleText({ page: '1', server: '2' }), 'This page is Silinx 1, the server Silinx 2: reload the page to use it (its requests may be refused until then).');
  assert.deepEqual(asked, [['Silinx was updated', `This page is Silinx 15.28.0; the server is Silinx ${VERSION}. Reload the page?`, { yes: 'Reload', no: 'Later' }]]);
  assert.equal(reloads, 1);
  answer = false;
  target.dispatchEvent(new CustomEvent('silinx-stale', { detail: { page: '15.28.0', server: VERSION } }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(reloads, 1);
  stop();
});

test('the page\'s requests: a server of another version told once (a \'silinx-stale\' event)', async () => {
  const { staleCheck } = await import('../web/js/api.js');
  // (Node has no window: the page's dispatchEvent stood in for)
  const seen = [];
  globalThis.dispatchEvent = e => { seen.push([e.type, e.detail]); return true; };
  try {
    const answer = v => ({ headers: new Headers(v ? { 'X-Silinx-Version': v } : {}) });
    staleCheck(answer(null));
    staleCheck(answer(VERSION));
    assert.deepEqual(seen, []);
    staleCheck(answer('99.0.0'));
    staleCheck(answer('99.0.1'));
    assert.deepEqual(seen, [['silinx-stale', { page: VERSION, server: '99.0.0' }]]);
  } finally { delete globalThis.dispatchEvent; }
});
