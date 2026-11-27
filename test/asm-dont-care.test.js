// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// An ASM chart's output set to a don't care (#4895), as a state diagram's (#4891): a state's or a conditional output's
// action (z = X, z = -, z = "1X0", z = 3'b1x0, z = 8'hx5) and a combinational output's default, read (core/asm-expr.js),
// checked (a register's or a registered output's refused, one too wide truncated), simulated (X), and in the HDL each
// language's don't care (VHDL '-', Verilog x): compiled, elaborated and simulated, the simulators showing x as the
// chart's simulation. A state diagram with a don't care has its ASM chart, and back, the values kept as written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, validate, generate, exprToString } from '../core/asm.js';
import { prepareAsmSim, asmSimReset, asmSimStep, simulateAsm, asmSimValue, asmSimText } from '../core/asm-sim.js';
import { asmToReactive } from '../core/reactive-asm.js';
import { simulateReactive } from '../core/reactive.js';
import { normalizeFsm, fsmToAsm, asmToFsm, validateFsm, simulateFsm } from '../core/fsm.js';
import { outputConst, bitsText } from '../core/fsm-value.js';
import { sameAsmStructure } from '../core/asm-from-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';

const big = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? `${v}n` : v)));
// an output's value in a row of simulateAsm: a don't care's bits as written, else its bits
const bitsOf = (v, w) => (typeof v === 'string' ? v : bitsText(v, 0n, w));

/** A chart of the input go and the outputs z (3 bits, default "000") and y (default '-'): state A (z "1X0", y X), a
 *  decision go, its true exit a conditional output (z "0-1") to B (z 3'bx, y 1), B back to A. */
const chart = (lang = 'vhdl', over = {}) => ({
  version: 1, name: 'dc', lang, inputs: [{ name: 'go', width: 1 }],
  outputs: [{ name: 'z', width: 3, default: '"000"' }, { name: 'y', width: 1, default: "'-'" }],
  nodes: [
    { id: 'a', type: 'state', name: 'A', x: 0, y: 0, actions: ['z = "1X0"', 'y = X'] },
    { id: 'd', type: 'decision', x: 0, y: 100, cond: 'go' },
    { id: 'o', type: 'output', x: 0, y: 200, actions: ['z = "0-1"'] },
    { id: 'b', type: 'state', name: 'B', x: 0, y: 300, actions: ["z = 3'bx", 'y = 1'] },
  ],
  edges: [{ id: 'e1', from: 'a', to: 'd', port: 'next' }, { id: 'e2', from: 'd', to: 'o', port: 'true' }, { id: 'e3', from: 'd', to: 'a', port: 'false' },
    { id: 'e4', from: 'o', to: 'b', port: 'next' }, { id: 'e5', from: 'b', to: 'a', port: 'next' }],
  initial: 'a', ...over,
});

test('#4895 parseAction: a don\'t care, the whole value or some bits, as the state diagram\'s; not a don\'t care', () => {
  const p = (s, o) => big(parseAction(s, o));
  assert.deepEqual(p('z = X'), { target: 'z', ast: { k: 'dc', v: '0n', x: '-1n', w: null, text: 'X' } });
  assert.deepEqual(p('z <= -'), { target: 'z', ast: { k: 'dc', v: '0n', x: '-1n', w: null, text: '-' } });
  assert.deepEqual(p("z := '-'"), { target: 'z', ast: { k: 'dc', v: '0n', x: '1n', w: 1, text: "'-'" } });
  assert.deepEqual(p('z = "1X0"').ast, { k: 'dc', v: '4n', x: '2n', w: 3, text: '"1X0"' });
  assert.deepEqual(p("z = 3'b1x0").ast, { k: 'dc', v: '4n', x: '2n', w: 3, text: "3'b1x0" });
  assert.deepEqual(p("z=8'hx5").ast, { k: 'dc', v: '5n', x: '240n', w: 8, text: "8'hx5" });
  // the grammar is the state diagram's (core/fsm-value.js outputConst reads it)
  for (const s of ['X', '-', "'X'", '"1X0"', "3'bx", "8'hx5"]) {
    const { v, x, w } = parseAction(`z = ${s}`).ast;
    assert.deepEqual({ v, x, w }, outputConst(s), s);
  }
  // a signal X of the chart: X read; a lower case x a name; an expression; a constant; not valid
  assert.deepEqual(p('z = X', { isName: (n) => n === 'X' }).ast, { k: 'id', name: 'X' });
  assert.deepEqual(p('z = x').ast, { k: 'id', name: 'x' });
  assert.equal(p('z = a & b').ast.k, 'bin');
  assert.deepEqual(p('z = 1').ast, { k: 'lit', v: '1n', w: null, base: 'd' });
  assert.deepEqual(p('z = "1Z0"'), { error: 'bit-string literal "1Z0" may only contain 0, 1 and _' });
  assert.deepEqual(p("z = 3'b1z0"), { error: "x/z digits are not supported in literal 3'b1z0" });
  assert.equal(exprToString(parseAction('z = 3\'b1x0').ast), "3'b1x0");
});

test('#4895 Check: no error, no warning; a register\'s and a registered output\'s refused; one too wide truncated', () => {
  assert.deepEqual(validate(chart()), []);
  const bad = chart('vhdl', {
    outputs: [{ name: 'z', width: 3, default: '"000"' }, { name: 'y', width: 1, default: "'-'" }, { name: 'q', width: 1, default: '0', registered: true }],
    registers: [{ name: 'r', width: 2, init: '0' }],
  });
  bad.nodes[0] = { ...bad.nodes[0], actions: ['z = "1X0X"', 'y = X', 'q = X', 'r = "1X"'] };
  bad.nodes[3] = { ...bad.nodes[3], actions: ["z = 3'bx", 'y = 1', 'q = 1', 'r = 0'] };
  assert.deepEqual(validate(bad).map((d) => `${d.severity}: ${d.message}`), [
    'error: State \'A\' action \'q = X\': \'q\' is a registered output and cannot be a don\'t care (X): only a combinational output can',
    'error: State \'A\' action \'r = "1X"\': \'r\' is a register and cannot be a don\'t care (X): only a combinational output can',
    'warning: State \'A\' action \'z = "1X0X"\': value "1X0X" is truncated to 3 bit(s)',
  ]);
  // a default too wide; a registered output's default a don't care: not a literal
  const def = chart('vhdl', { outputs: [{ name: 'z', width: 3, default: '"1X0X"' }, { name: 'y', width: 1, default: 'X', registered: true }] });
  def.nodes[0] = { ...def.nodes[0], actions: ['z = "1X0"'] };
  def.nodes[3] = { ...def.nodes[3], actions: ['y = 1'] };
  assert.deepEqual(validate(def).map((d) => `${d.severity}: ${d.message}`), [
    "error: Output 'y': default value 'X' must be a literal (e.g. 0, 1, 4'b1010, \"1010\")",
    "warning: Output 'z': default value '\"1X0X\"' is truncated to 3 bit(s)",
  ]);
  // an input named X: z = X reads it
  const withX = chart('vhdl', { inputs: [{ name: 'go', width: 1 }, { name: 'X', width: 1 }] });
  assert.deepEqual(validate(withX), []);
  assert.deepEqual(simulateAsm(withX, [{ go: 0, X: 1 }]).map((r) => r.outputs.y), [1n]);
});

test('#4895 the simulation: a don\'t care\'s bits X; its value for JSON and the panel', () => {
  const rows = simulateAsm(chart(), [{ go: 0 }, { go: 1 }, { go: 0 }, { go: 1 }]);
  assert.deepEqual(rows.map((r) => [r.state, r.outputs.z, r.outputs.y]), [['A', '1X0', 'X'], ['A', '0X1', 'X'], ['B', 'XXX', 1n], ['A', '0X1', 'X']]);
  const { sim } = prepareAsmSim(chart());
  const c = asmSimStep(sim, asmSimReset(sim), { go: 1 }).cycle;
  assert.deepEqual(big([c.outputs, c.dontCares, c.by]), [{ z: '1n', y: '0n' }, { z: '2n', y: '1n' }, { z: 'o', y: 'a' }]);
  assert.deepEqual([asmSimValue(1n, 2n, 3), asmSimValue(5n), asmSimText(1n, 3, 2n), asmSimText(5n, 3), asmSimText(0n, 1, 1n)], ['0X1', 5, '0X1', '101 (5)', 'X']);
  // B: y set (its default's don't care replaced), z all X
  const d = asmSimStep(sim, { ...asmSimReset(sim), state: 'b' }, {}).cycle;
  assert.deepEqual(big(d.dontCares), { z: '7n' });
});

test('#4895 the reactive model: a don\'t care its bits not X, as the state diagram\'s', () => {
  const r = asmToReactive(chart());
  assert.equal(r.errors, undefined);
  const zs = simulateReactive(r.model, [{ go: 0 }, { go: 1 }, { go: 0 }]).map((x) => Number(x.outputs.z));
  assert.deepEqual(zs, [4, 1, 0]);
});

test('#4895 the HDL: VHDL \'-\', Verilog x; compiled, elaborated and simulated, the simulators showing x as the chart\'s simulation', () => {
  const vectors = [{ go: 0 }, { go: 1 }, { go: 0 }, { go: 0 }, { go: 1 }, { go: 1 }];
  const model = simulateAsm(chart(), vectors).map((r) => `${bitsOf(r.outputs.z, 3)}_${bitsOf(r.outputs.y, 1)}`.toLowerCase());
  assert.deepEqual(model, ['1x0_x', '0x1_x', 'xxx_1', '1x0_x', '0x1_x', 'xxx_1']);
  for (const lang of ['vhdl', 'verilog']) {
    const g = generate(chart(lang), lang);
    const asg = g.code.split('\n').filter((l) => /^\s+[zy] (<=|=) /.test(l)).map((l) => l.trim());
    assert.deepEqual(asg, lang === 'vhdl'
      ? ['z <= "000";', "y <= '-';", 'z <= "1-0";', "y <= '-';", 'z <= "0-1";', 'z <= "---";', "y <= '1';"]
      : ["z = 3'd0;", "y = 1'bx;", "z = 3'b1x0;", "y = 1'bx;", "z = 3'b0x1;", "z = 3'bxxx;", "y = 1'b1;"], lang);
    // its header: the actions as written
    assert.match(g.code, /A {4}= 0 {2}\(reset\) {2}Moore: z = "1X0", y = X/);
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
  }
});

/** The state diagram of #4891's test: Moore A (z "1X0", y X), B (z 3'bx, y 1), C (its defaults: z "000", y -), A → B on
 *  go (Mealy: z "0-1"), B → C, C → A on go. */
const machine = (lang = 'vhdl') => normalizeFsm({
  name: 'dc', lang, inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'z', width: 3, default: '"000"' }, { name: 'y', width: 1, default: "'-'" }],
  states: [{ id: 'a', name: 'A', x: 100, y: 100, outputs: { z: '"1X0"', y: 'X' } }, { id: 'b', name: 'B', x: 300, y: 100, outputs: { z: "3'bx", y: '1' } }, { id: 'c', name: 'C', x: 200, y: 260 }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'go', outputs: { z: '"0-1"' } }, { id: 't2', from: 'b', to: 'c', cond: '' }, { id: 't3', from: 'c', to: 'a', cond: 'go' }],
  initial: 'a',
});

test('#4895 a state diagram with a don\'t care has its ASM chart, which simulates as it; and back, the values kept as written', () => {
  const f = machine();
  const asm = fsmToAsm(f);
  assert.deepEqual(validate(asm), []);
  assert.deepEqual(asm.nodes.filter((n) => n.actions?.length).map((n) => n.actions), [['z = "1X0"', 'y = X'], ["z = 3'bx", 'y = 1'], ['z = "0-1"']]);
  assert.deepEqual(asm.outputs.map((o) => o.default), ['"000"', "'-'"]);
  const v = [{ go: 0 }, { go: 1 }, { go: 0 }, { go: 0 }, { go: 1 }];
  const fsmRows = simulateFsm(f, v).map((x) => [bitsText(x.outputs.z, x.xs.z, 3), bitsText(x.outputs.y, x.xs.y, 1)]);
  const asmRows = simulateAsm(asm, v).map((x) => [bitsOf(x.outputs.z, 3), bitsOf(x.outputs.y, 1)]);
  assert.deepEqual(asmRows, fsmRows);
  const back = asmToFsm(asm, { previous: f });
  assert.deepEqual(validateFsm(back).filter((d) => d.severity !== 'info'), []);
  assert.deepEqual([back.states.map((s) => s.outputs), back.transitions.map((t) => t.outputs), back.outputs.map((o) => o.default)],
    [f.states.map((s) => s.outputs), f.transitions.map((t) => t.outputs), f.outputs.map((o) => o.default)]);
  // without the previous diagram: the values as the chart writes them
  assert.deepEqual(asmToFsm(asm).states.map((s) => s.outputs), [{ z: '"1X0"', y: 'X' }, { z: "3'bx", y: '1' }, {}]);
  // two charts the same whatever the don't care's spelling; not the same with other bits
  const respell = (acts) => ({ ...asm, nodes: asm.nodes.map((n) => (n.actions?.[0] === 'z = "1X0"' ? { ...n, actions: acts } : n)) });
  assert.equal(sameAsmStructure(asm, respell(["z = 3'b1x0", "y = '-'"])), true);
  assert.equal(sameAsmStructure(asm, respell(['z = "11X"', 'y = X'])), false);
});
