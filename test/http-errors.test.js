// The local server's HTTP API, its refusals (#4753, server/http-errors.js): one envelope for every router ({ error,
// hint?, details }), a file system's error never naming the server's paths, the bodies of implement and capture checked
// as the MCP's run_process and capture take theirs, PUT /toolchain refusing a setting it does not know, bitinfo's path
// the project's, and export.xise a GET that takes no project's lock.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { scratchEnv, startApp, writeConfig } from './server-helpers.js';
import { errorBody, pathFree, systemError, bodyError, IMPLEMENT_BODY, CAPTURE_BODY, CAPTURE_TIMEOUT_S } from '../server/http-errors.js';

let tmp, app;
before(async () => { tmp = await scratchEnv('silinx-http-errors-'); await writeConfig({ mode: 'silinx' }); app = await startApp(); });
after(async () => { await app?.close(); await fs.rm(tmp, { recursive: true, force: true }); });

test('errorBody, pathFree: a status\'s message and details; the system\'s own error an internal error, its path never sent', () => {
  const enoent = Object.assign(new Error('ENOENT: no such file or directory, open \'/srv/silinx/ws/x.json\''), { code: 'ENOENT', syscall: 'open', errno: -2 });
  assert.equal(systemError(enoent), true);
  assert.equal(pathFree(enoent), 'open failed (ENOENT)');
  assert.deepEqual(errorBody(enoent), { status: 500, body: { error: 'internal server error' } });
  assert.deepEqual(errorBody(Object.assign(new Error('ERR_X'), { code: 'ERR_INVALID_ARG_TYPE' })).body, { error: 'internal server error' });
  const git = Object.assign(new Error('git pull: in conflict'), { status: 409, hint: 'Choose a side.', files: ['a.v'], resolvable: false, other: 1 });
  assert.deepEqual(errorBody(git), { status: 409, body: { error: 'git pull: in conflict', hint: 'Choose a side.', files: ['a.v'], resolvable: false } });
  assert.deepEqual(errorBody(new Error('plain')), { status: 500, body: { error: 'plain' } });
  assert.equal(pathFree(new Error('a message')), 'a message');
  // (a status with a system's code: the route's own message, kept)
  assert.equal(systemError(Object.assign(new Error('file not found'), { status: 404, code: 'ENOENT' })), false);
});

test('bodyError: the MCP\'s messages; the bodies of implement and capture', () => {
  assert.equal(bodyError({ steps: 'synth', toolchain: 'silinx', generateOnly: true, synthUpToDate: false }, IMPLEMENT_BODY), null);
  assert.equal(bodyError(undefined, IMPLEMENT_BODY), null);
  assert.equal(bodyError({ toolchain: 'quartus' }, IMPLEMENT_BODY), 'toolchain: one of silinx, open, ise, vivado');
  assert.equal(bodyError({ generateOnly: 'yes', steps: [1] }, IMPLEMENT_BODY), 'generateOnly: true or false; steps[0]: a string');
  assert.equal(bodyError({ toolchain: 'ise', run: true }, IMPLEMENT_BODY), 'unknown run');
  assert.equal(bodyError({ arm: false, timeoutS: 30, device: 1 }, CAPTURE_BODY), null);
  assert.equal(bodyError({ timeoutS: CAPTURE_TIMEOUT_S + 1 }, CAPTURE_BODY), `timeoutS: at most ${CAPTURE_TIMEOUT_S}`);
  assert.equal(bodyError({ timeoutS: 0, device: -1 }, CAPTURE_BODY), 'timeoutS: at least 0.1; device: at least 0');
  assert.equal(bodyError({ device: 1.5, arm: 'no' }, CAPTURE_BODY), 'device: an integer; arm: true or false');
});

// #5128: the page's capture (web/js/capture-ui.js) gives the browser edition's fields too (the core's spec, probes, top,
// clock); the server's client sends its own options only, which CAPTURE_BODY takes
test('the page\'s capture body: the server\'s options only, accepted; the browser edition\'s fields refused if sent', async () => {
  const { captureBody } = await import('../web/js/api.js');
  const page = { arm: true, timeoutS: 10, spec: { width: 8 }, probes: [{ path: 'led', name: 'led', width: 8 }], top: 'top', clock: 'clk' };
  const sent = JSON.parse(JSON.stringify(captureBody(page)));
  assert.deepEqual(sent, { arm: true, timeoutS: 10 });
  assert.equal(bodyError(sent, CAPTURE_BODY), null);
  assert.deepEqual(JSON.parse(JSON.stringify(captureBody({ device: 1 }))), { device: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(captureBody())), {});
  assert.equal(bodyError(page, CAPTURE_BODY), 'unknown spec, probes, top, clock');
});

test('the routes: implement and capture refused with the MCP\'s message, before anything runs; the one envelope', async () => {
  await app.call('POST', '/projects', { name: 'H', template: 'gates' });
  let r = await app.call('POST', '/projects/H/implement', { toolchain: 'quartus' });
  assert.deepEqual([r.status, r.body], [400, { error: 'toolchain: one of silinx, open, ise, vivado' }]);
  r = await app.call('POST', '/projects/H/implement', { steps: 'synth', later: 1 });
  assert.deepEqual([r.status, r.body], [400, { error: 'unknown later' }]);
  r = await app.call('POST', '/projects/H/implement', [1, 2]);
  assert.deepEqual([r.status, r.body], [400, { error: 'the body: a JSON object' }]);
  r = await app.call('POST', '/projects/H/capture', { timeoutS: 1e9 });
  assert.deepEqual([r.status, r.body], [400, { error: `timeoutS: at most ${CAPTURE_TIMEOUT_S}` }]);
  r = await app.call('POST', '/projects/H/capture', { arm: 'no' });
  assert.deepEqual([r.status, r.body], [400, { error: 'arm: true or false' }]);
  // (git's router: the same envelope, its hint)
  r = await app.call('POST', '/gist', {});
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body), ['error']);
});

test('PUT /toolchain: a setting it does not know refused, nothing written; a known one kept', async () => {
  let r = await app.call('PUT', '/toolchain', { ssh: { hots: 'x' }, colour: 'red' });
  assert.deepEqual([r.status, r.body], [400, { error: 'unknown settings: ssh.hots, colour' }]);
  const cfg = JSON.parse(await fs.readFile(`${process.env.SILINX_CONFIG_DIR}/config.json`, 'utf8'));
  assert.ok(!('colour' in cfg) && !('hots' in (cfg.ssh || {})));
  r = await app.call('PUT', '/toolchain', { ssh: { port: 2222 } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(JSON.parse(await fs.readFile(`${process.env.SILINX_CONFIG_DIR}/config.json`, 'utf8')).ssh.port, 2222);
});

test('bitinfo: the bitstream\'s path in the project, never the server\'s', async () => {
  await app.call('POST', '/projects', { name: 'B', template: 'blinky' });
  const r = await app.call('GET', '/projects/B/bitinfo');
  assert.deepEqual([r.status, r.body.available, r.body.path], [200, false, 'build/top.bit']);
  assert.ok(!JSON.stringify(r.body).includes(tmp));
});
