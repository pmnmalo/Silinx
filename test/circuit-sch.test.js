// A circuit's schematic (#4069, core/circuit-sch.js): the half adder's (its gates, its I/O markers a, b, s, c) and the
// breadboard example's (its 74194 and 74161 as blocks of their modules), in VHDL and Verilog; the schematic's own HDL
// compiles and is the circuit's digital model (the same outputs for every input, an independent check by simulation);
// a circuit with errors has none, its errors said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { circuitSchematic } from '../core/circuit-sch.js';
import { generateHdl, normalizeDoc } from '../core/schdoc.js';
import { simulate } from '../core/compile.js';
import { halfAdder, circuitBench } from './circuit-helpers.mjs';

const BREADBOARD = JSON.parse(fs.readFileSync(new URL('../examples/breadboard/src/breadboard.circ.json', import.meta.url), 'utf8'));

test('the half adder\'s schematic: its gates, its I/O markers; in VHDL and Verilog', async () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = await circuitSchematic({ ...halfAdder(), lang });
    assert.equal(r.errors, undefined);
    assert.deepEqual([r.doc.name, r.doc.lang], ['half_adder', lang]);
    assert.deepEqual(r.doc.ports.map((p) => `${p.name}:${p.dir}`).sort(), ['a:in', 'b:in', 'c:out', 's:out']);
    const types = r.doc.symbols.map((s) => s.type);
    assert.ok(types.includes('xor2') && types.some((t) => /^and2/.test(t)), types.join(' '));
    assert.ok(r.doc.wires.length > 0);
  }
});

test('the half adder\'s schematic\'s HDL: the half adder, for every input (simulated)', async () => {
  const m = { ...halfAdder(), lang: 'verilog' };
  const r = await circuitSchematic(m);
  const gen = generateHdl(normalizeDoc(r.doc), { lang: 'verilog', modules: r.modules });
  assert.deepEqual(gen.diagnostics.filter((d) => d.severity === 'error'), []);
  const vectors = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => ({ a, b }));
  const sim = simulate([{ path: 'half_adder.v', text: gen.code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: ['a', 'b'], outs: ['s', 'c'], ns: 100 }) }], 'tb', { until: 1e9 });
  assert.deepEqual(sim.errors, []);
  assert.deepEqual(sim.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), ['00', '10', '10', '01']);
});

test('the breadboard example\'s schematic: its MSI ICs as blocks, its ports', async () => {
  const r = await circuitSchematic(BREADBOARD);
  assert.equal(r.errors, undefined);
  const blocks = r.doc.symbols.filter((s) => s.type === 'module').map((s) => s.params.module).sort();
  assert.deepEqual(blocks, ['breadboard_sn74ls161', 'breadboard_sn74ls194']);
  assert.deepEqual(r.doc.ports.map((p) => p.name).sort(), ['btn', 'clk', 'led', 'sw']);
});

test('a circuit with errors: no schematic, its errors', async () => {
  const m = halfAdder();
  m.parts.find((p) => p.id === 'D2').label = 's';   // (two LEDs named s)
  const r = await circuitSchematic(m);
  assert.equal(r.doc, undefined);
  assert.deepEqual(r.errors, ['D2: its label \'s\' is D1\'s too']);
});
