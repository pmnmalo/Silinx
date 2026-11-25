// Tests of a System's CPU node's program made of its drawings (#5486): a drawing's unit (core/reactive-c.js
// generateUnit: its own file, its names static, its <module>_init() and <module>_tick()), the node's sketch calling them
// (core/reactive-c-main.js nodeMain: extern "C" for the C ones, the pins two drawings take said) and the sketch kept as
// the drawings are (core/node-main-sync.js syncNodeMain: made, updated, removed, none beside a hand-written sketch, none
// in a MicroPython node), on a store in memory. Their run on the Arduino itself: test/reactive-avr.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawingToReactive } from '../core/reactive-from.js';
import { generateArduino, generateUnit } from '../core/reactive-c.js';
import { MAIN_MARK, isNodeMain, nodeMain, nodeMainPath } from '../core/reactive-c-main.js';
import { syncNodeMain } from '../core/node-main-sync.js';
import { chart, readJson } from './reactive-lib.mjs';

const TRAFFIC = readJson('examples/traffic/src/traffic.fsm.json');
const modelOf = (kind, doc) => drawingToReactive(kind, doc).model;

test('a drawing\'s unit: its own file (.c, .cpp), every name static but its _init and _tick, its state type its own, its A pins by number', () => {
  const m = modelOf('fsm', TRAFFIC);
  const u = generateUnit(m);
  assert.deepEqual([u.filename, u.functions, u.errors], ['traffic.c', ['traffic_init', 'traffic_tick'], undefined]);
  assert.equal(generateUnit(m, { lang: 'cpp' }).filename, 'traffic.cpp');
  assert.equal(generateUnit(m, { lang: 'cpp' }).code, u.code);
  // (no setup(), loop() nor TICK_MS: the node's sketch's)
  assert.doesNotMatch(u.code, /void setup\(\)|void loop\(\)|TICK_MS =/);
  assert.match(u.code, /\nvoid traffic_init\(void\) \{\n(  .*pinMode\(.*\n)+  resetMachine\(\);\n\}\n\n\/\/ one tick\nvoid traffic_tick\(void\) \{\n  stepMachine\(\);\n\}\n$/);
  assert.match(u.code, /\nenum traffic_State \{ S_CARS, /);
  assert.match(u.code, /\nstatic enum traffic_State state;\n/);
  // (every other name at the file's scope static: the node's other units' apart)
  const global = u.code.split('\n').filter((l) => /^(const |uint|int|unsigned|enum \w+ \w+;|void (?!traffic_))/.test(l));
  assert.deepEqual(global, []);
  // (an A pin by its number, C's initializer a constant: A0 is a variable of the Arduino core's)
  const a = generateUnit(modelOf('asm', chart()));
  assert.match(a.code, /\nstatic const uint8_t PIN_ACC\[6\] = \{ 14 \/\* A0 \*\/, 15 \/\* A1 \*\/, 16 \/\* A2 \*\/, 17 \/\* A3 \*\/, 18 \/\* A4 \*\/, 19 \/\* A5 \*\/ \};\n/);
  assert.match(a.code, /\nstatic const uint32_t K = 3;\n/);
  // (the sketch of one drawing alone, generateArduino's, as before)
  assert.match(generateArduino(m).code, /\nconst uint8_t PIN_REQ = 2;\n[\s\S]*\nenum State \{ S_CARS, [\s\S]*\nvoid setup\(\) \{\n/);
  assert.deepEqual(generateUnit({ ...m, states: [] }).errors?.length > 0, true);
});

test('the node\'s sketch: its drawings\' init and tick called, the C ones\' declared extern "C"; the exact text', () => {
  const units = [{ module: 'lamps', file: 'uno/lamps.bool.json', code: '', cpp: false }, { module: 'traffic', file: 'uno/traffic.fsm.json', code: '', cpp: true }];
  assert.equal(nodeMain('uno', []), null);
  assert.deepEqual(nodeMain('uno', units), { warnings: [], code: [
    `// uno: its program, ${MAIN_MARK} (lamps.bool.json, traffic.fsm.json): edit the drawings, not this file.`,
    '// setup() calls each drawing\'s <module>_init(), loop() each one\'s <module>_tick() every TICK_MS milliseconds.',
    '', '#include <Arduino.h>', '', '// ---- the drawings\' functions (their files next to this one)',
    'extern "C" {', '  void lamps_init(void);', '  void lamps_tick(void);', '}', 'void traffic_init(void);', 'void traffic_tick(void);',
    '', 'const unsigned long TICK_MS = 10;   // the tick\'s period',
    '', 'void setup() {', '  lamps_init();', '  traffic_init();', '}',
    '', 'void loop() {', '  static unsigned long lastTick = 0;', '  if (millis() - lastTick < TICK_MS) return;', '  lastTick += TICK_MS;', '  lamps_tick();', '  traffic_tick();', '}', ''].join('\n') });
  assert.match(nodeMain('uno', units, { tickMs: 5 }).code, /\nconst unsigned long TICK_MS = 5;/);
  assert.deepEqual([isNodeMain(nodeMain('uno', units).code), isNodeMain('void setup() {}\n'), isNodeMain(null), nodeMainPath('uno')], [true, false, false, 'uno/uno.ino']);
});

test('the node\'s sketch: a pin one drawing writes and another one takes said, its port\'s pins at once; a pin both read not', () => {
  const head = (ins, outs) => `// x\n// Inputs: ${ins}.\n// Outputs: ${outs}.\n`;
  const units = [
    { module: 'a', file: 'uno/a.fsm.json', code: head('go D2', 'y D5 D6, z D7'), cpp: false },
    { module: 'b', file: 'uno/b.fsm.json', code: head('go D2, k D5 D6', 'w D8'), cpp: false },
    { module: 'c', file: 'uno/c.fsm.json', code: head('s D8', 'v D7'), cpp: false },
  ];
  assert.deepEqual(nodeMain('uno', units).warnings, [
    "uno: D5 D6 are a's y and b's k: give one of them its pins (a GPIO interface of the node named as its port)",
    "uno: D8 is b's w and c's s: give one of them its pins (a GPIO interface of the node named as its port)",
    "uno: D7 is a's z and c's v: give one of them its pins (a GPIO interface of the node named as its port)",
  ]);
});

// a project's files in memory, as core/drawing-sync.js's store
function store(files) {
  const F = new Map(Object.entries(files));
  return { F, fileTree: async () => [...F.keys()].sort(), readFile: async (_, p) => { if (!F.has(p)) throw new Error(`no ${p}`); return F.get(p); },
    writeFile: async (_, p, t) => { F.set(p, t); }, deleteFile: async (_, p) => { F.delete(p); } };
}

test('the node\'s sketch kept as its drawings are: made, the same, updated, removed; none beside a hand-written sketch, none in a MicroPython node', async () => {
  const u = generateUnit(modelOf('fsm', TRAFFIC));
  const P = store({ 'uno/traffic.fsm.json': JSON.stringify({ name: 'traffic', generatedFile: 'uno/traffic.c' }), 'uno/traffic.c': u.code, 'uno/hello.hex': '',
    'uno/build/x.fsm.json': JSON.stringify({ generatedFile: 'uno/build/x.c' }), 'uno/build/x.c': '', 'fpga/y.fsm.json': JSON.stringify({ generatedFile: 'fpga/y.vhd' }) });
  const node = { id: 'uno' };
  assert.deepEqual(await syncNodeMain(P, 'p', node, 'c'), { path: 'uno/uno.ino', written: 'uno/uno.ino', removed: null, messages: ["uno/uno.ino generated from uno's drawings"] });
  assert.equal(P.F.get('uno/uno.ino'), nodeMain('uno', [{ module: 'traffic', file: 'uno/traffic.fsm.json', code: u.code, cpp: false }]).code);
  assert.deepEqual(await syncNodeMain(P, 'p', node, 'c'), { path: 'uno/uno.ino', written: null, removed: null, messages: [] });
  // (a second drawing, its C++: updated; a drawing with no C yet: not called)
  P.F.set('uno/lamps.bool.json', JSON.stringify({ generatedFile: 'uno/lamps.cpp' }));
  P.F.set('uno/lamps.cpp', '// lamps\n');
  P.F.set('uno/broken.fsm.json', JSON.stringify({ name: 'broken' }));
  assert.deepEqual((await syncNodeMain(P, 'p', node, 'cpp')).messages, ["uno/uno.ino updated from uno's drawings"]);
  assert.match(P.F.get('uno/uno.ino'), /\nextern "C" \{\n  void traffic_init\(void\);\n  void traffic_tick\(void\);\n\}\nvoid lamps_init\(void\);\n/);
  assert.doesNotMatch(P.F.get('uno/uno.ino'), /broken/);
  // (no drawing with its C left: removed)
  for (const f of ['uno/traffic.c', 'uno/lamps.cpp']) P.F.delete(f);
  assert.deepEqual(await syncNodeMain(P, 'p', node, 'c'), { path: 'uno/uno.ino', written: null, removed: 'uno/uno.ino', messages: ['uno/uno.ino removed: uno has no drawing with its C'] });
  assert.equal(P.F.has('uno/uno.ino'), false);
  assert.equal(await syncNodeMain(P, 'p', node, 'c'), null);
  // (a hand-written sketch: the node's program, none made; an .ino generated from one drawing alone, before: not one)
  P.F.set('uno/traffic.c', u.code);
  P.F.set('uno/mine.ino', 'void setup() {}\nvoid loop() {}\n');
  assert.equal(await syncNodeMain(P, 'p', node, 'c'), null);
  assert.equal(P.F.has('uno/uno.ino'), false);
  P.F.set('uno/mine.ino', generateArduino(modelOf('fsm', TRAFFIC)).code);
  assert.equal((await syncNodeMain(P, 'p', node, 'c')).written, 'uno/uno.ino');
  // (a MicroPython node: its sketch made from its drawings' C removed, said; a hand-written one kept)
  assert.deepEqual((await syncNodeMain(P, 'p', node, 'micropython')).messages, ["uno/uno.ino removed: uno's language is not C"]);
  P.F.set('uno/uno.ino', 'void setup() {}\n');
  assert.equal(await syncNodeMain(P, 'p', node, 'micropython'), null);
  assert.equal(P.F.get('uno/uno.ino'), 'void setup() {}\n');
});
