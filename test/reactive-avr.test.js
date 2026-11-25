// The synchronous reactive model's C on the Arduino itself (#5486): each drawing's unit of its node's program
// (core/reactive-c.js generateUnit) compiled by arduino-cli for the Uno, as C and as C++, with no compiler warning, and
// its .hex run on avr8js (core/system-sim-avr.js, the Board Emulator's AVR) tick by tick against the model
// (core/reactive.js): the same inputs on its pins, the same outputs on its pins. The examples' drawings (#5486's list)
// and the edge cases, in one firmware: a harness sketch selects a drawing, resets it (its <module>_init()) and steps it
// (its <module>_tick()) through the AVR's GPIOR registers. Then the node's own sketch (core/reactive-c-main.js) of two
// drawings, its ticks timed by millis(): each tick both drawings' outputs the models'. Skipped, said why, without
// arduino-cli and its AVR core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { drawingToReactive } from '../core/reactive-from.js';
import { generateUnit, TICK_MS } from '../core/reactive-c.js';
import { nodeMain } from '../core/reactive-c-main.js';
import { compilerMessages } from '../core/avr-compile.js';
import { AvrNode, CYCLE_PS, loadAvr8js } from '../core/system-sim-avr.js';
import { detectAvrCompiler } from '../server/avr-compile.js';
import { EDGES, EXAMPLE_DRAWINGS, randomVectors, readJson, runModel, timerModel } from './reactive-lib.mjs';

const real = await detectAvrCompiler({});
const SKIP = !real.available && `no arduino-cli with its AVR core here (${real.reason})`;
const GPIOR0 = 0x3e, GPIOR1 = 0x4a, GPIOR2 = 0x4b;   // (the ATmega328P's general purpose I/O registers, in its data space)
const modelOf = (kind, doc) => { const r = drawingToReactive(kind, doc); assert.equal(r.errors, undefined); return r.model; };
const MODELS = () => [...EXAMPLE_DRAWINGS.map(([kind, file]) => modelOf(kind, readJson(file))), ...EDGES.map(([kind, make]) => modelOf(kind, make())), timerModel()];

/** A sketch folder (`files` { name: text }, its main .ino named as the folder) compiled for the Uno: its .hex's text. */
function compile(name, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-reactive-avr-'));
  try {
    const sketch = path.join(dir, name);
    fs.mkdirSync(sketch);
    for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(sketch, f), text);
    const r = spawnSync(real.path, ['compile', '--fqbn', 'arduino:avr:uno', '--warnings', 'default', '--build-path', path.join(dir, 'build'), '--output-dir', path.join(dir, 'out'), sketch], { encoding: 'utf8' });
    const { errors, warnings } = compilerMessages(`${r.stdout}\n${r.stderr}`);
    assert.equal(r.status, 0, `${name}: ${errors.join('\n') || r.stderr}`);
    assert.deepEqual(warnings, [], `${name}: no compiler warning`);
    return fs.readFileSync(path.join(dir, 'out', `${name}.ino.hex`), 'utf8');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The AVR run until `done()` (at most `cycles`). */
function runUntil(avr, done, cycles = 2e6) {
  const end = avr.now + cycles * CYCLE_PS;
  while (!done() && avr.now < end) avr.advanceTo(avr.now + 2000 * CYCLE_PS);
  assert.ok(done(), 'the AVR answered');
}

// a model's outputs on its pins now, as runModel's rows
const outputsOf = (avr, model, pins) => model.outputs.map((o) => [...pins[o.name]].reverse().map((p) => avr.value(p)).join('')).join('_');
const setInputs = (avr, model, pins, v) => { for (const i of model.inputs) pins[i.name].forEach((p, b) => avr.setPin(p, (v[i.name] >> b) & 1)); };

// the harness: GPIOR2 the drawing, GPIOR0 2 its reset, 1 its tick; GPIOR1 1 once done
function harness(units, cpp) {
  const decl = units.flatMap((u) => [`void ${u.module}_init(void);`, `void ${u.module}_tick(void);`]);
  return ['#include <Arduino.h>', ...(cpp ? decl : ['extern "C" {', ...decl, '}']),
    'void setup() { GPIOR1 = 1; }',
    'void loop() {', '  uint8_t c = GPIOR0;', '  if (!c) return;', '  GPIOR0 = 0;', '  switch (GPIOR2) {',
    ...units.map((u, i) => `  case ${i}: if (c == 2) ${u.module}_init(); else ${u.module}_tick(); break;`), '  }', '  GPIOR1 = 1;', '}', ''].join('\n');
}

for (const lang of ['c', 'cpp']) {
  test(`the drawings' ${lang === 'c' ? 'C' : 'C++'} compiled for the Uno with no warning, run on avr8js: tick by tick what their models do`, { skip: SKIP, timeout: 300000 }, async () => {
    await loadAvr8js();
    const models = MODELS();
    const units = models.map((m) => { const g = generateUnit(m, { lang }); assert.equal(g.errors, undefined, JSON.stringify(g.errors)); return { module: m.name, model: m, ...g }; });
    const hex = compile('harness', { 'harness.ino': harness(units, lang === 'cpp'), ...Object.fromEntries(units.map((u) => [u.filename, u.code])) });
    units.forEach((u, k) => {
      const avr = new AvrNode({ board: 'arduino-uno', firmware: { name: 'harness.hex', data: hex } });
      const D = avr.cpu.data;
      const command = (c) => { D[GPIOR1] = 0; D[GPIOR2] = k; D[GPIOR0] = c; runUntil(avr, () => D[GPIOR1] === 1); };
      runUntil(avr, () => D[GPIOR1] === 1);
      command(2);
      const vectors = randomVectors(u.model.inputs, 200, 31 + k);
      const rows = vectors.map((v) => { setInputs(avr, u.model, u.pins, v); command(1); return outputsOf(avr, u.model, u.pins); });
      assert.deepEqual(rows, runModel(u.model, vectors), `${u.module} (${lang})`);
      assert.ok(new Set(rows).size > 1, `${u.module}: its outputs change`);
    });
  });
}

test('the node\'s sketch of two drawings (core/reactive-c-main.js): each tick, every TICK_MS of millis(), both drawings\' outputs their models\'', { skip: SKIP, timeout: 300000 }, async () => {
  await loadAvr8js();
  const [a, b] = [modelOf('fsm', readJson('examples/traffic/src/traffic.fsm.json')), modelOf('pn', readJson('examples/lock/src/alarm.pn.json'))];
  const ga = generateUnit(a);
  // (the second one on the pins the first leaves free: none taken twice)
  const used = new Set(Object.values(ga.pins).flat());
  const free = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'].filter((p) => !used.has(p));
  const given = Object.fromEntries([...b.inputs, ...b.outputs].map((p) => [p.name, free.splice(0, p.width)]));
  const gb = generateUnit(b, { pins: given });
  const units = [{ module: a.name, file: 'uno/traffic.fsm.json', code: ga.code }, { module: b.name, file: 'uno/alarm.pn.json', code: gb.code }];
  const main = nodeMain('uno', units);
  assert.deepEqual(main.warnings, []);
  const hex = compile('uno', { 'uno.ino': main.code, [ga.filename]: ga.code, [gb.filename]: gb.code });
  const avr = new AvrNode({ board: 'arduino-uno', firmware: { name: 'uno.hex', data: hex } });
  // (millis() counts timer 0's overflows, one every 1.024 ms: a tick every TICK_MS of them; the inputs set and the
  // outputs read half a tick from it)
  const tick = TICK_MS * 1.024e9, va = randomVectors(a.inputs, 40, 5), vb = randomVectors(b.inputs, 40, 6);
  const ra = [], rb = [];
  for (let k = 0; k < va.length; k++) {
    setInputs(avr, a, ga.pins, va[k]);
    setInputs(avr, b, gb.pins, vb[k]);
    avr.advanceTo((k + 1.5) * tick);
    ra.push(outputsOf(avr, a, ga.pins));
    rb.push(outputsOf(avr, b, gb.pins));
  }
  assert.deepEqual(ra, runModel(a, va), a.name);
  assert.deepEqual(rb, runModel(b, vb), b.name);
  assert.ok(new Set(ra).size > 1 && new Set(rb).size > 1, 'their outputs change');
});
