// Helpers of the synchronous reactive model's tests (#5486): the drawings, random inputs, a drawing's generated HDL
// simulated cycle by cycle (the outputs sampled before each clock edge), a model's run in the same text.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulate } from '../core/compile.js';
import { generate as generateAsm } from '../core/asm.js';
import { generateFsm } from '../core/fsm.js';
import { generatePetri } from '../core/petri.js';
import { generateTableHdl } from '../core/logic.js';
import { simulateReactive } from '../core/reactive.js';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** The examples' drawings named in #5486: [kind, path]. */
export const EXAMPLE_DRAWINGS = [
  ['fsm', 'examples/traffic/src/traffic.fsm.json'],
  ['asm', 'examples/lock/src/timer.asm.json'],
  ['pn', 'examples/lock/src/alarm.pn.json'],
  ['bool', 'examples/traffic/src/lamps.bool.json'],
];

// ---------------------------------------------------------------------------------------------------- edge cases
/** A Mealy machine: a 2-bit input, a comparison, an output set on transitions, the otherwise written first. */
export const mealy = () => ({
  kind: 'fsm', name: 'edge_m', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'low', sync: false }, encoding: 'onehot',
  inputs: [{ name: 'x', width: 1 }, { name: 'k', width: 2 }],
  outputs: [{ name: 'z', width: 1, default: '0' }, { name: 'y', width: 3, default: '5' }],
  states: [{ id: 'a', name: 'A', outputs: { y: '1' } }, { id: 'b', name: 'B', outputs: {} }, { id: 'c', name: 'C', outputs: { y: '7' } }],
  transitions: [
    { id: 't0', from: 'a', to: 'a', cond: 'else', outputs: { z: '1' } },
    { id: 't1', from: 'a', to: 'b', cond: 'x && k == 2', outputs: { y: '3' } },
    { id: 't2', from: 'a', to: 'c', cond: 'k > 2\'d2', outputs: { y: '2' } },
    { id: 't3', from: 'b', to: 'c', cond: '!x | k[1]', outputs: { z: '1' } },
    { id: 't4', from: 'c', to: 'a', cond: 'k - 1 == 0', outputs: {} },
  ],
  initial: 'a',
});

/** An ASM chart: a case box, a registered output, a synchronised input, a generic, an every-cycle block, shifts. */
export const chart = () => ({
  version: 1, name: 'edge_a', lang: 'verilog', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'gray',
  generics: [{ name: 'K', default: 3 }],
  inputs: [{ name: 'a', width: 4 }, { name: 'op', width: 2 }, { name: 'go', width: 1, sync: true }],
  outputs: [{ name: 'y', width: 4, default: '0' }, { name: 'f', width: 1, default: '0' }, { name: 'acc', width: 6, default: '1', registered: true }],
  registers: [{ name: 'n', width: 3, init: '2' }],
  nodes: [
    { id: 's1', type: 'state', name: 'IDLE', actions: ['y = a >> 1'] },
    { id: 'd1', type: 'decision', cond: 'go' },
    { id: 's2', type: 'state', name: 'RUN', actions: ['acc = acc + a'] },
    { id: 'c1', type: 'case', expr: 'op' },
    { id: 'o1', type: 'output', actions: ['y = n << 1', 'n = n - 1'] },
    { id: 'o2', type: 'output', actions: ['f', 'acc = (acc << 1) | K'] },
    { id: 'a1', type: 'always', name: 'calc', actions: ['f = a == 4\'d15'] },
  ],
  edges: [
    { from: 's1', to: 'd1' }, { from: 'd1', to: 's2', port: 'true' }, { from: 'd1', to: 's1', port: 'false' },
    { from: 's2', to: 'c1' }, { from: 'c1', to: 'o1', port: '00|11' }, { from: 'c1', to: 'o2', port: '01' }, { from: 'c1', to: 's1', port: 'others' },
    { from: 'o1', to: 's2' }, { from: 'o2', to: 's1' },
  ],
  initial: 's1',
});

/** A Petri net: two tokens in parallel, a pulse output, a guard on a 2-bit input. */
export const net = () => ({
  kind: 'petri', version: 1, name: 'edge_p', lang: 'vhdl', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true },
  inputs: [{ name: 'g', width: 1 }, { name: 'm', width: 2 }], outputs: [{ name: 'busy', width: 1 }, { name: 'pulse', width: 1 }, { name: 'v', width: 2 }],
  places: [
    { id: 'p1', name: 'ready', tokens: 1, capacity: 1, outputs: {} }, { id: 'p2', name: 'left', tokens: 0, capacity: 1, outputs: { busy: '1', v: '1' } },
    { id: 'p3', name: 'right', tokens: 0, capacity: 1, outputs: { busy: '1', v: '2' } },
  ],
  transitions: [{ id: 't1', name: 'split', guard: 'g', outputs: { pulse: '1' } }, { id: 't2', name: 'join', guard: 'm == 3', outputs: {} }],
  arcs: [
    { id: 'a1', from: 'p1', to: 't1', weight: 1 }, { id: 'a2', from: 't1', to: 'p2', weight: 1 }, { id: 'a3', from: 't1', to: 'p3', weight: 1 },
    { id: 'a4', from: 'p2', to: 't2', weight: 1 }, { id: 'a5', from: 'p3', to: 't2', weight: 1 }, { id: 'a6', from: 't2', to: 'p1', weight: 1 },
  ],
});

/** A truth table in the XOR form, with don't cares. */
export const table = () => ({ version: 1, name: 'edge_t', inputs: ['a', 'b', 'c'], outputs: ['p', 'q'], table: { p: '01101001', q: '1X0X11X0' }, exprs: {}, form: 'xor', lang: 'vhdl' });

export const EDGES = [['fsm', mealy], ['asm', chart], ['pn', net], ['bool', table]];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

/** Random inputs for a model's inputs ([{ name, width }]), each kept a few ticks: n vectors of { name: number }. */
export function randomVectors(inputs, n, seed) {
  const r = rng(seed), cur = {}, out = [];
  for (let c = 0; c < n; c++) {
    for (const i of inputs) if (cur[i.name] == null || r() % 3 === 0) cur[i.name] = r() % 2 ** Math.min(i.width, 31);
    out.push({ ...cur });
  }
  return out;
}

/** A drawing's HDL in a language: { code, ports: { clock, reset: { name, active }, inputs, outputs } }. */
export function drawingHdl(kind, doc, lang) {
  if (kind === 'bool' || kind === 'tt') {
    return { code: generateTableHdl(doc, lang).code, ports: { inputs: doc.inputs.map((name) => ({ name, width: 1 })), outputs: doc.outputs.map((name) => ({ name, width: 1 })) } };
  }
  const code = kind === 'fsm' ? generateFsm(doc, lang).code : kind === 'pn' ? generatePetri(doc, lang).code : generateAsm(doc, lang).code;
  const rs = doc.reset || {};
  return { code, ports: { clock: doc.clock || 'clk', reset: { name: rs.name || 'rst', active: rs.active === 'low' ? 'low' : 'high' }, inputs: doc.inputs, outputs: doc.outputs } };
}

/** The outputs of the HDL before each clock edge (after the reset, none pulsed then), each row '01_1010…'. */
export function runHdl(name, kind, doc, lang, vectors) {
  const { code, ports } = drawingHdl(kind, doc, lang);
  const nm = (s) => (lang === 'vhdl' ? s.toLowerCase() : s);
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const outs = ports.outputs;
  const show = `$display("${outs.map(() => '%b').join('_')}", ${outs.map((o) => `o_${o.name}`).join(', ')});`;
  const L = ['module tb;'];
  for (const i of ports.inputs) L.push(`  reg ${vec(i.width || 1)}i_${i.name} = 0;`);
  for (const o of outs) L.push(`  wire ${vec(o.width || 1)}o_${o.name};`);
  const conns = [...ports.inputs.map((i) => `.${nm(i.name)}(i_${i.name})`), ...outs.map((o) => `.${nm(o.name)}(o_${o.name})`)];
  const set = (v) => ports.inputs.map((i) => `i_${i.name} = ${i.width || 1}'d${v[i.name]};`).join(' ');
  if (ports.clock) {
    const on = ports.reset.active === 'high' ? 1 : 0;
    L.push(`  reg clk = 0; reg rst = ${on};`, `  ${nm(doc.name)} dut(.${nm(ports.clock)}(clk), .${nm(ports.reset.name)}(rst), ${conns.join(', ')});`,
      '  always #5 clk = ~clk;', '  initial begin', `    #12 rst = ${1 - on};`);
    for (const v of vectors) L.push(`    ${set(v)} #2 ${show} @(posedge clk); #1;`);
  } else {
    L.push(`  ${nm(doc.name)} dut(${conns.join(', ')});`, '  initial begin');
    for (const v of vectors) L.push(`    ${set(v)} #2 ${show} #8;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e9 });
  assert.deepEqual(r.errors, [], `${name} ${lang}: simulation errors`);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
}

/** A model's outputs over the vectors, each row as runHdl's. */
export function runModel(model, vectors) {
  return simulateReactive(model, vectors).map((row) => model.outputs.map((o) => row.outputs[o.name].toString(2).padStart(o.width, '0')).join('_'));
}
