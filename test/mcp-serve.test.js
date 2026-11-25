// The MCP server on its streams (server/mcp.js serveMcp, #4734): ping, initialize and tools/list answered at once, while a
// tool runs; the tools' calls in order by project (laneOf, lanes: a call on another project runs meanwhile, a call on the
// same project waits, a call on no project waits for every call before it); run_process's progress sent as
// notifications/progress when the request gives a progressToken (none without one).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PassThrough } from 'node:stream';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle, serveMcp, laneOf, lanes } = await import('../server/mcp.js');
const { SIM_TESTING } = await import('../server/mcp-hdl.js');
// (the budgets of the answers "at once": a slower machine's, SILINX_UI_THROTTLE times, #5065)
const SLOW = Math.max(1, Number(process.env.SILINX_UI_THROTTLE) || 1);
let id = 0;
const ok = async (name, args) => {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return r;
};
const TB = 'entity tb is end;\narchitecture s of tb is\n  signal n : integer := 0;\nbegin\n  process begin wait for 1 ps; n <= n + 1; end process;\nend;\n';

before(async () => {
  tmp = await scratchEnv('silinx-mcp-serve-');
  await ok('new_project', { name: 'd' });
  await ok('write_file', { project: 'd', path: 'sim/tb.vhd', text: TB });
  await ok('set_top', { project: 'd', sim_top: 'tb' });
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// a server on two streams: send(m), the answers and notifications received, until(cond)
// (initialized first, as a client does, #4752: version, the protocol version asked; null: not initialized)
function served(version = '2025-06-18') {
  const input = new PassThrough(), output = new PassThrough();
  const done = serveMcp({ input, output });
  const got = [];
  let buf = '';
  output.on('data', d => { buf += d; for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) got.push(JSON.parse(buf.slice(0, i))); });
  const send = m => input.write(`${JSON.stringify(Array.isArray(m) ? m : { jsonrpc: '2.0', ...m })}\n`);
  if (version) send({ id: 'init', method: 'initialize', params: { protocolVersion: version } });
  const until = async (cond, ms = 10000 * SLOW) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await new Promise(r => setTimeout(r, 20)); return cond(); };
  return { send, got, until, end: () => { input.end(); return done; } };
}
const call = (n, name, args, meta) => ({ id: n, method: 'tools/call', params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) } });

test('laneOf: a tool\'s call by its project (case folded), the workspace\'s with none or in a batch; the other methods none', () => {
  assert.equal(laneOf(call(1, 'read_file', { project: 'Gates', path: 'x' })), 'project:gates');
  assert.equal(laneOf(call(1, 'list_projects', {})), 'workspace');
  assert.equal(laneOf(call(1, 'new_project', { name: 'x' })), 'workspace');
  assert.equal(laneOf(call(1, 'x', { project: '' })), 'workspace');
  assert.equal(laneOf([call(1, 'read_file', { project: 'g' }), { id: 2, method: 'ping' }]), 'workspace');
  assert.equal(laneOf([{ id: 2, method: 'ping' }]), null);
  for (const method of ['ping', 'initialize', 'tools/list', 'notifications/initialized', 'resources/list']) assert.equal(laneOf({ id: 1, method }), null, method);
});

test('lanes: one project\'s calls in order, two projects\' together, the workspace\'s after every call before it and before the next', async () => {
  const order = lanes();
  const log = [];
  const gate = () => { let open; const p = new Promise(r => { open = r; }); return { p, open }; };
  const a1 = gate(), b1 = gate(), w = gate();
  const task = (name, g) => async () => { log.push(`${name}+`); if (g) await g.p; log.push(`${name}-`); return name; };
  const runs = [order.run('project:a', task('a1', a1)), order.run('project:a', task('a2')), order.run('project:b', task('b1', b1)),
    order.run('workspace', task('w', w)), order.run('project:b', task('b2')), order.run(null, task('now'))];
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(log, ['now+', 'now-', 'a1+', 'b1+']);
  a1.open(); await runs[1];
  assert.deepEqual(log.slice(4), ['a1-', 'a2+', 'a2-']);
  b1.open(); await runs[2]; await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(log.slice(7), ['b1-', 'w+']);
  w.open();
  assert.deepEqual(await Promise.all(runs), ['a1', 'a2', 'b1', 'w', 'b2', 'now']);
  assert.deepEqual(log.slice(9), ['w-', 'b2+', 'b2-']);
  // (a call that fails does not stop its lane)
  await assert.rejects(order.run('project:a', async () => { throw new Error('x'); }));
  assert.equal(await order.run('project:a', async () => 'after'), 'after');
  await order.idle();
});

test('#4734 while a simulation runs: ping, initialize, tools/list and another project\'s call answered at once; the same project\'s waits', async () => {
  const s = served();
  // (the others sent once the simulation runs, its design elaborated: no fixed wait, #5065)
  let running = false;
  SIM_TESTING.onRun = () => { running = true; };
  s.send(call(1, 'simulate', { project: 'd', time_ns: 1e9, timeout_s: 600 }));
  assert.ok(await s.until(() => running || s.got.some(a => a.id === 1)) && running, JSON.stringify(s.got.find(a => a.id === 1)));
  SIM_TESTING.onRun = null;
  s.send({ id: 2, method: 'ping' });
  s.send({ id: 3, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  s.send({ id: 4, method: 'tools/list' });
  s.send(call(5, 'project_info', { project: 'g' }));
  s.send(call(6, 'project_info', { project: 'd' }));   // (its own name: a case-sensitive file system has no 'D')
  assert.ok(await s.until(() => [2, 3, 4, 5].every(n => s.got.some(a => a.id === n))), JSON.stringify(s.got.map(a => a.id)));
  assert.deepEqual(s.got.find(a => a.id === 2).result, {});
  assert.equal(s.got.find(a => a.id === 3).result.serverInfo.name, 'silinx');
  assert.ok(s.got.find(a => a.id === 4).result.tools.some(t => t.name === 'simulate'));
  assert.match(s.got.find(a => a.id === 5).result.content[0].text, /^g: top gates/);
  assert.ok(!s.got.some(a => a.id === 1 || a.id === 6), 'd\'s project_info waits for its simulation');
  s.send({ method: 'notifications/cancelled', params: { requestId: 1 } });
  assert.ok(await s.until(() => s.got.some(a => a.id === 6)), 'answered once the simulation stopped');
  assert.match(s.got.find(a => a.id === 6).result.content[0].text, /^d: top \(none\), test bench tb/);
  assert.ok(!s.got.some(a => a.id === 1), 'the cancelled request not answered');
  assert.ok(!s.got.some(a => a.method), 'no notification');
  await s.end();
});

// #5065: a simulation's yield lets the event loop wait for the file system, so that another call's reads, one after
// another, go through at its yields several at a time, not one read a yield (project_info then took 5 s, not 40 ms).
// Counted by the yields, not timed, nor by the reads' rate, which a loaded machine slows (#5415): some yield lets more
// than one read through. A yield that does not wait (setImmediate's) lets one at most: the next read is asked only
// once the last one's answer has come, and the loop goes on without waiting for it.
test('#5065 while a simulation runs, another call\'s reads go through several at one of its yields', async () => {
  const s = served();
  let running = false, yields = 0;
  SIM_TESTING.onRun = () => { running = true; };
  SIM_TESTING.onYield = () => { yields++; };
  s.send(call(1, 'simulate', { project: 'd', time_ns: 1e9, timeout_s: 600 }));
  try {
    assert.ok(await s.until(() => running || s.got.some(a => a.id === 1)) && running, JSON.stringify(s.got.find(a => a.id === 1)));
    // (the reads answered after each yield, by the yields' count then: the reads of one yield's wait share it)
    const at = new Map();
    let most = 0;
    for (let i = 0; i < 100 && most < 2; i++) {
      await fs.promises.stat(tmp);
      at.set(yields, (at.get(yields) || 0) + 1);
      most = Math.max(most, at.get(yields));
    }
    assert.ok(!s.got.some(a => a.id === 1), 'the simulation still running');
    assert.equal(most, 2, `one read a yield: ${[...at.values()].join(' ')}`);
  } finally {
    SIM_TESTING.onRun = SIM_TESTING.onYield = null;
    s.send({ method: 'notifications/cancelled', params: { requestId: 1 } });
    await s.end();
  }
});

test('#4734 run_process with a progressToken: notifications/progress with its token, increasing, its last line; none without one', async () => {
  const s = served();
  s.send(call(1, 'run_process', { project: 'g', process: 'synthesize' }, { progressToken: 'p1' }));
  assert.ok(await s.until(() => s.got.some(a => a.id === 1), 300000), 'the synthesis answered');
  const answer = s.got.find(a => a.id === 1);
  assert.equal(answer.result.isError, false, answer.result.content[0].text);
  const notes = s.got.filter(a => a.method === 'notifications/progress');
  assert.ok(notes.length >= 1, 'progress sent');
  assert.ok(s.got.indexOf(notes.at(-1)) < s.got.indexOf(answer), 'before the answer');
  for (const n of notes) {
    assert.deepEqual(Object.keys(n.params).sort(), ['message', 'progress', 'progressToken']);
    assert.equal(n.params.progressToken, 'p1');
    assert.equal(typeof n.params.message, 'string');
    assert.ok(!n.params.message.includes(tmp), 'no absolute path');
  }
  const p = notes.map(n => n.params.progress);
  assert.deepEqual(p, [...p].sort((a, b) => a - b));
  assert.equal(new Set(p).size, p.length, 'always increasing');
  // (no token: no progress)
  s.send(call(2, 'run_process', { project: 'g', process: 'synthesize' }));
  assert.ok(await s.until(() => s.got.some(a => a.id === 2), 300000));
  assert.equal(s.got.filter(a => a.method === 'notifications/progress').length, notes.length);
  await s.end();
});

test('#4752 on the streams: nothing but ping before initialize; a batch refused in 2025-06-18, answered in 2025-03-26', async () => {
  const s = served(null);
  s.send({ id: 1, method: 'tools/list' });
  s.send({ id: 2, method: 'ping' });
  s.send(call(3, 'list_projects', {}));
  assert.ok(await s.until(() => s.got.length === 3), JSON.stringify(s.got));
  assert.deepEqual(s.got.find(a => a.id === 1).error, { code: -32002, message: 'not initialized: send initialize first' });
  assert.deepEqual(s.got.find(a => a.id === 2).result, {});
  assert.equal(s.got.find(a => a.id === 3).error.code, -32002);
  // (initialized: the same requests answered)
  s.send({ id: 4, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  s.send({ id: 5, method: 'tools/list' });
  assert.ok(await s.until(() => s.got.some(a => a.id === 5)));
  assert.ok(s.got.find(a => a.id === 5).result.tools.length > 50);
  s.send([{ jsonrpc: '2.0', id: 6, method: 'ping' }, { jsonrpc: '2.0', id: 7, method: 'ping' }]);
  assert.ok(await s.until(() => s.got.some(a => a.id === null && a.error)));
  assert.match(s.got.find(a => a.id === null).error.message, /^batches are not part of protocol version 2025-06-18/);
  await s.end();
  const old = served('2025-03-26');
  old.send([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'ping' }]);
  assert.ok(await old.until(() => old.got.some(Array.isArray)));
  assert.deepEqual(old.got.find(Array.isArray).map(a => a.id), [1, 2]);
  await old.end();
});
