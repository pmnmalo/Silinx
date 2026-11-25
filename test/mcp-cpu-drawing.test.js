// The MCP server's drawings in a System's CPU node (#5486, #2674: as the interface): write_file and new_source give a
// drawing in a node whose base language is C its C, a unit of the node's program (<module>.c, .cpp in C++:
// core/drawing-code.js, through core/drawing-sync.js), and the node its sketch calling them (<id>/<id>.ino,
// core/node-main-sync.js, the pins two drawings take said), made again when it changes, stale when it has errors, its
// pins its node's GPIO interfaces'; a drawing whose HDL file was
// made before its node was a C one gets its C instead; a schematic, a circuit, a register map refused in a CPU node; in
// a MicroPython node its MicroPython (<module>.py, #5487: its C replaced when the node's language changes, and back); in an
// FPGA node, its HDL as before. The exact messages.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { reactiveFromFile } from '../core/reactive-from.js';
import { generateUnit } from '../core/reactive-c.js';
import { nodeMain } from '../core/reactive-c-main.js';
import { generateMicroPython } from '../core/reactive-py.js';
import { ROOT } from './reactive-lib.mjs';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-cpu-drawing-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: unlabelled(r.structuredContent), isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
// (the example's drawing copied: its HDL file not linked)
const unlinked = (p) => { const m = JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); delete m.generatedFile; return JSON.stringify(m, null, 2); };
const TRAFFIC = unlinked('examples/traffic/src/traffic.fsm.json');
const SYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/uart-avr/uart_avr.sys.json'), 'utf8'));
const write = (p, text) => call('write_file', { project: 'r', path: p, text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) });
const read = async (p) => (await import('../server/projects.js')).readFile('r', p);
/** The System with its Arduino's base language and interfaces changed. */
const withUno = (uno) => ({ ...SYS, nodes: SYS.nodes.map((n) => (n.id === 'uno' ? { ...n, ...uno } : n)) });
const unit = (pins = {}) => generateUnit(reactiveFromFile('uno/traffic.fsm.json', TRAFFIC).model, { pins }).code;

test('write_file: a drawing in a C node gets its C (<module>.c, its _init and _tick) and its node its sketch (<id>/<id>.ino) calling them; made again when it changes, stale with errors; its pins its node\'s GPIO interfaces\'', async () => {
  await ok('new_project_from_example', { name: 'r', example: 'uart-avr' });
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ interfaces: [...SYS.nodes[0].interfaces, { name: 'phase', kind: 'gpio', pins: ['A0', 'A1', 'A2'], dir: 'out' }] }), null, 2) });
  const w = await write('uno/traffic.fsm.json', TRAFFIC);
  assert.equal(w.isError, false, w.text);
  assert.equal(w.text, `Created uno/traffic.fsm.json (${TRAFFIC.length} characters).\nuno/traffic.c generated from uno/traffic.fsm.json\nuno/uno.ino generated from uno's drawings`);
  assert.deepEqual(w.data.hdl, { file: 'uno/traffic.c', written: true, removed: null, stale: null });
  assert.equal(await read('uno/traffic.c'), unit({ phase: ['A0', 'A1', 'A2'] }));
  assert.equal(JSON.parse(await read('uno/traffic.fsm.json')).generatedFile, 'uno/traffic.c');
  assert.equal(await read('uno/uno.ino'), nodeMain('uno', [{ module: 'traffic', file: 'uno/traffic.fsm.json', code: unit({ phase: ['A0', 'A1', 'A2'] }), cpp: false }]).code);
  // (no HDL made, and nothing added to the FPGA's design's sources: the C and the sketch are no sources of its list)
  for (const p of ['uno/traffic.vhd', 'uno/traffic.v', 'uno/traffic.ino']) assert.equal((await call('read_file', { project: 'r', path: p })).isError, true, p);
  const listed = (await (await import('../server/projects.js')).readProject('r')).files.map((f) => f.path ?? f);
  assert.deepEqual(listed.filter((f) => f.startsWith('uno/')), []);
  // (changed: made again; the same: nothing written, no message)
  const changed = TRAFFIC.replace('"cond": "night"', '"cond": "night && !req"');
  const w2 = await write('uno/traffic.fsm.json', JSON.stringify({ ...JSON.parse(changed), generatedFile: 'uno/traffic.c' }, null, 2));
  assert.match(w2.text, /\nuno\/traffic\.c updated from uno\/traffic\.fsm\.json$/);   // (the sketch the same: no message)
  assert.match(await read('uno/traffic.c'), /if \(night && !req\) \{/);
  const same = await write('uno/traffic.fsm.json', JSON.stringify({ ...JSON.parse(changed), generatedFile: 'uno/traffic.c' }, null, 2));
  assert.deepEqual([same.text.split('\n').length, same.data.hdl.written], [1, false]);
  // (errors: its C left as it was, said)
  const bad = JSON.stringify({ ...JSON.parse(TRAFFIC.replace('"cond": "done"', '"cond": "done &&"')), generatedFile: 'uno/traffic.c' }, null, 2);
  const w3 = await write('uno/traffic.fsm.json', bad);
  assert.match(w3.text, /\nWARNING: uno\/traffic\.c not updated: uno\/traffic\.fsm\.json has errors: Transition CARS_YELLOW → ALL_RED: /);
  assert.equal(w3.data.hdl.written, false);
  assert.match(await read('uno/traffic.c'), /if \(night && !req\) \{/);
  // (an FPGA node's drawing: its HDL, as before)
  const f = await write('fpga/lamps.bool.json', unlinked('examples/traffic/src/lamps.bool.json'));
  assert.match(f.text, /\nfpga\/lamps\.vhd generated from fpga\/lamps\.bool\.json$/);
});

test('a drawing whose HDL file was made before its node was a C one gets its C instead; a port named as an Arduino word renamed, said', async () => {
  // (no node uno: the drawing's HDL)
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify({ ...SYS, nodes: SYS.nodes.filter((n) => n.id !== 'uno'), links: [] }, null, 2) });
  const timer = unlinked('examples/lock/src/timer.asm.json');
  assert.match((await write('uno/timer.asm.json', timer)).text, /\nuno\/timer\.vhd generated from uno\/timer\.asm\.json$/);
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(SYS, null, 2) });
  const w = await write('uno/timer.asm.json', await read('uno/timer.asm.json'));
  assert.equal(w.text.split('\n').slice(1).join('\n'), "uno/timer.asm.json: its node's language is C: its file is now uno/timer.c (uno/timer.vhd removed)\nuno/uno.ino updated from uno's drawings");
  assert.deepEqual(w.data.hdl, { file: 'uno/timer.c', written: true, removed: 'uno/timer.vhd', stale: null });
  assert.equal((await call('read_file', { project: 'r', path: 'uno/timer.vhd' })).isError, true);
  assert.match(await read('uno/timer.c'), /^\/\/ timer: a Mealy machine, generated by Silinx from the ASM chart timer\.asm\.json/);
  // (a C++ node: its C++ (<module>.cpp), with its warning; the sketch calls the three, the C ones' declared extern "C";
  // an output pin of one drawing another one's: said)
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ lang: 'cpp' }), null, 2) });
  const d = await write('uno/waits.fsm.json', TRAFFIC.replace('"name": "traffic"', '"name": "waits"').replace(/\bdone\b/g, 'delay'));
  const clash = (a, b) => `WARNING: uno: D5 D6 D7 are ${a} and ${b}: give one of them its pins (a GPIO interface of the node named as its port)`;
  assert.equal(d.text.split('\n').slice(1).join('\n'), ["uno/waits.cpp generated from uno/waits.fsm.json",
    "WARNING: uno/waits.fsm.json: 'delay' is a word of C or of the Arduino API, or a name of the sketch's: it is delay_v in the sketch",
    "uno/uno.ino updated from uno's drawings", clash("timer's secs", "waits's phase")].join('\n'));
  const main = await read('uno/uno.ino');
  assert.match(main, /\nextern "C" \{\n  void timer_init\(void\);\n  void timer_tick\(void\);\n  void traffic_init\(void\);\n  void traffic_tick\(void\);\n\}\nvoid waits_init\(void\);\nvoid waits_tick\(void\);\n/);
  assert.match(main, /\nvoid setup\(\) \{\n  timer_init\(\);\n  traffic_init\(\);\n  waits_init\(\);\n\}\n/);
});

const ARDUINO_PY = "the node's board, the Arduino Uno, does not run MicroPython: its program is the ESP32 DevKit's, on its free pins";

test('#5487 write_file: a drawing in a MicroPython node gets its program (<module>.py), made again, stale with errors; its C replaced when its node\'s language changes, and back', async () => {
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ lang: 'micropython' }), null, 2) });
  const BLINK = TRAFFIC.replace('"name": "traffic"', '"name": "blink"');
  const w = await write('uno/blink.fsm.json', BLINK);
  // (the node's sketch made from its drawings' C: removed, its node no longer of C)
  assert.equal(w.text.split('\n').slice(1).join('\n'), `uno/blink.py generated from uno/blink.fsm.json\nWARNING: uno/blink.fsm.json: ${ARDUINO_PY}\nuno/uno.ino removed: uno's language is not C`);
  assert.deepEqual(w.data.hdl, { file: 'uno/blink.py', written: true, removed: null, stale: null });
  assert.equal(await read('uno/blink.py'), generateMicroPython(reactiveFromFile('uno/blink.fsm.json', BLINK).model).code);
  assert.equal(JSON.parse(await read('uno/blink.fsm.json')).generatedFile, 'uno/blink.py');
  for (const p of ['uno/blink.ino', 'uno/blink.c', 'uno/blink.vhd', 'uno/blink.v', 'uno/uno.ino']) assert.equal((await call('read_file', { project: 'r', path: p })).isError, true, p);
  const listed = (await (await import('../server/projects.js')).readProject('r')).files.map((f) => f.path ?? f);
  assert.deepEqual(listed.filter((f) => f.startsWith('uno/')), []);
  // (changed: made again, its warning said again; with errors: left as it was, said)
  const changed = JSON.stringify({ ...JSON.parse(BLINK.replace('"cond": "night"', '"cond": "night && !req"')), generatedFile: 'uno/blink.py' }, null, 2);
  assert.equal((await write('uno/blink.fsm.json', changed)).text.split('\n').slice(1).join('\n'), `uno/blink.py updated from uno/blink.fsm.json\nWARNING: uno/blink.fsm.json: ${ARDUINO_PY}`);
  assert.match(await read('uno/blink.py'), /\n        if night and not req:\n/);
  const bad = JSON.stringify({ ...JSON.parse(changed.replace('"cond": "done"', '"cond": "done &&"')) }, null, 2);
  const w3 = await write('uno/blink.fsm.json', bad);
  assert.match(w3.text, /\nWARNING: uno\/blink\.py not updated: uno\/blink\.fsm\.json has errors: Transition CARS_YELLOW → ALL_RED: /);
  assert.match(await read('uno/blink.py'), /if night and not req:/);
  // (the node in C: its C instead, the .py removed, the node's sketch made; and back in MicroPython: its MicroPython, the
  // .c removed, and the sketch)
  await write('uno/blink.fsm.json', changed);
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ lang: 'c' }), null, 2) });
  const c = await write('uno/blink.fsm.json', changed);
  const clash = (a, b) => `WARNING: uno: D5 D6 D7 are ${a} and ${b}: give one of them its pins (a GPIO interface of the node named as its port)`;
  assert.equal(c.text.split('\n').slice(1).join('\n'), ["uno/blink.fsm.json: its node's language is C: its file is now uno/blink.c (uno/blink.py removed)",
    "uno/uno.ino generated from uno's drawings", clash("blink's phase", "timer's secs"), clash("blink's phase", "waits's phase")].join('\n'));
  assert.equal((await call('read_file', { project: 'r', path: 'uno/blink.py' })).isError, true);
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ lang: 'micropython' }), null, 2) });
  const back = await write('uno/blink.fsm.json', await read('uno/blink.fsm.json'));
  assert.equal(back.text.split('\n').slice(1).join('\n'), `uno/blink.fsm.json: its node's language is MicroPython: its file is now uno/blink.py (uno/blink.c removed)\nWARNING: uno/blink.fsm.json: ${ARDUINO_PY}\nuno/uno.ino removed: uno's language is not C`);
  assert.deepEqual(back.data.hdl, { file: 'uno/blink.py', written: true, removed: 'uno/blink.c', stale: null });
  assert.equal(JSON.parse(await read('uno/blink.fsm.json')).generatedFile, 'uno/blink.py');
  // (its program's file taken already: not made, said)
  await ok('write_file', { project: 'r', path: 'uno/lamps.py', text: '# mine\n' });
  const taken = await write('uno/lamps.bool.json', unlinked('examples/traffic/src/lamps.bool.json'));
  assert.equal(taken.text.split('\n').slice(1).join('\n'), 'WARNING: uno/lamps.bool.json has no MicroPython file: uno/lamps.py exists already');
  assert.equal(await read('uno/lamps.py'), '# mine\n');
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(SYS, null, 2) });
});

test('a schematic, a circuit, a register map refused in a CPU node (write_file, new_source), with their messages, nothing written; in an FPGA node made', async () => {
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(SYS, null, 2) });
  const sch = await write('uno/control.sch.json', fs.readFileSync(path.join(ROOT, 'examples/lock/src/control.sch.json'), 'utf8'));
  assert.deepEqual([sch.isError, sch.text], [true, 'write_file: uno/control.sch.json: A schematic is hardware: it cannot run on a CPU. Draw the module as a state diagram, an ASM chart, a Petri net or a truth table, or write its code.']);
  assert.equal((await call('read_file', { project: 'r', path: 'uno/control.sch.json' })).isError, true);
  const ns = await call('new_source', { project: 'r', type: 'schematic', name: 'adder', location: 'uno' });
  assert.deepEqual([ns.isError, ns.text], [true, 'new_source: uno/adder.sch.json: A schematic is hardware: it cannot run on a CPU. Draw the module as a state diagram, an ASM chart, a Petri net or a truth table, or write its code.']);
  const circ = await call('new_source', { project: 'r', type: 'circuit', name: 'board', location: 'uno' });
  assert.deepEqual([circ.isError, circ.text], [true, 'new_source: uno/board.circ.json: A circuit is hardware: it cannot run on a CPU.']);
  const regs = await call('new_source', { project: 'r', type: 'regmap', name: 'regs', location: 'uno' });
  assert.deepEqual([regs.isError, regs.text], [true, 'new_source: uno/regs.regs.json: A register map is hardware: it cannot run on a CPU.']);
  // (a state diagram in the CPU node: made, empty, no C yet; a schematic in the FPGA node: made)
  assert.match((await ok('new_source', { project: 'r', type: 'fsm', name: 'machine', location: 'uno' })).text, /^Created /);
  assert.match((await ok('new_source', { project: 'r', type: 'schematic', name: 'adder', location: 'fpga' })).text, /^Created /);
});

test('a CPU node\'s C and drawings are its board\'s: not Silinx HLS\'s (its tools refuse them), nor modules of the FPGA\'s design (#5486)', async () => {
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(SYS, null, 2) });
  const C = 'int add(int a, int b) { return a + b; }\n';
  await ok('write_file', { project: 'r', path: 'uno/add.c', text: C });
  await ok('write_file', { project: 'r', path: 'fpga/add2.c', text: C.replace('add(', 'add2(') });
  const g = await call('c_generated', { project: 'r', path: 'uno/add.c', what: 'hdl' });
  assert.deepEqual([g.isError, g.text], [true, "c_generated: uno/add.c is a microcontroller node's C: it is built for its board, not by Silinx HLS"]);
  const s = await call('c_synthesis_report', { project: 'r', path: 'uno/add.c' });
  assert.deepEqual([s.isError, s.text], [true, "c_synthesis_report: uno/add.c is a microcontroller node's C: it is built for its board, not by Silinx HLS"]);
  assert.equal((await call('c_generated', { project: 'r', path: 'fpga/add2.c', what: 'hdl' })).isError, false);
  // (the FPGA's design: the C of its folder, not the CPU node's C nor its drawings)
  const P = await import('../server/projects.js');
  const { viewSources } = await import('../server/ise.js');
  const views = await viewSources(await P.readProject('r'), P.projectDir('r'));
  assert.deepEqual(views.map((v) => v.path).filter((p) => p.endsWith('.c')).sort(), ['fpga/add2.c']);
});
