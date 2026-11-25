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
