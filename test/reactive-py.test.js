// Tests of the synchronous reactive model's MicroPython generator (#5487, core/reactive-py.js, core/reactive-py-expr.js,
// core/reactive-py-pins.js): the program of each drawing compiled (py_compile, its warnings errors) and run on the host's
// Python with a mock of MicroPython's machine and time modules (test/fixtures/micropython-mock/run.py), tick by tick
// against the model (the same inputs on its pins, the same outputs on its pins), as the C generator's tests run its
// sketches; golden files of the examples' programs (SILINX_UPDATE_GOLDEN=1 rewrites them); the pins of the ESP32 and of
// the Pico, the names, the errors and the warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { drawingToReactive } from '../core/reactive-from.js';
import { generateMicroPython, TICK_MS } from '../core/reactive-py.js';
import { assignPyPins, gpioOf, pinLabel, PY_BOARDS } from '../core/reactive-py-pins.js';
import { pyExpr, pyValue, pyConst } from '../core/reactive-py-expr.js';
import { lower } from '../core/reactive-expr.js';
import { EDGES, EXAMPLE_DRAWINGS, ROOT, randomVectors, readJson, runModel, timerModel, wide } from './reactive-lib.mjs';

const RUN = path.join(ROOT, 'test/fixtures/micropython-mock/run.py');
const GOLDEN = path.join(ROOT, 'test/fixtures/reactive-py');
const PY = (() => { for (const p of ['python3', 'python']) { try { if (/^Python 3\./.test(execFileSync(p, ['--version'], { encoding: 'utf8' }))) return p; } catch { /* next */ } } return null; })();
const noPy = PY ? false : 'no Python 3 on this machine';
const modelOf = (kind, doc) => { const r = drawingToReactive(kind, doc); assert.equal(r.errors, undefined); return r.model; };

/** The program run on the host over the vectors: its outputs at each tick, as runModel's rows. */
function runProgram(model, prog, vectors) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-reactive-py-'));
  try {
    fs.writeFileSync(path.join(dir, prog.filename), prog.code);
    const spec = { tick: prog.tickMs, vectors, inputs: model.inputs.map((i) => [i.name, prog.pins[i.name]]), outputs: model.outputs.map((o) => [o.name, prog.pins[o.name]]) };
    fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec));
    const r = spawnSync(PY, ['-I', '-W', 'error', RUN, path.join(dir, prog.filename), path.join(dir, 'spec.json')], { encoding: 'utf8', maxBuffer: 1 << 26 });
    assert.equal(r.status, 0, `${model.name}: ${r.stderr}`);
    assert.equal(r.stderr, '', `${model.name}: no warning`);
    return r.stdout.trim().split('\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A program with its tick's period, for runProgram. */
const programOf = (model, opts = {}) => {
  const g = generateMicroPython(model, opts);
  assert.equal(g.errors, undefined, JSON.stringify(g.errors));
  return { ...g, tickMs: opts.tickMs ?? TICK_MS };
};

// ---------------------------------------------------------------------------------------------------- run on the host
test('the examples\' drawings: their programs, compiled with no warning, do tick by tick what their models do (the ESP32\'s and the Pico\'s)', { skip: noPy }, () => {
  for (const [kind, file] of EXAMPLE_DRAWINGS) {
    const model = modelOf(kind, readJson(file));
    const vectors = randomVectors(model.inputs, 400, 21);
    for (const board of ['esp32', 'pico']) assert.deepEqual(runProgram(model, programOf(model, { board }), vectors), runModel(model, vectors), `${file} ${board}`);
  }
});

test('edge cases (Mealy outputs, a case box, a registered output, a synchroniser, a generic, an every-cycle block, a pulse, the XOR form): the program is the model', { skip: noPy }, () => {
  for (const [kind, make] of EDGES) {
    const model = modelOf(kind, make());
    const vectors = randomVectors(model.inputs, 300, 4);
    assert.deepEqual(runProgram(model, programOf(model, { board: 'pico', tickMs: 3 }), vectors), runModel(model, vectors), model.name);   // (18 pins: the Pico's)
  }
});

test('wide values (20 and 32 bits: Python\'s integers masked to their widths) and a timer counting ticks: the program is the model', { skip: noPy }, () => {
  for (const model of [modelOf('asm', wide()), timerModel()]) {
    const vectors = randomVectors(model.inputs, 500, 13);
    assert.deepEqual(runProgram(model, programOf(model, { board: 'pico', tickMs: 1 }), vectors), runModel(model, vectors), model.name);
  }
});

// ---------------------------------------------------------------------------------------------------- golden files
test('the examples\' programs: their text (golden files), a student\'s: one function per tick, an if / elif on the state, named constants', () => {
  for (const [kind, file] of EXAMPLE_DRAWINGS) {
    const doc = readJson(file);
    const g = drawingToReactive(kind, doc, { source: path.basename(file) });
    const prog = generateMicroPython(g.model);
    const golden = path.join(GOLDEN, `${doc.name}.py`);
    if (process.env.SILINX_UPDATE_GOLDEN) fs.writeFileSync(golden, prog.code);
    assert.equal(prog.code, fs.readFileSync(golden, 'utf8'), `${file}: test/fixtures/reactive-py/${doc.name}.py (SILINX_UPDATE_GOLDEN=1 rewrites it)`);
    assert.equal(prog.filename, `${doc.name}.py`);
    assert.equal(prog.board, 'esp32');
    assert.deepEqual(prog.warnings, []);
  }
  const traffic = fs.readFileSync(path.join(GOLDEN, 'traffic.py'), 'utf8');
  assert.match(traffic, /^# traffic: a Moore machine, generated by Silinx from the state diagram traffic\.fsm\.json/);
  assert.match(traffic, /\n# MicroPython for the ESP32 DevKit\./);
  assert.match(traffic, /\nfrom machine import Pin\nimport time\n/);
  assert.match(traffic, /\nS_CARS = 0  # cars green/);
  assert.match(traffic, /\nPIN_REQ = Pin\(4, Pin\.IN\)\nPIN_DONE = Pin\(13, Pin\.IN\)\nPIN_NIGHT = Pin\(14, Pin\.IN\)\nPIN_PHASE = \(Pin\(16, Pin\.OUT\), Pin\(17, Pin\.OUT\), Pin\(18, Pin\.OUT\)\)\n/);
  assert.match(traffic, /    if state == S_CARS:\n        phase = 0\n        if night:\n            state = S_NIGHT\n        elif not night and req and done:\n            state = S_CARS_YELLOW\n    elif state == S_CARS_YELLOW:\n/);
  assert.equal(traffic.match(/\ndef step_machine\(\):/g).length, 1);
  assert.match(traffic, /\n\nmain\(\)\n$/);
  const timer = fs.readFileSync(path.join(GOLDEN, 'timer.py'), 'utf8');
  assert.match(timer, /left = \(secs - cnt\) & 0xF\n/);
  assert.match(timer, /cnt = \(cnt \+ 1\) & 0xF\n/);
  assert.match(timer, /\ntick = 0\n/);   // (its input tick keeps its name: the program's function is step_machine)
  const lamps = fs.readFileSync(path.join(GOLDEN, 'lamps.py'), 'utf8');
  assert.match(lamps, /^# lamps: combinational logic, generated by Silinx from the truth table lamps\.bool\.json/);
  assert.doesNotMatch(lamps, /state ==|S_|the outputs' defaults/);
});

test('a variable read after it is set in a tick, a registered output and a timer keep their next value apart; the others are set in place', () => {
  const t = generateMicroPython(timerModel()).code;
  assert.match(t, /\n    read_inputs\(\)\n    t_next = t \+ 1 if t < 7 else t  # \(a timer counts ticks\)\n    n_next = n\n/);
  assert.match(t, /\n    write_outputs\(\)\n    t = t_next\n    n = n_next\n/);
  assert.match(t, /\nn = 0  # 3 bits, registered: its value of the last tick\n/);
  assert.match(t, /\ndef step_machine\(\):\n    global state, t, n, led\n/);
  const w = generateMicroPython(modelOf('asm', wide()), { board: 'pico' }).code;
  assert.match(w, /\nr = 1  # 20 bits\n/);
  assert.match(w, /r_next = \(\(r << 3\) \+ a - 7\) & 0xFFFFF\n/);   // (the inner sum bare: the outer mask keeps its low bits)
  const t2 = generateMicroPython(modelOf('asm', readJson('examples/lock/src/timer.asm.json'))).code;
  assert.doesNotMatch(t2, /cnt_next/);
  assert.match(t2, /cnt = 0\n/);
});

// ---------------------------------------------------------------------------------------------------- the expressions
test('the expressions\' MicroPython: masks only where the widths need them, parentheses where Python\'s precedence asks, logical values 0 or 1', () => {
  const W = { a: 4, b: 8, c: 20, d: 32, x: 1, y: 1, k: 2 };
  const sym = (n) => ({ py: n, width: W[n] });
  const width = (n) => W[n] ?? null;
  const ast = (k, ...xs) => (k === 'id' ? { k, name: xs[0] } : k === 'lit' ? { k, v: BigInt(xs[0]), w: xs[1] ?? null } : k === 'un' ? { k, op: xs[0], a: xs[1] } : { k: 'bin', op: k, a: xs[0], b: xs[1] });
  const p = (e, W0) => pyExpr(lower(e, W0, width), sym).s;
  assert.equal(p(ast('+', ast('id', 'a'), ast('lit', 1)), 4), '(a + 1) & 0xF');
  assert.equal(p(ast('-', ast('+', ast('id', 'a'), ast('id', 'a')), ast('lit', 1)), 4), '(a + a - 1) & 0xF');   // (one mask)
  assert.equal(p(ast('&', ast('id', 'a'), ast('|', ast('id', 'b'), ast('id', 'a'))), 8), 'a & (b | a)');
  assert.equal(p(ast('&', ast('&', ast('id', 'a'), ast('id', 'b')), ast('id', 'a')), 8), 'a & b & a');
  assert.equal(p(ast('&&', ast('id', 'x'), ast('||', ast('id', 'y'), ast('id', 'x'))), 1), 'x and (y or x)');
  assert.equal(p(ast('||', ast('&&', ast('id', 'x'), ast('id', 'y')), ast('id', 'x')), 1), '(x and y) or x');
  assert.equal(p(ast('&&', ast('id', 'x'), ast('id', 'k')), 1), 'x and k != 0');   // (Python's and gives an operand: 0 or 1 kept)
  assert.equal(p(ast('==', ast('&', ast('id', 'a'), ast('lit', 3)), ast('lit', 1)), 1), 'a & 3 == 1');   // (Python's & binds tighter than ==)
  assert.equal(p(ast('==', ast('==', ast('id', 'x'), ast('id', 'y')), ast('id', 'x')), 1), '(x == y) == x');   // (no chained comparison)
  assert.equal(p(ast('<<', ast('id', 'b'), ast('lit', 3)), 8), '(b << 3) & 0xFF');
  assert.equal(p(ast('<<', ast('id', 'b'), ast('lit', 9)), 8), '0');
  assert.equal(p(ast('<<', ast('id', 'b'), ast('id', 'a')), 12), '0 if a >= 12 else (b << a) & 0xFFF');
  assert.equal(p(ast('<<', ast('id', 'b'), ast('id', 'k')), 12), '(b << k) & 0xFFF');   // (k below 4: never past the width)
  assert.equal(p(ast('>>', ast('id', 'd'), ast('id', 'd')), 32), 'd >> d');
  assert.equal(p(ast('un', '~', ast('id', 'a')), 4), '~a & 0xF');
  assert.equal(p(ast('un', '-', ast('id', 'a')), 4), '-a & 0xF');
  assert.equal(p(ast('un', '!', ast('id', 'b')), 1), 'not b != 0');
  assert.equal(p(ast('|', ast('un', '!', ast('id', 'x')), ast('id', 'y')), 1), '(not x) | y');
  assert.equal(p(ast('&&', ast('un', '!', ast('id', 'x')), ast('un', '!', ast('un', '!', ast('id', 'y')))), 1), 'not x and not not y');
  assert.equal(p(ast('+', ast('==', ast('id', 'x'), ast('id', 'y')), ast('lit', 1)), 2), '((x == y) + 1) & 3');
  assert.equal(pyValue(lower(ast('>>', ast('id', 'c'), ast('lit', 2)), 20, width), 8, sym), '(c >> 2) & 0xFF');
  assert.equal(pyValue(lower(ast('+', ast('id', 'b'), ast('lit', 1)), 8, width), 8, sym), '(b + 1) & 0xFF');   // (no assignment truncates in Python)
  assert.deepEqual([pyConst(5n), pyConst(10n), pyConst(0xFFFFFFFFn)], ['5', '0xA', '0xFFFFFFFF']);
});

// ---------------------------------------------------------------------------------------------------- pins, names, errors
test('the pins: the user\'s, the others the next free ones (the ESP32\'s, the Pico\'s); each problem said', () => {
  assert.deepEqual([gpioOf('GPIO4'), gpioOf(' io13 '), gpioOf('4'), gpioOf('GP2'), gpioOf('GPIO20'), gpioOf('GPIO40'), gpioOf('D2')], [4, 13, 4, 2, null, null, null]);
  assert.deepEqual([gpioOf('GP28', 'pico'), gpioOf('GP23', 'pico'), pinLabel(4), pinLabel(4, 'pico')], [28, null, 'GPIO4', 'GP4']);
  const ports = [{ name: 'x', width: 1, dir: 'in' }, { name: 'k', width: 2, dir: 'in' }, { name: 'z', width: 3, dir: 'out' }];
  assert.deepEqual(assignPyPins(ports, { k: ['GPIO25', 'GPIO34'] }), { pins: { k: [25, 34], x: [4], z: [13, 14, 16] }, errors: [], warnings: [] });
  assert.deepEqual(assignPyPins(ports, {}, 'pico'), { pins: { x: [2], k: [3, 4], z: [5, 6, 7] }, errors: [], warnings: [] });
  assert.deepEqual(assignPyPins(ports, { x: 'GPIO1' }).warnings, ["GPIO1 is the USB serial port's: 'x' on it disturbs the REPL and the upload of the program"]);
  assert.deepEqual(assignPyPins(ports, { k: ['GPIO4'] }).errors, ["'k' is 2 bits wide: it needs 2 pins, not 1"]);
  assert.deepEqual(assignPyPins(ports, { x: 'D2' }).errors, ["'D2' is not a GPIO of the ESP32 DevKit (GPIO0 to GPIO39)"]);
  assert.deepEqual(assignPyPins(ports, { x: 'GP29' }, 'pico').errors, ["'GP29' is not a GPIO of the Raspberry Pi Pico (GP0 to GP28)"]);
  assert.deepEqual(assignPyPins(ports, { x: 'GPIO7' }).errors, ["GPIO7 is the ESP32 DevKit's flash memory's: 'x' cannot use it"]);
  assert.deepEqual(assignPyPins(ports, { z: ['GPIO32', 'GPIO33', 'GPIO35'] }).errors, ["GPIO35 is an input only: 'z' is an output"]);
  assert.deepEqual(assignPyPins(ports, { x: 'GPIO4', k: ['GPIO13', 'GPIO4'] }).errors, ["GPIO4 is given to 'x' and to 'k'"]);
  assert.deepEqual(assignPyPins([{ name: 'w', width: 16, dir: 'out' }]).errors, ['The ports need 16 more pins: the ESP32 DevKit has 15 free']);
  assert.equal(PY_BOARDS.pico.free.length, 24);
  const m = modelOf('fsm', readJson('examples/traffic/src/traffic.fsm.json'));
  const g = generateMicroPython(m, { pins: { phase: ['GPIO25', 'GPIO26', 'GPIO27'] } });
  assert.deepEqual(g.pins, { phase: [25, 26, 27], req: [4], done: [13], night: [14] });
  assert.match(g.code, /\nPIN_PHASE = \(Pin\(25, Pin\.OUT\), Pin\(26, Pin\.OUT\), Pin\(27, Pin\.OUT\)\)\n/);
  assert.match(g.code, /\n# Outputs: phase GPIO25 GPIO26 GPIO27\.\n/);
  assert.match(generateMicroPython(m, { board: 'pico' }).code, /\n# MicroPython for the Raspberry Pi Pico\. [^\n]*\n# [^\n]*\n# Inputs: req GP2, done GP3, night GP4\.\n/);
  assert.deepEqual(g.warnings, []);
});

test('the names: a port named as a word of Python, a builtin, or as the program\'s own, renamed with a warning; the model\'s errors refused', () => {
  const m = modelOf('fsm', { ...readJson('examples/traffic/src/traffic.fsm.json'), inputs: [{ name: 'req', width: 1 }, { name: 'done', width: 1 }, { name: 'night', width: 1 }, { name: 'pass', width: 1 }, { name: 'state', width: 1 }, { name: 'len', width: 1 }] });
  const g = generateMicroPython(m);
  assert.deepEqual(g.warnings, [
    "'pass' is a word of Python or of MicroPython, or a name of the program's: it is pass_v in the program",
    "'state' is a word of Python or of MicroPython, or a name of the program's: it is state_v in the program",
    "'len' is a word of Python or of MicroPython, or a name of the program's: it is len_v in the program",
  ]);
  assert.match(g.code, /\npass_v = 0\n/);
  assert.match(g.code, /\nPIN_PASS_V = Pin\(16, Pin\.IN\)\n/);
  const bad = timerModel(); bad.initial = 'NOPE';
  assert.deepEqual(generateMicroPython(bad), { errors: ["The initial state 'NOPE' is not a state"] });
  assert.deepEqual(generateMicroPython(timerModel(), { tickMs: 0 }), { errors: ['The tick is 0 ms: a whole number of milliseconds, 1 or more'] });
  assert.deepEqual(generateMicroPython(timerModel(), { board: 'uno' }), { errors: ["'uno' is not a MicroPython board: esp32, pico"] });
  assert.deepEqual(generateMicroPython(timerModel(), { pins: { go: 'X9' } }), { errors: ["'X9' is not a GPIO of the ESP32 DevKit (GPIO0 to GPIO39)"] });
  assert.match(generateMicroPython(timerModel(), { tickMs: 250 }).code, /\nTICK_MS = 250  # the tick's period\n/);
});
