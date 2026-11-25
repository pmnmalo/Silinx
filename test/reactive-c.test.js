// Tests of the synchronous reactive model's C generator for the Arduino (#5486, core/reactive-c.js,
// core/reactive-c-expr.js, core/reactive-c-pins.js): the sketch of each drawing compiled on the host (the system's C
// compiler, as C and as C++, with a mock of the Arduino API: test/fixtures/arduino-mock) and run tick by tick against the
// model (the same inputs on its pins, the same outputs on its pins), with no compiler warning; golden files of the
// examples' sketches (SILINX_UPDATE_GOLDEN=1 rewrites them); the pins, the names, the errors and the warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { drawingToReactive } from '../core/reactive-from.js';
import { generateArduino, TICK_MS } from '../core/reactive-c.js';
import { assignPins, boardPin, apiPin } from '../core/reactive-c-pins.js';
import { cExpr, cValue, cConst, cType } from '../core/reactive-c-expr.js';
import { lower, maskOf } from '../core/reactive-expr.js';
import { CC, noCC } from './c-helpers.js';
import { EDGES, EXAMPLE_DRAWINGS, ROOT, randomVectors, readJson, runModel, timerModel, wide } from './reactive-lib.mjs';

const MOCK = path.join(ROOT, 'test/fixtures/arduino-mock');
const GOLDEN = path.join(ROOT, 'test/fixtures/reactive-c');
const modelOf = (kind, doc) => { const r = drawingToReactive(kind, doc); assert.equal(r.errors, undefined); return r.model; };
const pinNo = (pin) => (pin[0] === 'D' ? Number(pin.slice(1)) : 14 + Number(pin.slice(1)));

/** The sketch run on the host over the vectors: its outputs at each tick, as runModel's rows. */
function runSketch(model, sketch, vectors, lang) {
  const { pins } = sketch;
  // (GCC's -Wparentheses, which clang's -Wall does not give: a logical not bare beside a bitwise operator or a comparison)
  assert.doesNotMatch(sketch.code, /!\w+ (\||\^|&(?!&)|==|!=|<=?|>=?) /, `${model.name}: a not in parentheses beside | & ^ or a comparison (GCC)`);
  const L = ['#include <Arduino.h>', 'int mock_level[20], mock_mode[20], mock_errors; unsigned long mock_ms;', `#include "sketch.ino"`, 'int main(void) {', '  setup();'];
  for (const v of vectors) {
    for (const i of model.inputs) pins[i.name].forEach((p, b) => L.push(`  mock_level[${pinNo(p)}] = ${(v[i.name] >> b) & 1};`));
    // (two turns of loop() a tick: the second one, before the tick's period, does nothing)
    L.push(`  mock_ms += ${sketch.tickMs}; loop(); loop();`);
    const fmt = model.outputs.map((o) => '%d'.repeat(o.width)).join('_');
    const args = model.outputs.flatMap((o) => [...pins[o.name]].reverse().map((p) => `mock_level[${pinNo(p)}]`));
    L.push(`  printf("${fmt}\\n", ${args.join(', ')});`);
  }
  L.push('  return mock_errors;', '}', '');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-reactive-c-'));
  try {
    fs.writeFileSync(path.join(dir, 'sketch.ino'), sketch.code);
    fs.writeFileSync(path.join(dir, 'main.c'), L.join('\n'));
    const std = lang === 'c' ? ['-x', 'c', '-std=c99'] : ['-x', 'c++', '-std=c++11'];
    const cc = spawnSync(CC, [...std, '-Wall', '-Wextra', '-I', MOCK, '-o', path.join(dir, 'run'), path.join(dir, 'main.c')], { encoding: 'utf8' });
    assert.equal(cc.status, 0, `${model.name} ${lang}: ${cc.stderr}`);
    assert.equal(cc.stderr.trim(), '', `${model.name} ${lang}: no compiler warning`);
    return execFileSync(path.join(dir, 'run'), { encoding: 'utf8' }).trim().split('\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A sketch with its tick's period, for runSketch. */
const sketchOf = (model, opts = {}) => {
  const g = generateArduino(model, opts);
  assert.equal(g.errors, undefined, JSON.stringify(g.errors));
  return { ...g, tickMs: opts.tickMs ?? TICK_MS };
};

// ---------------------------------------------------------------------------------------------------- run on the host
test('the examples\' drawings: their sketches, compiled as C and as C++ with no warning, do tick by tick what their models do', { skip: noCC }, () => {
  for (const [kind, file] of EXAMPLE_DRAWINGS) {
    const model = modelOf(kind, readJson(file));
    const vectors = randomVectors(model.inputs, 400, 21);
    const sketch = sketchOf(model);
    for (const lang of ['c', 'c++']) assert.deepEqual(runSketch(model, sketch, vectors, lang), runModel(model, vectors), `${file} ${lang}`);
  }
});

test('edge cases (Mealy outputs, a case box, a registered output, a synchroniser, a generic, an every-cycle block, a pulse, the XOR form): the sketch is the model', { skip: noCC }, () => {
  for (const [kind, make] of EDGES) {
    const model = modelOf(kind, make());
    const vectors = randomVectors(model.inputs, 300, 4);
    const sketch = sketchOf(model, { tickMs: 3 });
    for (const lang of ['c', 'c++']) assert.deepEqual(runSketch(model, sketch, vectors, lang), runModel(model, vectors), `${model.name} ${lang}`);
  }
});

test('wide values (20 and 32 bits: the C\'s uint32_t, its masks) and a timer counting ticks: the sketch is the model', { skip: noCC }, () => {
  for (const model of [modelOf('asm', wide()), timerModel()]) {
    const vectors = randomVectors(model.inputs, 500, 13);
    const sketch = sketchOf(model);
    for (const lang of ['c', 'c++']) assert.deepEqual(runSketch(model, sketch, vectors, lang), runModel(model, vectors), `${model.name} ${lang}`);
  }
});

// ---------------------------------------------------------------------------------------------------- golden files
test('the examples\' sketches: their text (golden files), a student\'s: one function per tick, a switch on the state, named constants', () => {
  for (const [kind, file] of EXAMPLE_DRAWINGS) {
    const doc = readJson(file);
    const g = drawingToReactive(kind, doc, { source: path.basename(file) });
    const sketch = generateArduino(g.model);
    const golden = path.join(GOLDEN, `${doc.name}.ino`);
    if (process.env.SILINX_UPDATE_GOLDEN) fs.writeFileSync(golden, sketch.code);
    assert.equal(sketch.code, fs.readFileSync(golden, 'utf8'), `${file}: test/fixtures/reactive-c/${doc.name}.ino (SILINX_UPDATE_GOLDEN=1 rewrites it)`);
    assert.equal(sketch.filename, `${doc.name}.ino`);
    assert.deepEqual(sketch.warnings, []);
  }
  const traffic = fs.readFileSync(path.join(GOLDEN, 'traffic.ino'), 'utf8');
  assert.match(traffic, /^\/\/ traffic: a Moore machine, generated by Silinx from the state diagram traffic\.fsm\.json/);
  assert.match(traffic, /enum State \{ S_CARS, S_CARS_YELLOW, S_ALL_RED, S_WALK, S_WALK_END, S_ALL_RED_2, S_NIGHT \};/);
  assert.match(traffic, /const uint8_t PIN_REQ = 2;\nconst uint8_t PIN_DONE = 3;\nconst uint8_t PIN_NIGHT = 4;\nconst uint8_t PIN_PHASE\[3\] = \{ 5, 6, 7 \};/);
  assert.match(traffic, /    case S_CARS:\n      phase = 0;\n      if \(night\) \{\n        state = S_NIGHT;\n      \} else if \(!night && req && done\) \{\n        state = S_CARS_YELLOW;\n      \}\n      break;/);
  assert.equal(traffic.match(/static void stepMachine\(void\)/g).length, 1);
  const timer = fs.readFileSync(path.join(GOLDEN, 'timer.ino'), 'utf8');
  assert.match(timer, /left = \(secs - cnt\) & 0xF;/);
  assert.match(timer, /cnt = \(cnt \+ 1\) & 0xF;/);
  assert.match(timer, /if \(cnt == \(uint32_t\)secs - 1\) \{/);
  assert.match(timer, /static uint8_t tick;\n/);   // (its input tick keeps its name: the sketch's function is stepMachine)
  const lamps = fs.readFileSync(path.join(GOLDEN, 'lamps.ino'), 'utf8');
  assert.match(lamps, /^\/\/ lamps: combinational logic, generated by Silinx from the truth table lamps\.bool\.json/);
  assert.doesNotMatch(lamps, /switch|enum State|the outputs' defaults/);
});

test('a variable read after it is set in a tick, a registered output and a timer keep their next value apart; the others are set in place', () => {
  const t = generateArduino(timerModel()).code;
  assert.match(t, /  uint8_t t_next = t < 7 \? t \+ 1 : t;   \/\/ \(a timer counts ticks\)\n  uint8_t n_next = n;\n/);
  assert.match(t, /  writeOutputs\(\);\n  t = t_next;\n  n = n_next;\n\}/);
  assert.match(t, /static uint8_t n;   \/\/ 3 bits, registered: its value of the last tick/);
  const w = generateArduino(modelOf('asm', wide())).code;
  assert.match(w, /static uint32_t r;   \/\/ 20 bits/);
  assert.match(w, /  uint32_t r_next = r;\n  uint32_t q_next = q;\n  uint16_t m_next = m;\n/);   // (each read after it is set in GO)
  assert.match(w, /r_next = \(\(r << 3\) \+ a - 7\) & UINT32_C\(0xFFFFF\);/);   // (in uint32_t: one mask)
  // (the lock's timer: cnt set in place, read before it is set only)
  const t2 = generateArduino(modelOf('asm', readJson('examples/lock/src/timer.asm.json'))).code;
  assert.doesNotMatch(t2, /cnt_next/);
  assert.match(t2, /cnt = 0;/);
});

// ---------------------------------------------------------------------------------------------------- the expressions
test('the expressions\' C: masks and casts only where the widths need them, parentheses where C\'s precedence or its compilers\' warnings ask', () => {
  const W = { a: 4, b: 8, c: 20, d: 32, x: 1, y: 1 };
  const sym = (n) => ({ c: n, width: W[n] });
  const width = (n) => W[n] ?? null;
  const ast = (k, ...xs) => (k === 'id' ? { k, name: xs[0] } : k === 'lit' ? { k, v: BigInt(xs[0]), w: xs[1] ?? null } : k === 'un' ? { k, op: xs[0], a: xs[1] } : { k: 'bin', op: k, a: xs[0], b: xs[1] });
  const c = (e, W0) => cExpr(lower(e, W0, width), sym).s;
  assert.equal(c(ast('+', ast('id', 'a'), ast('lit', 1)), 4), '(a + 1) & 0xF');
  assert.equal(c(ast('&', ast('id', 'a'), ast('|', ast('id', 'b'), ast('id', 'a'))), 8), 'a & (b | a)');
  assert.equal(c(ast('&&', ast('id', 'x'), ast('||', ast('id', 'y'), ast('id', 'x'))), 1), 'x && (y || x)');
  assert.equal(c(ast('||', ast('&&', ast('id', 'x'), ast('id', 'y')), ast('id', 'x')), 1), '(x && y) || x');
  assert.equal(c(ast('==', ast('&', ast('id', 'a'), ast('lit', 3)), ast('lit', 1)), 1), '(a & 3) == 1');
  assert.equal(c(ast('-', ast('id', 'c'), ast('id', 'd')), 32), 'c - d');   // (both uint32_t)
  assert.equal(c(ast('-', ast('id', 'b'), ast('id', 'a')), 32), '(uint32_t)b - a');
  assert.equal(c(ast('+', ast('id', 'c'), ast('lit', 70000)), 20), '(c + UINT32_C(0x11170)) & UINT32_C(0xFFFFF)');
  assert.equal(c(ast('<<', ast('id', 'b'), ast('lit', 3)), 8), '(b << 3) & 0xFF');
  assert.equal(c(ast('<<', ast('id', 'b'), ast('lit', 9)), 8), '0');
  assert.equal(c(ast('<<', ast('id', 'b'), ast('id', 'a')), 12), 'a >= 12 ? 0 : ((uint32_t)b << a) & 0xFFF');
  assert.equal(c(ast('un', '~', ast('id', 'a')), 4), '~a & 0xF');
  assert.equal(c(ast('un', '!', ast('id', 'b')), 1), '!b');
  // (#5522 regression: GCC's -Wparentheses, a not beside a bitwise operator or a comparison in parentheses; beside && bare)
  assert.equal(c(ast('|', ast('un', '!', ast('id', 'x')), ast('id', 'y')), 1), '(!x) | y');
  assert.equal(c(ast('^', ast('id', 'y'), ast('un', '!', ast('id', 'x'))), 1), 'y ^ (!x)');
  assert.equal(c(ast('==', ast('un', '!', ast('id', 'x')), ast('id', 'y')), 1), '(!x) == y');
  assert.equal(c(ast('&&', ast('un', '!', ast('id', 'x')), ast('un', '!', ast('un', '!', ast('id', 'y')))), 1), '!x && !!y');
  assert.equal(cValue(lower(ast('+', ast('id', 'b'), ast('lit', 1)), 8, width), 8, sym), 'b + 1');   // (an 8-bit target: the assignment masks it)
  assert.equal(cValue(lower(ast('>>', ast('id', 'c'), ast('lit', 2)), 20, width), 8, sym), '(c >> 2) & 0xFF');
  assert.deepEqual([cConst(5n), cConst(10n), cConst(0x7FFFn), cConst(0x8000n)], ['5', '0xA', '0x7FFF', 'UINT32_C(0x8000)']);
  assert.deepEqual([cType(1), cType(8), cType(9), cType(16), cType(17), cType(32)], ['uint8_t', 'uint8_t', 'uint16_t', 'uint16_t', 'uint32_t', 'uint32_t']);
  assert.equal(maskOf(4), 15n);
});

// ---------------------------------------------------------------------------------------------------- pins, names, errors
test('the pins: the user\'s, the others the next free ones (D2 to D13, A0 to A5); each problem said', () => {
  assert.deepEqual([boardPin('d7'), boardPin(' A5 '), boardPin('D14'), boardPin('A6'), boardPin('13')], ['D7', 'A5', null, null, null]);
  assert.deepEqual([apiPin('D7'), apiPin('A0')], ['7', 'A0']);
  const ports = [{ name: 'x', width: 1 }, { name: 'k', width: 2 }, { name: 'z', width: 3 }];
  assert.deepEqual(assignPins(ports, { k: ['D2', 'A1'] }), { pins: { k: ['D2', 'A1'], x: ['D3'], z: ['D4', 'D5', 'D6'] }, errors: [], warnings: [] });
  assert.deepEqual(assignPins(ports, { x: 'D0' }).warnings, ["D0 is the USB serial port's: 'x' on it disturbs the upload of the program"]);
  assert.deepEqual(assignPins(ports, { k: ['D2'] }).errors, ["'k' is 2 bits wide: it needs 2 pins, not 1"]);
  assert.deepEqual(assignPins(ports, { x: 'D14' }).errors, ["'D14' is not a digital pin of the board (D0 to D13, A0 to A5)"]);
  assert.deepEqual(assignPins(ports, { x: 'D2', k: ['D3', 'D2'] }).errors, ["D2 is given to 'x' and to 'k'"]);
  assert.deepEqual(assignPins([{ name: 'w', width: 19 }]).errors, ['The ports need 19 more pins: the board has 18 free']);
  const m = modelOf('fsm', readJson('examples/traffic/src/traffic.fsm.json'));
  const g = generateArduino(m, { pins: { phase: ['A0', 'A1', 'A2'] } });
  assert.deepEqual(g.pins, { phase: ['A0', 'A1', 'A2'], req: ['D2'], done: ['D3'], night: ['D4'] });
  assert.match(g.code, /const uint8_t PIN_PHASE\[3\] = \{ A0, A1, A2 \};/);
  assert.match(g.code, /\/\/ Outputs: phase A0 A1 A2\./);
  assert.deepEqual(g.warnings, []);
});

test('the names: a port named as a word of C, of C++ or of the Arduino API, or as the sketch\'s own, renamed with a warning; the model\'s errors refused', () => {
  const m = modelOf('fsm', { ...readJson('examples/traffic/src/traffic.fsm.json'), inputs: [{ name: 'req', width: 1 }, { name: 'done', width: 1 }, { name: 'night', width: 1 }, { name: 'delay', width: 1 }, { name: 'state', width: 1 }] });
  const g = generateArduino(m);
  assert.deepEqual(g.warnings, [
    "'delay' is a word of C or of the Arduino API, or a name of the sketch's: it is delay_v in the sketch",
    "'state' is a word of C or of the Arduino API, or a name of the sketch's: it is state_v in the sketch",
  ]);
  assert.match(g.code, /static uint8_t delay_v;/);
  assert.match(g.code, /const uint8_t PIN_DELAY_V = 5;/);
  const bad = timerModel(); bad.initial = 'NOPE';
  assert.deepEqual(generateArduino(bad), { errors: ["The initial state 'NOPE' is not a state"] });
  assert.deepEqual(generateArduino(timerModel(), { tickMs: 0 }), { errors: ['The tick is 0 ms: a whole number of milliseconds, 1 or more'] });
  assert.deepEqual(generateArduino(timerModel(), { pins: { go: 'X9' } }), { errors: ["'X9' is not a digital pin of the board (D0 to D13, A0 to A5)"] });
  assert.match(generateArduino(timerModel(), { tickMs: 250 }).code, /const unsigned long TICK_MS = 250;   \/\/ the tick's period/);
});
