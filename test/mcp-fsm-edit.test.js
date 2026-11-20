// The MCP server's edit_fsm (server/mcp-fsm.js, #4974): a state diagram edited as its transition table edits it
// (core/fsm-edit.js): a transition's next state, a state's otherwise given a next state, a transition added (before the
// else, after another) and removed, a state added and renamed; the diagram written and its HDL made again; Check's
// warnings of the machine returned; the refusals (a state or a transition not there, a name used twice, an action's argument
// missing) write nothing. The up/down counter of the course made by edit_fsm and set_fsm_outputs from a machine of one
// state, Check clean, simulated by simulate_drawing as a counter.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-fsm-edit-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const F = 'src/two.fsm.json', H = 'src/two.vhd';

test('#4974 edit_fsm: next state, otherwise, a transition added and removed, a state added and renamed; HDL made again; refusals', async () => {
  await ok('new_project', { name: 'ed' });
  await ok('write_file', { project: 'ed', path: F, text: JSON.stringify({
    name: 'two', lang: 'vhdl', inputs: [{ name: 'x', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
    states: [{ id: 'a', name: 'A', x: 100, y: 100, outputs: { z: '1' } }, { id: 'b', name: 'B', x: 300, y: 100 }],
    transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'x' }], initial: 'a' }, null, 2) });
  const saved = async () => JSON.parse((await ok('read_file', { project: 'ed', path: F })).text);
  const edit = (args) => call('edit_fsm', { project: 'ed', path: F, ...args });
  // B stays (no transition): its otherwise to A, a transition else
  let r = await edit({ action: 'next_state', state: 'B', to: 'A' });
  assert.deepEqual(r, { isError: false, text: `State B: in every other case, to A\n${H} updated from ${F}`,
    data: { project: 'ed', path: F, action: 'next_state', id: 't2', changed: true, problems: [], hdl: { file: H, written: true } } });
  assert.deepEqual((await saved()).transitions.map((t) => [t.id, t.from, t.to, t.cond]), [['t1', 'a', 'b', 'x'], ['t2', 'b', 'a', 'else']]);
  // a transition A → A on !x, then t1's next state A: two transitions from A to A; Check's warning returned
  r = await edit({ action: 'add_transition', state: 'A', condition: '!x' });
  assert.deepEqual([r.text, r.data.id], [`Transition A → A added: condition !x\n${H} updated from ${F}`, 't3']);
  r = await edit({ action: 'next_state', transition: 't1', to: 'A' });
  assert.equal(r.text.split('\n')[0], 'Transition A → B: its next state is now A');
  assert.deepEqual(r.data.problems, ['WARNING: State B cannot be reached from the initial state A', 'WARNING: State A has no exit: once there, the machine stays in it until a reset']);
  assert.match(await (await ok('read_file', { project: 'ed', path: H })).text, /when S_A =>/);
  // the same again: nothing written
  r = await edit({ action: 'next_state', transition: 't1', to: 'A' });
  assert.deepEqual([r.text.split('\n')[0], r.data.changed, r.data.hdl], ['Transition A → A: already its next state', false, undefined]);
  // removed; a transition added right after t1
  assert.equal((await edit({ action: 'remove_transition', transition: 't3' })).text.split('\n')[0], 'Transition A → A removed');
  r = await edit({ action: 'add_transition', state: 'A', to: 'B', condition: 'x', after: 't1' });
  assert.equal(r.data.id, 't3');
  assert.deepEqual((await saved()).transitions.filter((t) => t.from === 'a').map((t) => t.id), ['t1', 't3']);
  // a state added (S0), renamed (Wait)
  r = await edit({ action: 'add_state' });
  assert.deepEqual([r.text.split('\n')[0], r.data.id], ['State S0 added', 's1']);
  assert.ok(r.data.problems.includes('WARNING: State S0 cannot be reached from the initial state A'), r.text);
  r = await edit({ action: 'rename_state', state: 'S0', name: 'Wait' });
  assert.equal(r.text.split('\n')[0], 'State S0 renamed Wait');
  assert.deepEqual((await saved()).states.map((s) => s.name), ['A', 'B', 'Wait']);
  // refusals: nothing written
  const file = JSON.stringify(await saved());
  for (const [args, why] of [
    [{ action: 'rename_state', state: 'Wait', name: 'a' }, "State Wait: The name 'a' is used twice (letter case does not count) (not applied)"],
    [{ action: 'add_state', name: 'B' }, "The name 'B' is used twice (letter case does not count) (not applied)"],
    [{ action: 'next_state', transition: 't9', to: 'A' }, `no transition 't9' in ${F}`],
    [{ action: 'next_state', transition: 't1', to: 'Q' }, `no state 'Q' in ${F}`],
    [{ action: 'next_state', transition: 't1' }, 'next_state: give to'],
    [{ action: 'next_state', to: 'A' }, 'next_state: give either transition (its id) or state (its otherwise)'],
    [{ action: 'add_transition', to: 'A' }, 'add_transition: give state'],
    [{ action: 'remove_transition' }, 'remove_transition: give transition'],
    [{ action: 'rename_state', state: 'A' }, 'rename_state: give name'],
  ]) {
    const e = await edit(args);
    assert.deepEqual([e.isError, e.text], [true, `edit_fsm: ${why}`], JSON.stringify(args));
  }
  assert.equal(JSON.stringify(await saved()), file);
  const e = await call('edit_fsm', { project: 'ed', path: 'src/x.vhd', action: 'add_state' });
  assert.deepEqual([e.isError, e.text], [true, 'edit_fsm: src/x.vhd: not a state diagram (.fsm.json)']);
});

test('#4974 the course\'s up/down counter made by edit_fsm and set_fsm_outputs: Check clean, simulated as a counter', async () => {
  const C = 'src/updown.fsm.json';
  await ok('new_project', { name: 'cnt' });
  await ok('write_file', { project: 'cnt', path: C, text: JSON.stringify({
    name: 'updown', lang: 'verilog', inputs: [{ name: 'up', width: 1 }], outputs: [{ name: 'q', width: 3, default: '0' }],
    states: [{ id: 's1', name: 'S0', x: 100, y: 100 }], transitions: [], initial: 's1' }, null, 2) });
  const edit = (args) => ok('edit_fsm', { project: 'cnt', path: C, ...args });
  for (let i = 1; i < 8; i++) await edit({ action: 'add_state' });
  for (let i = 0; i < 8; i++) {
    await edit({ action: 'add_transition', state: `S${i}`, to: `S${(i + 1) % 8}`, condition: 'up' });
    await edit({ action: 'next_state', state: `S${i}`, to: `S${(i + 7) % 8}` });   // (its otherwise: down)
    await ok('set_fsm_outputs', { project: 'cnt', path: C, state: `S${i}`, values: { q: String(i) } });
  }
  assert.equal((await ok('check_drawing', { project: 'cnt', file: C })).text, 'Process "Check State Diagram" of updown.fsm.json completed successfully.');
  const ups = [1, 1, 1, 0, 0, 0, 0, 1, 0, 1];
  const s = await ok('simulate_drawing', { project: 'cnt', file: C, cycles: ups.map((up) => ({ up })) });
  let q = 0;
  const want = ups.map((up) => { const out = q; q = (q + (up ? 1 : 7)) % 8; return out; });
  assert.deepEqual(s.data.cycles.map((c) => Number(c.outputs.q)), want, s.text);
});
