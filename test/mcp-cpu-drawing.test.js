// The MCP server's drawings in a System's CPU node (#5486, #2674: as the interface): write_file and new_source give a
// drawing in a node whose base language is C its sketch (core/drawing-code.js, through core/drawing-sync.js), made
// again when it changes, stale when it has errors, its pins its node's GPIO interfaces'; a drawing whose HDL file was
// made before its node was a C one gets its C instead; a schematic, a circuit, a register map refused in a CPU node; in
// a MicroPython node, said not made yet; in an FPGA node, its HDL as before. The exact messages.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { unlabelled } from './mcp-label.js';
import { reactiveFromFile } from '../core/reactive-from.js';
import { generateArduino } from '../core/reactive-c.js';
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
const sketch = (pins = {}) => generateArduino(reactiveFromFile('uno/traffic.fsm.json', TRAFFIC).model, { pins }).code;

test('write_file: a drawing in a C node gets its sketch (<module>.ino), made again when it changes, stale with errors; its pins its node\'s GPIO interfaces\'', async () => {
  await ok('new_project_from_example', { name: 'r', example: 'uart-avr' });
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ interfaces: [...SYS.nodes[0].interfaces, { name: 'phase', kind: 'gpio', pins: ['A0', 'A1', 'A2'], dir: 'out' }] }), null, 2) });
  const w = await write('uno/traffic.fsm.json', TRAFFIC);
  assert.equal(w.isError, false, w.text);
  assert.equal(w.text, `Created uno/traffic.fsm.json (${TRAFFIC.length} characters).\nuno/traffic.ino generated from uno/traffic.fsm.json`);
  assert.deepEqual(w.data.hdl, { file: 'uno/traffic.ino', written: true, removed: null, stale: null });
  assert.equal(await read('uno/traffic.ino'), sketch({ phase: ['A0', 'A1', 'A2'] }));
  assert.equal(JSON.parse(await read('uno/traffic.fsm.json')).generatedFile, 'uno/traffic.ino');
  // (changed: made again; the same: nothing written, no message)
  const changed = TRAFFIC.replace('"cond": "night"', '"cond": "night && !req"');
  const w2 = await write('uno/traffic.fsm.json', JSON.stringify({ ...JSON.parse(changed), generatedFile: 'uno/traffic.ino' }, null, 2));
  assert.match(w2.text, /\nuno\/traffic\.ino updated from uno\/traffic\.fsm\.json$/);
  assert.match(await read('uno/traffic.ino'), /if \(night && !req\) \{/);
  const same = await write('uno/traffic.fsm.json', JSON.stringify({ ...JSON.parse(changed), generatedFile: 'uno/traffic.ino' }, null, 2));
  assert.deepEqual([same.text.split('\n').length, same.data.hdl.written], [1, false]);
  // (errors: its C left as it was, said)
  const bad = JSON.stringify({ ...JSON.parse(TRAFFIC.replace('"cond": "done"', '"cond": "done &&"')), generatedFile: 'uno/traffic.ino' }, null, 2);
  const w3 = await write('uno/traffic.fsm.json', bad);
  assert.match(w3.text, /\nWARNING: uno\/traffic\.ino not updated: uno\/traffic\.fsm\.json has errors: Transition CARS_YELLOW → ALL_RED: /);
  assert.equal(w3.data.hdl.written, false);
  assert.match(await read('uno/traffic.ino'), /if \(night && !req\) \{/);
  // (an FPGA node's drawing: its HDL, as before)
  const f = await write('fpga/lamps.bool.json', unlinked('examples/traffic/src/lamps.bool.json'));
  assert.match(f.text, /\nfpga\/lamps\.vhd generated from fpga\/lamps\.bool\.json$/);
});

test('a drawing whose HDL file was made before its node was a C one gets its C instead; a MicroPython node\'s drawing said not made; a port named as an Arduino word renamed, said', async () => {
  // (no node uno: the drawing's HDL)
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify({ ...SYS, nodes: SYS.nodes.filter((n) => n.id !== 'uno'), links: [] }, null, 2) });
  const timer = unlinked('examples/lock/src/timer.asm.json');
  assert.match((await write('uno/timer.asm.json', timer)).text, /\nuno\/timer\.vhd generated from uno\/timer\.asm\.json$/);
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(SYS, null, 2) });
  const w = await write('uno/timer.asm.json', await read('uno/timer.asm.json'));
  assert.equal(w.text.split('\n').slice(1).join('\n'), 'uno/timer.asm.json: its node\'s language is C: its file is now uno/timer.ino (uno/timer.vhd removed)');
  assert.deepEqual(w.data.hdl, { file: 'uno/timer.ino', written: true, removed: 'uno/timer.vhd', stale: null });
  assert.equal((await call('read_file', { project: 'r', path: 'uno/timer.vhd' })).isError, true);
  assert.match(await read('uno/timer.ino'), /^\/\/ timer: a Mealy machine, generated by Silinx from the ASM chart timer\.asm\.json/);
  // (a MicroPython node: not made yet, said)
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ lang: 'micropython' }), null, 2) });
  const py = await write('uno/blink.fsm.json', TRAFFIC.replace('"name": "traffic"', '"name": "blink"'));
  assert.equal(py.text.split('\n').slice(1).join('\n'), 'WARNING: uno/blink.fsm.json: a drawing\'s MicroPython is not made yet (#5487): its node\'s base language is MicroPython');
  // (a C++ node: its sketch too, with its warning)
  await ok('write_file', { project: 'r', path: 'uart_avr.sys.json', text: JSON.stringify(withUno({ lang: 'cpp' }), null, 2) });
  const d = await write('uno/waits.fsm.json', TRAFFIC.replace('"name": "traffic"', '"name": "waits"').replace(/\bdone\b/g, 'delay'));
  assert.equal(d.text.split('\n').slice(1).join('\n'), "uno/waits.ino generated from uno/waits.fsm.json\nWARNING: uno/waits.fsm.json: 'delay' is a word of C or of the Arduino API, or a name of the sketch's: it is delay_v in the sketch");
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
  await ok('write_file', { project: 'r', path: 'src/add2.c', text: C.replace('add(', 'add2(') });
  const g = await call('c_generated', { project: 'r', path: 'uno/add.c', what: 'hdl' });
  assert.deepEqual([g.isError, g.text], [true, "c_generated: uno/add.c is a microcontroller node's C: it is built for its board, not by Silinx HLS"]);
  const s = await call('c_synthesis_report', { project: 'r', path: 'uno/add.c' });
  assert.deepEqual([s.isError, s.text], [true, "c_synthesis_report: uno/add.c is a microcontroller node's C: it is built for its board, not by Silinx HLS"]);
  assert.equal((await call('c_generated', { project: 'r', path: 'src/add2.c', what: 'hdl' })).isError, false);
  // (the FPGA's design: the C of src/, not the CPU node's C nor its drawings)
  const P = await import('../server/projects.js');
  const { viewSources } = await import('../server/ise.js');
  const views = await viewSources(await P.readProject('r'), P.projectDir('r'));
  assert.deepEqual(views.map((v) => v.path).filter((p) => !p.startsWith('fpga/')).sort(), ['src/add2.c']);
});
