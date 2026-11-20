// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The MCP server and a state diagram's don't-care outputs (#4891): set_fsm_outputs takes X, "1X0", 3'b1x0 as written
// (returned and saved so; its HDL made again, each language's don't care), Check has nothing to say, simulate_drawing
// shows X, and the diagram's ASM chart (convert_drawing, related_view) is refused with its reasons.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-fsm-dc-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };

const machine = (lang) => ({
  name: 'dc', lang, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 3, default: '"000"' }, { name: 'y', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 100, y: 100 }, { id: 'b', name: 'B', x: 300, y: 100, outputs: { y: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go' }, { id: 't2', from: 'b', to: 'a', cond: '' }], initial: 'a',
});

test('#4891 set_fsm_outputs: a don\'t care as written (X, "1X0", 3\'b0x1), its HDL each language\'s; Check; simulate_drawing shows X; no ASM chart', async () => {
  for (const lang of ['vhdl', 'verilog']) {
    const pj = `dc${lang}`, F = 'src/dc.fsm.json', H = `src/dc.${lang === 'vhdl' ? 'vhd' : 'v'}`;
    await ok('new_project', { name: pj });
    await ok('write_file', { project: pj, path: F, text: JSON.stringify(machine(lang), null, 2) });
    const r = await ok('set_fsm_outputs', { project: pj, path: F, state: 'A', values: { z: '"1X0"', y: 'X' } });
    assert.deepEqual(r, { isError: false, text: `State A: outputs set: z = "1X0", y = X\n${H} updated from ${F}`,
      data: { project: pj, path: F, state: 'A', outputs: { z: '"1X0"', y: 'X' }, kind: 'moore', hdl: { file: H, written: true } } });
    const t = await ok('set_fsm_outputs', { project: pj, path: F, transition: 't1', values: { z: "3'b0x1" } });
    assert.deepEqual([t.text.split('\n')[0], t.data.outputs, t.data.kind], ["Transition A → B: outputs set: z = 3'b0x1, y = (the state's)", { z: "3'b0x1" }, 'mealy']);
    const saved = JSON.parse((await ok('read_file', { project: pj, path: F })).text);
    assert.deepEqual([saved.states[0].outputs, saved.transitions[0].outputs], [{ z: '"1X0"', y: 'X' }, { z: "3'b0x1" }]);
    const hdl = (await ok('read_file', { project: pj, path: H })).text.split('\n').filter((l) => /^\s+(S_B: )?[zy] (<=|=) /.test(l)).map((l) => l.trim().replace(/^S_B: /, ''));   // (Verilog: B's a case item of one line)
    assert.deepEqual(hdl, lang === 'vhdl' ? ['z <= "000";', "y <= '0';", 'z <= "1-0";', "y <= '-';", 'z <= "0-1";', "y <= '1';"]
      : ["z = 3'b000;", "y = 1'b0;", "z = 3'b1x0;", "y = 1'bx;", "z = 3'b0x1;", "y = 1'b1;"], lang);
    // refused: too wide, a name (lower case x)
    for (const [values, why] of [[{ z: '"1X0X"' }, 'the value "1X0X" of z does not fit in 3 bit(s)'], [{ y: 'x' }, "the value 'x' of y must be a constant (e.g. 0, 1, 4'b1010, 5)"]]) {
      const e = await call('set_fsm_outputs', { project: pj, path: F, state: 'B', values });
      assert.deepEqual([e.isError, e.text], [true, `set_fsm_outputs: State B: ${why} (not applied)`]);
    }
    // Check: no error, no warning
    assert.equal((await ok('check_drawing', { project: pj, file: F })).text, 'Process "Check State Diagram" of dc.fsm.json completed successfully.');
    // simulated: X
    const s = await ok('simulate_drawing', { project: pj, file: F, cycles: [{ go: 0 }, { go: 1 }, {}] });
    assert.deepEqual(s.data.cycles.map((x) => [x.state, x.outputs]), [['A', { z: '1X0', y: 'X' }], ['A', { z: '0X1', y: 'X' }], ['B', { z: 0, y: 1 }]]);
    assert.match(s.text, /cycle 1: state A; inputs go=1; outputs z=0X1 y=X; transition t1; next state B/);
    // no ASM chart: its reasons
    const reasons = ['State A: z = "1X0" is a don\'t care (X), which an ASM chart does not have', 'State A: y = X is a don\'t care (X), which an ASM chart does not have',
      'Transition A → B: z = 3\'b0x1 is a don\'t care (X), which an ASM chart does not have'];
    const c = await call('convert_drawing', { project: pj, path: F, to: 'asm' });
    assert.deepEqual([c.isError, c.text], [true, `convert_drawing: ${reasons.join('\n')}`]);
    const v = await call('related_view', { project: pj, path: F, view: 'asm' });
    assert.deepEqual([v.isError, v.text], [true, `related_view: the ASM chart of dc.fsm.json: ${reasons.join('; ')}`]);
  }
});
