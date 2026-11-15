// The Digital Electronic Circuit Wizard's assemblies of ICs (#4164, core/circuit-assemblies.js): every one, with every
// choice of its parameters, clean for the circuit's checks (no error, no warning), and right: a scenario of its inputs
// (written here, one input changed per step for the sequential ones) through the engine and through its HDL (VHDL and
// Verilog, compiled, elaborated with no warnings and simulated by Silinx), each step's outputs against a reference
// written here from the datasheets' function tables (the digits' segments by name, the count, the sum, the gates'
// truth tables, the comparison, the decoder's and the multiplexer's choice, the shift, the D flip-flop's table).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuitTemplate, CIRCUIT_TEMPLATES } from '../core/circuit-templates.js';
import { templateDefaults, templateError } from '../core/chart-templates.js';
import { checkCircuit } from '../core/circuit-check.js';
import { circuitPorts } from '../core/circuit.js';
import { busOf } from '../core/circuit-io.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const make = (id, params = {}, name = 'asm') => circuitTemplate(id, { ...templateDefaults('circuit', id), ...params }, { name });
const bit = (v, k) => (v >> k) & 1;
const bits = (base, n, v) => Object.fromEntries([...Array(n)].map((_, k) => [`${base}[${k}]`, bit(v, k)]));
let seed = 7;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 4) % n; };

// the segments lit for each digit (no tails on 6 and 9; 10–14 the 7447's and 7448's shapes, 15 blank)
const DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg', 'deg', 'cdg', 'bfg', 'adfg', 'defg', ''];
const digit = (n) => ({ ...Object.fromEntries([...'abcdefg'].map((s) => [`seg_${s}`, DIGITS[n].includes(s) ? 1 : 0])), seg_dp: 0 });
const GATE = { 7400: (a, b) => 1 - (a & b), 7402: (a, b) => 1 - (a | b), 7404: (a) => 1 - a, 7408: (a, b) => a & b, 7432: (a, b) => a | b, 7486: (a, b) => a ^ b };

// each assembly's scenario: [{ in: { port: 0 | 1 }, out: { port: 0 | 1 } }], every input given at every step
function counterSteps(decade, n = 22) {
  const steps = [], put = (clk, rst, count) => steps.push({ in: { clk, rst }, out: digit(count) });
  let count = 0;
  put(0, 1, 0); put(0, 0, 0);
  for (let k = 0; k < n; k++) {
    // the 74161 counts on the clock's rising edge, the 7490 (CKA) on its falling one
    if (!decade) count = (count + 1) % 16;
    put(1, 0, count);
    if (decade) count = (count + 1) % 10;
    put(0, 0, count);
  }
  return steps;
}
function shiftSteps(width) {
  const steps = [], reg = Array(width).fill(0);
  const put = (clk, clr, din) => steps.push({ in: { clk, clr, din }, out: Object.fromEntries(reg.map((v, k) => [`q[${k}]`, v])) });
  put(0, 1, 0); put(0, 0, 0);
  for (const d of [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0]) {
    put(0, 0, d);
    reg.unshift(d); reg.pop();   // (the rising edge: din into q[0], each bit one place on)
    put(1, 0, d);
    put(0, 0, d);
  }
  reg.fill(0);
  put(0, 1, 0);
  return steps;
}
function flipflopSteps() {
  const steps = [];
  let q = 0;
  const put = (i) => {
    const prev = steps.at(-1)?.in;
    if (!i.pre_n && i.clr_n) q = 1;
    else if (i.pre_n && !i.clr_n) q = 0;
    else if (i.pre_n && i.clr_n && prev && !prev.clk && i.clk) q = i.d;
    steps.push({ in: { ...i }, out: !i.pre_n && !i.clr_n ? { q: 1, qn: 1 } : { q, qn: 1 - q } });
  };
  const i = { clk: 0, d: 0, pre_n: 1, clr_n: 0 };
  put(i);   // (cleared)
  for (const [k, v] of [['clr_n', 1], ['d', 1], ['clk', 1], ['clk', 0], ['d', 0], ['clk', 1], ['d', 1], ['clk', 0], ['pre_n', 0], ['clr_n', 0], ['clr_n', 1], ['pre_n', 1],
    ['d', 0], ['clk', 1], ['clk', 0], ['clr_n', 0], ['d', 1], ['clk', 1], ['clk', 0], ['clr_n', 1], ['clk', 1]]) { i[k] = v; put(i); }
  return steps;
}
const all = (n, f) => [...Array(1 << n)].map((_, v) => f(v));
const some = (n, k, f) => [...Array(k)].map(() => f(rnd(1 << n)));
// each assembly with each choice: [params, steps for the engine, steps for the HDL]
function cases() {
  const out = [];
  const add = (id, params, steps, hdl = steps) => out.push({ id, params, steps, hdl });
  for (const display of ['ca', 'cc']) add('seg7', { display }, all(4, (v) => ({ in: bits('bcd', 4, v), out: digit(v) })));
  add('counter', { chip: '7490' }, counterSteps(true));
  add('counter', { chip: '74161', hz: 5 }, counterSteps(false));
  const sum = (v) => { const a = v & 15, b = v >> 4, s = a + b; return { in: { ...bits('a', 4, a), ...bits('b', 4, b) }, out: { ...bits('s', 4, s), cout: bit(s, 4) } }; };
  for (const chip of ['7483', '74283']) add('adder', { chip }, all(8, sum), some(8, 24, sum));
  for (const [chip, f] of Object.entries(GATE)) {
    const n = chip === '7404' ? 6 : 4;
    const step = (v) => (n === 6 ? { in: bits('a', 6, v), out: Object.fromEntries([...Array(6)].map((_, k) => [`y[${k}]`, f(bit(v, k))])) }
      : { in: { ...bits('a', 4, v & 15), ...bits('b', 4, v >> 4) }, out: Object.fromEntries([...Array(4)].map((_, k) => [`y[${k}]`, f(bit(v, k), bit(v, k + 4))])) });
    add('gates', { chip }, all(n === 6 ? 6 : 8, step), some(n === 6 ? 6 : 8, 16, step));
  }
  const cmp = (v) => { const a = v & 15, b = v >> 4; return { in: { ...bits('a', 4, a), ...bits('b', 4, b) }, out: { lt: +(a < b), eq: +(a === b), gt: +(a > b) } }; };
  add('comparator', {}, all(8, cmp), some(8, 24, cmp));
  add('decoder', { chip: '74138' }, all(3, (s) => ({ in: bits('s', 3, s), out: bits('y', 8, 1 << s) })));
  const mux = (v) => { const s = v & 7, d = v >> 3, y = bit(d, s); return { in: { ...bits('s', 3, s), ...bits('d', 8, d) }, out: { y, w: 1 - y } }; };
  add('decoder', { chip: '74151' }, all(11, mux), some(11, 32, mux));
  add('shift', { chip: '74164' }, shiftSteps(8));
  add('shift', { chip: '74194' }, shiftSteps(4));
  add('flipflop', {}, flipflopSteps());
  return out;
}

// a Verilog test bench of the circuit: each step's inputs, then its outputs written `ns` later (in circuitPorts' order)
function bench(m, steps, ns = 300) {
  const { inputs, outputs } = circuitPorts(m);
  const decl = (kind, ports) => {
    const w = new Map();
    for (const p of ports) { const b = busOf(p.name); w.set(b.base, Math.max(w.get(b.base) ?? -1, b.bit ?? -1)); }
    return [...w].map(([n, hi]) => `  ${kind} ${hi < 0 ? '' : `[${hi}:0] `}${n};`);
  };
  const names = [...new Set([...inputs, ...outputs].map((p) => busOf(p.name).base))];
  const L = ['`timescale 1ns / 1ps', 'module tb;', ...decl('reg', inputs), ...decl('wire', outputs), `  ${m.name} dut (${names.map((n) => `.${n}(${n})`).join(', ')});`, '  initial begin'];
  for (const s of steps) L.push(`    ${inputs.map((p) => `${p.name} = 1'b${s.in[p.name]};`).join(' ')} #${ns} $display("%b", {${outputs.map((p) => p.name).join(', ')}});`);
  L.push('    $finish;', '  end', 'endmodule');
  return L.join('\n');
}
const want = (m, s) => circuitPorts(m).outputs.map((p) => { assert.ok(p.name in s.out, `${p.name} expected`); return s.out[p.name]; }).join('');

test('the templates\' list: boards, io, then the assemblies of ICs; their parameters\' defaults and errors', () => {
  assert.deepEqual(CIRCUIT_TEMPLATES.map((t) => t.id), ['boards', 'io', 'seg7', 'counter', 'adder', 'gates', 'comparator', 'decoder', 'shift', 'flipflop']);
  assert.deepEqual(['seg7', 'counter', 'adder', 'gates', 'comparator', 'decoder', 'shift', 'flipflop'].map((id) => templateDefaults('circuit', id)),
    [{ display: 'ca' }, { chip: '7490', hz: 1 }, { chip: '7483' }, { chip: '7400' }, {}, { chip: '74138' }, { chip: '74164' }, {}]);
  assert.equal(templateError('circuit', 'counter', { chip: '7490', hz: 51 }), 'Clock (Hz): a whole number from 1 to 50.');
  assert.equal(templateError('circuit', 'counter', { chip: '7493', hz: 1 }), 'Counter: choose one.');
  assert.equal(templateError('circuit', 'gates', { chip: '7410' }), 'Gate IC: choose one.');
  assert.equal(templateError('circuit', 'shift', { chip: '74194' }), null);
});

test('every assembly: its parts on one full breadboard and its supply, every IC powered; no errors, no warnings', () => {
  for (const c of cases()) {
    const m = make(c.id, c.params);
    const what = `${c.id} ${JSON.stringify(c.params)}`;
    assert.deepEqual(checkCircuit(m), [], `${what}: clean`);
    assert.deepEqual(m.parts.slice(0, 2).map((p) => p.type), ['supply', 'breadboard-full'], what);
    const sim = createCircuitSim(m);
    sim.run();
    for (const p of m.parts.filter((x) => /^U/.test(x.id))) assert.equal(sim.powered(p.id), true, `${what}: ${p.id} powered`);
  }
  // the chips chosen, the clock's frequency, the flip-flop's PRE̅ and CLR̅ switches on
  assert.deepEqual(make('seg7', { display: 'cc' }).parts.filter((p) => /^(U|DS)/.test(p.id)).map((p) => p.type), ['7448', 'seg7-cc']);
  assert.deepEqual(make('seg7').parts.filter((p) => p.type === 'pull-up').length, 7);
  assert.equal(make('counter', { hz: 20 }).parts.find((p) => p.type === 'clock').hz, 20);
  assert.deepEqual(make('flipflop').parts.filter((p) => p.type === 'logic-switch').map((p) => [p.label, !!p.on]), [['d', false], ['pre_n', true], ['clr_n', true]]);
});

test('every assembly through the engine: each step\'s outputs as the reference', () => {
  for (const c of cases()) {
    const m = make(c.id, c.params);
    const sim = createCircuitSim(m);
    sim.run();
    const ins = circuitPorts(m).inputs;
    c.steps.forEach((s, k) => {
      for (const p of ins) sim.set(p.part, s.in[p.name] === 1, p.index);
      assert.equal(sim.run().quiet, true);
      const o = sim.outputs();
      assert.equal(circuitPorts(m).outputs.map((p) => o[p.name]).join(''), want(m, s), `${c.id} ${JSON.stringify(c.params)} step ${k}: ${JSON.stringify(s.in)}`);
    });
  }
});

test('every assembly\'s HDL: VHDL and Verilog, no warnings, simulated by Silinx as the reference', () => {
  for (const c of cases()) {
    const m = make(c.id, c.params, `asm_${c.id}`);
    for (const lang of ['vhdl', 'verilog']) {
      const what = `${c.id} ${JSON.stringify(c.params)} ${lang}`;
      const g = generateCircuit(m, lang), file = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
      const lib = compile([{ path: file, text: g.code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => e.message), [], `${what}: no warnings`);
      const r = simulate([{ path: file, text: g.code }, { path: 'tb.v', text: bench(m, c.hdl) }], 'tb', { until: 1e9 });
      assert.deepEqual(r.errors, [], what);
      assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz]+$/.test(s)), c.hdl.map((s) => want(m, s)), what);
    }
  }
});
