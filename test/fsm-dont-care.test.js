// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// A state diagram's output set to a don't care (#4891): the whole output (X, -, 'X', '-', 1'bx) or some of its bits
// ("1X0", "1-0", 3'b1x0, 8'hx5), read (core/fsm-value.js), checked (Check, the Properties' and the MCP's checks), kept as
// written, simulated (X), in the tables and the Boolean algebra (X), and in the HDL each language's don't care (VHDL
// '-', Verilog x): compiled, elaborated and simulated, the simulators showing x, the synthesis input an x. (Its ASM chart
// keeps it: test/asm-dont-care.test.js, #4895.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFsm, validateFsm, generateFsm, simulateFsm, stepFsm, encodedTable, stateTable, truthTablesOf, parseOutputs, parseLabel,
} from '../core/fsm.js';
import { outputConst, outputFits, atWidth, bitsText } from '../core/fsm-value.js';
import { outputValueProblem, setOutputValues } from '../core/fsm-outputs.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { synthesisInput } from '../core/synth-front.js';


test('#4891 outputConst: a constant, a whole don\'t care, some bits don\'t care; not a constant', () => {
  const c = (s) => { const r = outputConst(s); return r && [r.v, r.x, r.w]; };
  // constants: as constValue reads them
  assert.deepEqual([c('0'), c('5'), c("4'b1010"), c('"0101"'), c("'1'")], [[0n, 0n, null], [5n, 0n, null], [10n, 0n, 4], [5n, 0n, 4], [1n, 0n, 1]]);
  // the whole output
  for (const s of ['X', '-', ' X ']) assert.deepEqual(c(s), [0n, -1n, null], s);
  for (const s of ["'X'", "'x'", "'-'", "1'bx", "1'bX"]) assert.deepEqual(c(s), [0n, 1n, 1], s);
  // some bits (MSB first)
  assert.deepEqual(c('"1X0"'), [4n, 2n, 3]);
  assert.deepEqual(c('"1-0"'), [4n, 2n, 3]);
  assert.deepEqual(c('"1_X0"'), [4n, 2n, 3]);
  assert.deepEqual(c("3'b1x0"), [4n, 2n, 3]);
  assert.deepEqual(c("3'bx"), [0n, 7n, 3]);       // (its leftmost x extended, as Verilog's)
  assert.deepEqual(c("4'b1x"), [2n, 1n, 4]);       // (its leftmost a 1: 0s)
  assert.deepEqual(c("8'hx5"), [5n, 0xf0n, 8]);
  assert.deepEqual(c("'bx1"), [1n, 2n, 2]);
  // not a constant: a lower case x is a name (an input's), refused as a value; digits not valid
  for (const s of ['x', 'go', '"1Z0"', "3'b1z0", "3'b120", '""', "0'bx", 'XX', '"10"x', "'2'"]) assert.equal(outputConst(s), null, s);
  // at a width, fits, its bits
  assert.deepEqual(atWidth(outputConst('X'), 3), { v: 0n, x: 7n });
  assert.deepEqual(atWidth(outputConst('"1X0"'), 3), { v: 4n, x: 2n });
  assert.deepEqual([outputFits(outputConst('X'), 1), outputFits(outputConst('"1X0"'), 3), outputFits(outputConst('"1X0"'), 2), outputFits(outputConst("8'hx5"), 4)], [true, true, false, false]);
  assert.deepEqual([bitsText(4n, 2n, 3), bitsText(1n, 0n, 1), bitsText(0n, 1n, 1), bitsText(5n, 0n, 4)], ['1X0', '1', 'X', '0101']);
});

/** A machine of the input go and the outputs z (3 bits) and y: Moore A (z "1X0", y X), B (z 3'bx, y 1), C (its
 *  defaults: z "000", y -), A → B on go (Mealy: z "0-1"), B → C, C → A on go. */
const machine = (lang = 'vhdl') => normalizeFsm({
  name: 'dc', lang, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 3, default: '"000"' }, { name: 'y', width: 1, default: "'-'" }],
  states: [{ id: 'a', name: 'A', x: 100, y: 100, outputs: { z: '"1X0"', y: 'X' } }, { id: 'b', name: 'B', x: 300, y: 100, outputs: { z: "3'bx", y: '1' } }, { id: 'c', name: 'C', x: 200, y: 260 }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go', outputs: { z: '"0-1"' } }, { id: 't2', from: 'b', to: 'c', cond: '' }, { id: 't3', from: 'c', to: 'a', cond: 'go' }],
  initial: 'a',
});

test('#4891 Check: a don\'t care is a constant, kept as written; one too wide does not fit; an X counts as set', () => {
  const m = machine();
  // (its information only: A and C stay when go is 0)
  assert.deepEqual(validateFsm(m).map((d) => `${d.severity}: ${d.message}`), [
    'info: State A: no transition is true when go=0; the machine stays in A',
    'info: State C: no transition is true when go=0; the machine stays in C',
  ]);
  // kept as written
  assert.deepEqual([m.states[0].outputs, m.transitions[0].outputs, m.outputs[1].default], [{ z: '"1X0"', y: 'X' }, { z: '"0-1"' }, "'-'"]);
  assert.deepEqual(normalizeFsm(JSON.parse(JSON.stringify(m))).states.map((s) => s.outputs), m.states.map((s) => s.outputs));
  // too wide; not a constant
  const bad = normalizeFsm({ ...m, states: m.states.map((s) => (s.id === 'b' ? { ...s, outputs: { z: '"1X0X"', y: 'x' } } : s)) });
  assert.deepEqual(validateFsm(bad).filter((d) => d.severity !== 'info').map((d) => `${d.severity}: ${d.message}`), [
    "error: State B: the value 'x' of y must be a constant (e.g. 0, 1, 4'b1010, 5)",
    'warning: State B: the value "1X0X" of z does not fit in 3 bit(s)',
    // (y's values: A's X, B's not valid; its default '-': the same don't care)
    "warning: Output 'y' is never set: it always keeps its default value '-'",
  ]);
  // an output whose only value is X where its default is 0: set (no "never set" warning); X everywhere as its default: never set
  const one = (vals, def) => normalizeFsm({ name: 'o', inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'y', width: 1, default: def }],
    states: [{ id: 'a', name: 'A', outputs: vals[0] == null ? {} : { y: vals[0] } }, { id: 'b', name: 'B', outputs: vals[1] == null ? {} : { y: vals[1] } }],
    transitions: [{ id: 't1', from: 'a', to: 'b', cond: '' }, { id: 't2', from: 'b', to: 'a', cond: '' }], initial: 'a' });
  const never = (m1) => validateFsm(m1).filter((d) => /never set/.test(d.message)).map((d) => d.message);
  assert.deepEqual(never(one(['X', null], '0')), []);
  assert.deepEqual(never(one(['-', "'X'"], 'X')), ["Output 'y' is never set: it always keeps its default value X"]);
  assert.deepEqual(never(one(['0', null], 'X')), []);
});

test('#4891 the Properties\' and the MCP\'s checks, the Outputs text and a label typed on the drawing: a don\'t care taken as written', () => {
  const m = machine();
  const z = m.outputs[0], y = m.outputs[1];
  assert.deepEqual([outputValueProblem('"1X0"', z), outputValueProblem("3'b1x0", z), outputValueProblem('X', y), outputValueProblem('-', y)], [null, null, null, null]);
  assert.equal(outputValueProblem('"1X0X"', z), 'the value "1X0X" of z does not fit in 3 bit(s)');
  assert.equal(outputValueProblem('x', y), "the value 'x' of y must be a constant (e.g. 0, 1, 4'b1010, 5)");
  assert.deepEqual(setOutputValues({}, { z: '"1-0"', y: 'X' }, m.outputs), { outputs: { z: '"1-0"', y: 'X' } });
  assert.deepEqual(parseOutputs('z="1X0", y=-', m.outputs), { outputs: { z: '"1X0"', y: '-' } });
  assert.deepEqual(parseLabel("go / z=3'b1x0, y=X", m.outputs), { cond: 'go', outputs: { z: "3'b1x0", y: 'X' }, error: undefined });
});

test('#4891 the reference simulation, the tables and the Boolean algebra: a don\'t care shown as X', () => {
  const m = machine();
  const r = stepFsm(m, 'a', { go: 1 });
  assert.deepEqual([r.outputs, r.xs], [{ z: 1n, y: 0n }, { z: 2n, y: 1n }]);   // (the transition's z "0-1", the state's y X)
  const rows = simulateFsm(m, [{ go: 0 }, { go: 1 }, { go: 0 }, { go: 0 }, { go: 1 }]);
  assert.deepEqual(rows.map((x) => `${x.state}:${bitsText(x.outputs.z, x.xs.z, 3)}_${bitsText(x.outputs.y, x.xs.y, 1)}`), ['a:1X0_X', 'a:0X1_X', 'b:XXX_1', 'c:000_X', 'c:000_X']);
  // the encoded table (state bits q1 q0, go): its outputs z2 z1 z0 y
  const et = encodedTable(m);
  assert.deepEqual(et.rows.map((x) => `${x.q}${x.in}:${x.out}`), ['000:1X0X', '001:0X1X', '010:XXX1', '011:XXX1', '100:000X', '101:000X', '110:XXXX', '111:XXXX']);
  // the state table (a Mealy machine: its outputs per input combination)
  assert.deepEqual(stateTable(m).rows.map((x) => [x.state, x.outputs]), [['A', ['1X0 X', '0X1 X']], ['B', ['XXX 1', 'XXX 1']], ['C', ['000 X', '000 X']]]);
  // Create Boolean Algebra: the output table's don't cares, X
  const out = truthTablesOf(m).tables.find((x) => x.suffix === 'out').doc;
  // (its rows: the encoded table's, the unused code 11 a don't care too)
  assert.deepEqual(out.table, { z_2: '10XX00XX', z_1: 'XXXX00XX', z_0: '01XX00XX', y: 'XX11XXXX' });
});

test('#4891 the HDL: VHDL \'-\', Verilog x; no warnings; compiled, elaborated and simulated, the simulators showing x as the model; an x in the synthesis input', () => {
  const vectors = [{ go: 0 }, { go: 1 }, { go: 0 }, { go: 0 }, { go: 1 }, { go: 1 }];
  const model = simulateFsm(machine(), vectors).map((x) => `${bitsText(x.outputs.z, x.xs.z, 3)}_${bitsText(x.outputs.y, x.xs.y, 1)}`.toLowerCase());
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateFsm(machine(lang), lang);
    assert.deepEqual(g.warnings ?? [], [], `${lang}: no warnings`);
    const asg = g.code.split('\n').filter((l) => /^\s+[zy] (<=|=) /.test(l)).map((l) => l.trim());
    assert.deepEqual(asg, lang === 'vhdl'
      ? ['z <= "000";', "y <= '-';", 'z <= "1-0";', "y <= '-';", 'z <= "0-1";', 'z <= "---";', "y <= '1';"]
      : ["z = 3'b000;", "y = 1'bx;", "z = 3'b1x0;", "y = 1'bx;", "z = 3'b0x1;", "z = 3'bxxx;", "y = 1'b1;"], lang);
    // its header: the values as written
    assert.match(g.code, /A {4}= 00 {2}\(reset\) {2}z = "1X0", y = X/);
    const path = lang === 'vhdl' ? 'dc.vhd' : 'dc.v';
    const lib = compile([{ path, lang, text: g.code }]);
    assert.deepEqual(lib.errors.map((e) => `${e.severity}: ${e.message}`), [], lang);
    const design = elaborate(lib, 'dc');
    assert.deepEqual(design.diags.map((e) => `${e.severity}: ${e.message}`), [], lang);
    const tb = ['module tb; reg clk = 0, rst = 1, go = 0; wire [2:0] z; wire y;', '  dc dut(.clk(clk), .rst(rst), .go(go), .z(z), .y(y));', '  always #5 clk = ~clk;',
      '  initial begin #12 rst = 0;', ...vectors.map((v) => `    go = ${v.go}; #2 $display("%b_%b", z, y); @(posedge clk); #1;`), '    $finish;', '  end', 'endmodule'].join('\n');
    const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors, [], `${lang}: simulated`);
    assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+_[01xz]$/.test(s)), model, `${lang}: the simulator's values`);
    // the synthesis input: the don't care an x (Yosys may use it)
    const syn = synthesisInput(design).text;
    assert.match(syn, /3'b1x0|3'bx1x0|'bx/, `${lang}: an x in the synthesis input`);
  }
});
