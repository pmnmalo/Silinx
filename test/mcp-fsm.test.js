// The MCP server's set_fsm_outputs (server/mcp-fsm.js, #3814): a state's or a transition's outputs set as the state
// diagram editor's Properties set them (core/fsm-outputs.js): the traffic example's NIGHT state given phase 7 (its HDL
// made again), cleared (the default: left out of the file), a value too wide, not a constant or an output the machine
// does not have refused (nothing written), a transition's (the machine Mealy), the same values again (nothing written),
// a state or a transition not there, a file that is not a state diagram. set_fsm_look (#3883): a state's and a
// transition's look set (the HDL unchanged), the same again (nothing written), a value refused (nothing written), back
// to the default (no look in the file), Check's error on a look not valid written by write_file. A state diagram whose
// conditions are in every notation of the logic operators (#3907), written by write_file: check_drawing, simulate_drawing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-fsm-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const PATH = 'src/traffic.fsm.json';
const read = async (path) => (await ok('read_file', { project: 't', path })).text;
const fsm = async () => JSON.parse(await read(PATH));

test('set_fsm_outputs: a state\'s value set (its HDL made again), cleared (the default), refused; a transition\'s (Mealy)', async () => {
  await ok('new_project_from_example', { name: 't', example: 'traffic' });
  const hdl0 = await read('src/traffic.vhd');
  assert.match(hdl0, /when S_NIGHT =>\n\s+phase <= "110";/);
  const r = await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '7' } });
  assert.deepEqual(r, { isError: false, text: 'State NIGHT: outputs set: phase = 7\nsrc/traffic.vhd updated from src/traffic.fsm.json',
    data: { project: 't', path: PATH, state: 'NIGHT', outputs: { phase: '7' }, kind: 'moore', hdl: { file: 'src/traffic.vhd', written: true } } });
  assert.match(await read('src/traffic.vhd'), /when S_NIGHT =>\n\s+phase <= "111";/);
  // the same again: nothing written
  assert.deepEqual(await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '7' } }), { isError: false,
    text: 'State NIGHT: its outputs are already these: phase = 7', data: { project: 't', path: PATH, state: 'NIGHT', outputs: { phase: '7' }, kind: 'moore' } });
  // refused: too wide, not a constant, not an output; the file as it was
  const before = await read(PATH);
  for (const [values, why] of [[{ phase: '8' }, 'the value 8 of phase does not fit in 3 bit(s)'], [{ phase: 'x' }, "the value 'x' of phase must be a constant (e.g. 0, 1, 4'b1010, 5)"],
    [{ lamp: '1' }, "'lamp' is not an output"], [{ phase: '1', lamp: '1' }, "'lamp' is not an output"]]) {
    const r = await call('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values });
    assert.deepEqual([r.isError, r.text], [true, `set_fsm_outputs: State NIGHT: ${why} (not applied)`]);
  }
  assert.equal(await read(PATH), before);
  // cleared: left out of the file (the default, 0)
  const c = await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '' } });
  assert.equal(c.text, 'State NIGHT: outputs set: phase = (0: default)\nsrc/traffic.vhd updated from src/traffic.fsm.json');
  assert.deepEqual((await fsm()).states.find(s => s.name === 'NIGHT').outputs, {});
  assert.doesNotMatch(await read('src/traffic.vhd'), /when S_NIGHT =>\n\s+phase/);
  // a transition's: the machine Mealy; cleared: Moore again
  const t = await ok('set_fsm_outputs', { project: 't', path: PATH, transition: 't1', values: { phase: "3'b110" } });
  assert.equal(t.text, "Transition CARS → NIGHT: outputs set: phase = 3'b110\nsrc/traffic.vhd updated from src/traffic.fsm.json");
  assert.deepEqual([t.data.outputs, t.data.kind], [{ phase: "3'b110" }, 'mealy']);
  const u = await ok('set_fsm_outputs', { project: 't', path: PATH, transition: 't1', values: { phase: '' } });
  assert.deepEqual([u.text.split('\n')[0], u.data.kind], ["Transition CARS → NIGHT: outputs set: phase = (the state's)", 'moore']);
  // back to the example's values: its HDL as it was
  await ok('set_fsm_outputs', { project: 't', path: PATH, state: 'NIGHT', values: { phase: '6' } });
  assert.equal(await read('src/traffic.vhd'), hdl0);
});

test('set_fsm_outputs: a state or a transition not there, both or neither given, not a state diagram', async () => {
  const no = async (args, text) => { const r = await call('set_fsm_outputs', { project: 't', path: PATH, values: { phase: '1' }, ...args }); assert.deepEqual([r.isError, r.text], [true, `set_fsm_outputs: ${text}`]); };
  await no({ state: 'DAY' }, `no state 'DAY' in ${PATH}`);
  await no({ transition: 't99' }, `no transition 't99' in ${PATH}`);
  await no({}, 'give either state (its name) or transition (its id)');
  await no({ state: 'NIGHT', transition: 't1' }, 'give either state (its name) or transition (its id)');
  await no({ path: 'src/traffic.vhd', state: 'NIGHT' }, 'src/traffic.vhd: not a state diagram (.fsm.json)');
  await no({ path: 'src/none.fsm.json', state: 'NIGHT' }, "no file 'src/none.fsm.json' in the project 't'");
});

test('#3883 set_fsm_look: a state\'s and a transition\'s look set (the HDL unchanged), the same again, refused, back to the default', async () => {
  const hdl0 = await read('src/traffic.vhd');
  const r = await ok('set_fsm_look', { project: 't', path: PATH, state: 'NIGHT', look: { fill: '#FC0', fontSize: 16, textStyle: 'bold-italic', strokeWidth: '1.6' } });
  assert.deepEqual(r, { isError: false, text: 'State NIGHT: look set: fill colour #ffcc00, text size 16, text style bold-italic',
    data: { project: 't', path: PATH, state: 'NIGHT', look: { fill: '#ffcc00', fontSize: 16, textStyle: 'bold-italic' }, hdl: { file: 'src/traffic.vhd', written: false } } });
  assert.deepEqual((await fsm()).states.find(s => s.name === 'NIGHT').look, { fill: '#ffcc00', fontSize: 16, textStyle: 'bold-italic' });
  assert.equal(await read('src/traffic.vhd'), hdl0);
  const t = await ok('set_fsm_look', { project: 't', path: PATH, transition: 't1', look: { stroke: '#c00', dash: 'dashed', strokeWidth: 3, color: '#008000', font: 'serif' } });
  assert.equal(t.text, 'Transition CARS → NIGHT: look set: line colour #cc0000, line width 3, line style dashed, text colour #008000, font serif');
  assert.deepEqual((await fsm()).transitions.find(x => x.id === 't1').look, { stroke: '#cc0000', strokeWidth: 3, dash: 'dashed', color: '#008000', font: 'serif' });
  // the same again: nothing written
  const before = await read(PATH);
  assert.deepEqual(await ok('set_fsm_look', { project: 't', path: PATH, transition: 't1', look: { stroke: '#CC0000' } }), { isError: false,
    text: 'Transition CARS → NIGHT: its look is already this: line colour #cc0000, line width 3, line style dashed, text colour #008000, font serif',
    data: { project: 't', path: PATH, transition: 't1', look: { stroke: '#cc0000', strokeWidth: 3, dash: 'dashed', color: '#008000', font: 'serif' } } });
  // refused: nothing written
  for (const [args, why] of [[{ state: 'NIGHT', look: { fill: 'yellow' } }, "State NIGHT: the fill colour 'yellow' is not a colour: #rrggbb (e.g. #ffcc00)"],
    [{ state: 'NIGHT', look: { fontSize: 60 } }, 'State NIGHT: the text size 60 must be a whole number from 6 to 48'],
    [{ state: 'NIGHT', look: { dash: 'dotted' } }, "State NIGHT: 'dash' is not a property of a state's look (fill, stroke, strokeWidth, color, fontSize, textStyle, font)"],
    [{ transition: 't1', look: { strokeWidth: 0.1 } }, 'Transition CARS → NIGHT: the line width 0.1 must be a number from 0.5 to 10'],
    [{ transition: 't1', look: { color: '#fff', font: 'Arial' } }, "Transition CARS → NIGHT: the font 'Arial' must be one of sans-serif, serif, monospace"]]) {
    const x = await call('set_fsm_look', { project: 't', path: PATH, ...args });
    assert.deepEqual([x.isError, x.text], [true, `set_fsm_look: ${why} (not applied)`]);
  }
  assert.equal(await read(PATH), before);
  const no = await call('set_fsm_look', { project: 't', path: PATH, state: 'DAY', look: {} });
  assert.deepEqual([no.isError, no.text], [true, `set_fsm_look: no state 'DAY' in ${PATH}`]);
  const both = await call('set_fsm_look', { project: 't', path: PATH, look: {} });
  assert.deepEqual([both.isError, both.text], [true, 'set_fsm_look: give either state (its name) or transition (its id)']);
  // back to the default look: no look in the file
  const d = await ok('set_fsm_look', { project: 't', path: PATH, state: 'NIGHT', look: { fill: null, fontSize: '', textStyle: null } });
  assert.equal(d.text, 'State NIGHT: look set: the default look');
  await ok('set_fsm_look', { project: 't', path: PATH, transition: 't1', look: { stroke: null, strokeWidth: null, dash: null, color: null, font: null } });
  const m = await fsm();
  assert.ok([...m.states, ...m.transitions].every(x => !('look' in x)));
  assert.equal(await read('src/traffic.vhd'), hdl0);
});

test('#3883 a look not valid written by write_file: Check\'s error (check_drawing), on its state', async () => {
  const m = await fsm();
  m.states.find(s => s.name === 'WALK').look = { fill: 'green' };
  await ok('write_file', { project: 't', path: PATH, text: JSON.stringify(m, null, 2) });
  const c = await call('check_drawing', { project: 't', file: PATH });
  assert.equal(c.text, "ERROR: State WALK: the fill colour 'green' is not a colour: #rrggbb (e.g. #ffcc00)\nProcess \"Check State Diagram\" of traffic.fsm.json failed (1 error(s), 0 warning(s)).");
  m.states.find(s => s.name === 'WALK').look = { fill: '#00aa00' };
  await ok('write_file', { project: 't', path: PATH, text: JSON.stringify(m, null, 2) });
  assert.doesNotMatch((await call('check_drawing', { project: 't', file: PATH })).text, /look|colour|ERROR|WARNING/);
});

// A --t1--> B, A --t2--> C, B --t3--> A, B --t4--> C, C --t5--> A, its conditions as given (#3907)
const notations = (name, conds) => ({
  name, lang: 'verilog', inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'z', width: 2, default: '0' }],
  states: [{ id: 'a', name: 'A', x: 0, y: 0 }, { id: 'b', name: 'B', x: 200, y: 0, outputs: { z: '1' } }, { id: 'c', name: 'C', x: 200, y: 200, outputs: { z: '2' } }],
  transitions: [['a', 'b'], ['a', 'c'], ['b', 'a'], ['b', 'c'], ['c', 'a']].map(([from, to], i) => ({ id: `t${i + 1}`, from, to, cond: conds[i] })),
  initial: 'a',
});

test('#3907 a state diagram written in every notation of the logic operators: checked with no problem, simulated as its C-style form; the errors', async () => {
  await ok('new_project', { name: 'nn' });
  const typed = ["a.b'", '/a + b', 'else', 'a AND b', 'default'];
  await ok('write_file', { project: 'nn', path: 'src/nn.fsm.json', text: JSON.stringify(notations('nn', typed), null, 2) });
  await ok('write_file', { project: 'nn', path: 'src/cs.fsm.json', text: JSON.stringify(notations('cs', ['a && !b', '!a || b', '', 'a && b', '']), null, 2) });
  const check = async (f) => (await call('check_drawing', { project: 'nn', file: f })).text;
  assert.doesNotMatch(await check('src/nn.fsm.json'), /ERROR|WARNING/);
  // kept as typed
  assert.deepEqual(JSON.parse((await ok('read_file', { project: 'nn', path: 'src/nn.fsm.json' })).text).transitions.map((t) => t.cond), typed);
  // simulated as the C-style form
  const cycles = [{ a: 1 }, { a: 1, b: 1 }, {}, { b: 1 }, {}, { a: 1 }, {}, { a: 1, b: 1 }, { b: 1 }];
  const run = async (f) => (await ok('simulate_drawing', { project: 'nn', file: f, cycles })).data.cycles.map((c) => [c.state, c.outputs.z, c.next]);
  const want = await run('src/cs.fsm.json');
  assert.deepEqual(await run('src/nn.fsm.json'), want);
  assert.deepEqual(want.map((c) => c[0]), ['A', 'B', 'C', 'A', 'C', 'A', 'B', 'A', 'C']);
  // a malformed condition: its column; two otherwise transitions from B
  await ok('write_file', { project: 'nn', path: 'src/nn.fsm.json', text: JSON.stringify(notations('nn', ['a.b c', '/a + b', 'else', 'true', 'default']), null, 2) });
  assert.equal(await check('src/nn.fsm.json'), [
    "ERROR: Transition A → B: the condition 'a.b c' is not valid (column 5: unexpected 'c' (an operator missing before it: a && b, a.b))",
    'ERROR: State B has 2 otherwise transitions (else, @else, default, others, otherwise, true, 1 or no condition), to A, C; a state has one at most',
    'Process "Check State Diagram" of nn.fsm.json failed (2 error(s), 0 warning(s)).'].join('\n'));
});

test('#4489 set_fsm_condition: a transition\'s condition typed, its Else box ticked (else, the state\'s otherwise) and unticked; StateCAD\'s @ELSE; two otherwise transitions: Check\'s error; refused', async () => {
  await ok('new_project', { name: 'el' });
  const F = 'src/el.fsm.json';
  await ok('write_file', { project: 'el', path: F, text: JSON.stringify(notations('el', ['a', '!a', 'b', '!b', '1']), null, 2) });
  const set = (args) => call('set_fsm_condition', { project: 'el', path: F, ...args });
  const conds = async () => JSON.parse((await ok('read_file', { project: 'el', path: F })).text).transitions.map((t) => t.cond);
  const hdl = async () => (await ok('read_file', { project: 'el', path: 'src/el.v' })).text;
  const v0 = await hdl();
  assert.match(v0, /if \(a\) begin\n\s+state_next = S_B;\n\s+end else if \(!a\) begin/);
  // the Else box ticked: else, the HDL's final else
  assert.deepEqual(await set({ transition: 't2', otherwise: true }), { isError: false,
    text: 'Transition A → C: condition set: else (the otherwise of A)\nsrc/el.v updated from src/el.fsm.json',
    data: { project: 'el', path: F, transition: 't2', condition: 'else', otherwise: true, problems: [], hdl: { file: 'src/el.v', written: true } } });
  assert.match(await hdl(), /if \(a\) begin\n\s+state_next = S_B;\n\s+end else begin\n\s+state_next = S_C;/);
  // the same again: nothing written
  assert.deepEqual(await set({ transition: 't2', otherwise: true }), { isError: false, text: 'Transition A → C: its condition is already this: else (the otherwise of A)',
    data: { project: 'el', path: F, transition: 't2', condition: 'else', otherwise: true, problems: [] } });
  // StateCAD's @ELSE typed
  const t4 = await set({ transition: 't4', condition: ' @ELSE ' });
  assert.deepEqual([t4.isError, t4.text.split('\n')[0], t4.data.condition, t4.data.otherwise], [false, 'Transition B → C: condition set: @ELSE (the otherwise of B)', '@ELSE', true]);
  // a second otherwise in B: Check's error, returned; written as the interface writes it
  const two = await set({ transition: 't3', otherwise: true });
  assert.equal(two.isError, false);
  assert.deepEqual(two.data.problems, ['ERROR: State B has 2 otherwise transitions (else, @else, default, others, otherwise, true, 1 or no condition), to A, C; a state has one at most']);
  assert.equal(two.text.split('\n').slice(0, 2).join('\n'), `Transition B → A: condition set: else (the otherwise of B)\n${two.data.problems[0]}`);
  // unticked: empty (A, alone… B has @ELSE still: an empty condition is its otherwise too, the error stays)
  const un = await set({ transition: 't3', otherwise: false });
  assert.deepEqual([un.data.condition, un.data.problems.length], ['', 1]);
  // typed: the error gone; an overbar kept as /
  const b = await set({ transition: 't3', condition: 'b̅' });
  assert.deepEqual([b.text.split('\n')[0], b.data.problems], ['Transition B → A: condition set: /b', []]);
  assert.deepEqual(await conds(), ['a', 'else', '/b', '@ELSE', '1']);
  // C's only transition: 1, not drawn as else
  assert.equal((await set({ transition: 't5', condition: '' })).text.split('\n')[0], 'Transition C → A: condition set: (empty: always)');
  // refused
  for (const [args, why] of [[{ transition: 't1' }, 'give either condition or otherwise'], [{ transition: 't1', condition: 'a', otherwise: true }, 'give either condition or otherwise'],
    [{ transition: 't9', otherwise: true }, `no transition 't9' in ${F}`], [{ path: 'src/el.v', transition: 't1', otherwise: true }, 'src/el.v: not a state diagram (.fsm.json)']]) {
    const r = await set(args);
    assert.deepEqual([r.isError, r.text], [true, `set_fsm_condition: ${why}`]);
  }
});
