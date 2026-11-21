// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The MCP server's set_fsm_encoding (#4908): a state diagram's encoding set as its machine's Properties set it (the
// user's: the states keeping the codes they had), a state's code as its Properties' Code (the encoding made the
// user's), its HDL made again with those codes; Check's errors returned (a code twice, not binary); refused: a state
// or an encoding not there, nothing given.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-fsm-enc-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

const machine = {
  name: 'me', lang: 'verilog', inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 0, y: 0 }, { id: 'b', name: 'B', x: 200, y: 0 }, { id: 'c', name: 'C', x: 100, y: 160, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'c', cond: 'go' }, { id: 't3', from: 'c', to: 'a', cond: 'go' }], initial: 'a',
};

test('#4908 set_fsm_encoding: an encoding chosen, the user\'s codes kept, a code typed, its HDL; Check\'s errors; refused', async () => {
  const pj = 'enc', F = 'src/me.fsm.json', H = 'src/me.v';
  await ok('new_project', { name: pj });
  await ok('write_file', { project: pj, path: F, text: JSON.stringify(machine, null, 2) });
  const set = (args) => call('set_fsm_encoding', { project: pj, path: F, ...args });
  const saved = async () => JSON.parse((await ok('read_file', { project: pj, path: F })).text);
  const consts = async () => (await ok('read_file', { project: pj, path: H })).text.split('\n').filter((l) => /^\s*localparam\b.*S_/.test(l)).map((l) => l.trim());

  // gray
  assert.deepEqual(await set({ encoding: 'gray' }), { isError: false, text: `Encoding set: gray: A = 00, B = 01, C = 11\n${H} updated from ${F}`,
    data: { project: pj, path: F, encoding: 'gray', codes: { A: '00', B: '01', C: '11' }, problems: [], hdl: { file: H, written: true } } });
  // the user's: the codes they had
  const u = await set({ encoding: 'user' });
  assert.deepEqual([u.text.split('\n')[0], u.data.codes], ['Encoding set: user: A = 00, B = 01, C = 11', { A: '00', B: '01', C: '11' }]);
  assert.deepEqual((await saved()).states.map((s) => s.code), ['00', '01', '11']);
  // a code typed: B 10
  const b = await set({ codes: { B: '1 0' } });
  assert.deepEqual([b.text.split('\n')[0], b.data.problems], ['Encoding set: user: A = 00, B = 10, C = 11', []]);
  assert.deepEqual(await consts(), ["localparam [1:0] S_A = 2'b00;", "localparam [1:0] S_B = 2'b10;", "localparam [1:0] S_C = 2'b11;"]);
  // the same again: nothing written
  assert.equal((await set({ codes: { B: '10' } })).text, 'The encoding is already this: user: A = 00, B = 10, C = 11');
  // one-hot codes typed for every state, in the binary encoding: the user's
  await ok('set_fsm_encoding', { project: pj, path: F, encoding: 'binary' });
  const oh = await set({ codes: { A: '001', B: '010', C: '100' } });
  assert.deepEqual([oh.data.encoding, oh.data.codes, oh.data.problems], ['user', { A: '001', B: '010', C: '100' }, []]);
  // Check's errors: returned, written as the interface writes them
  const twice = await set({ codes: { C: '010' } });
  assert.deepEqual([twice.isError, twice.data.problems], [false, ['ERROR: States B and C have the same code 010']]);
  // codes of different widths (#5026): valid, as typed, the HDL's zero-extended; the same once extended: Check's error
  const mixed = await set({ codes: { A: '0', B: '1_0', C: '1001' } });
  assert.deepEqual([mixed.text.split('\n')[0], mixed.data.codes, mixed.data.problems], ['Encoding set: user: A = 0, B = 10, C = 1001', { A: '0', B: '10', C: '1001' }, []]);
  assert.deepEqual(await consts(), ["localparam [3:0] S_A = 4'b0000;", "localparam [3:0] S_B = 4'b0010;", "localparam [3:0] S_C = 4'b1001;"]);
  assert.equal((await ok('check_drawing', { project: pj, file: F })).data.ok, true);
  const ext = await set({ codes: { C: '0010' } });
  assert.deepEqual(ext.data.problems, ['ERROR: States B (10) and C (0010) have the same code once zero-extended to 4 bits: 0010']);
  const bad = await set({ codes: { C: '1x0' } });
  assert.deepEqual(bad.data.problems, ["ERROR: State C: its code '1x0' must be binary digits (0 and 1)"]);
  assert.equal((await saved()).states[2].code, '1x0');
  // enumerated: no codes shown
  const en = await set({ encoding: 'enum' });
  assert.deepEqual([en.text.split('\n')[0], en.data.codes], ['Encoding set: enum', { A: null, B: null, C: null }]);
  // refused
  for (const [args, why] of [[{}, 'give encoding, codes or both'], [{ encoding: 'own' }, 'encoding: one of binary, gray, onehot, enum, user'],
    [{ codes: { D: '1' } }, `no state 'D' in ${F}`], [{ codes: ['1'] }, 'codes: an object'], [{ path: H, encoding: 'gray' }, `${H}: not a state diagram (.fsm.json)`]]) {
    const r = await call('set_fsm_encoding', { project: pj, path: F, ...args });
    assert.deepEqual([r.isError, r.text], [true, `set_fsm_encoding: ${why}`]);
  }
});
