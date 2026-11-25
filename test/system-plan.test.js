// A System's build and programming plan (#5489, core/system-plan.js): each node's build, image and programmer, the FPGA
// nodes first then the microcontrollers; its state from its record (up to date; out of date: a source changed, new or
// removed, its description changed, its place on the canvas not; not built; given; nothing to build; not buildable,
// why); the console's lines, exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemBuildPlan, buildRecord, describedNode, fpgaSources, sketchSources, needsBuild, planLine, planLines, PLAN_KINDS } from '../core/system-plan.js';

const FPGA = { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { tx: 'A3', rx: 'J3' }, lang: 'vhdl', interfaces: [], x: 0, y: 0 };
const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'uno/hello.hex', lang: 'c', interfaces: [], x: 100, y: 0 };
const TERM = { id: 'term', kind: 'terminal', interfaces: [] };
const FILES = ['uart_avr.sys.json', 'fpga/uart.vhd', 'fpga/uart_tx.vhd', 'fpga/sim/tb.vhd', 'uno/hello.ino', 'uno/hello.hex', 'uno/util.h', 'notes.txt'];
const HASHES = { 'fpga/uart.vhd': 'a1', 'fpga/uart_tx.vhd': 'a2', 'uno/hello.ino': 'b1', 'uno/util.h': 'b2' };
const BIT = 'build/nodes/fpga/build/uart.bit';
const sys = (...nodes) => ({ nodes });
const built = (extra = {}) => ({
  fpga: buildRecord(FPGA, ['fpga/uart.vhd', 'fpga/uart_tx.vhd'], HASHES),
  uno: buildRecord(UNO, ['uno/hello.ino', 'uno/util.h'], HASHES), ...extra });
const plan = (nodes, o = {}) => systemBuildPlan(sys(...nodes), { files: FILES, hashes: HASHES, exists: new Set([...FILES, BIT]), records: built(), ...o });

test('#5489 the plan\'s order: the FPGA nodes first, then the microcontrollers; a terminal is not in it', () => {
  const p = plan([UNO, TERM, FPGA, { ...FPGA, id: 'fpga2' }]);
  assert.deepEqual(p.nodes.map(e => e.id), ['fpga', 'fpga2', 'uno']);
  assert.deepEqual(PLAN_KINDS, ['fpga', 'mcu']);
  assert.deepEqual(systemBuildPlan(sys(TERM)), { nodes: [] });
  assert.deepEqual(planLines({ nodes: [] }), [], 'no line for a System with nothing to build');
});

test('#5489 an FPGA node: its sources (its folder\'s, not its test benches), its bitstream, JTAG; up to date with its record', () => {
  assert.deepEqual(fpgaSources(FILES, 'fpga'), ['fpga/uart.vhd', 'fpga/uart_tx.vhd']);
  const [e] = plan([FPGA]).nodes;
  assert.deepEqual(e, { id: 'fpga', kind: 'fpga', board: 'basys2', build: 'silinx', image: BIT, programmer: 'jtag', sources: ['fpga/uart.vhd', 'fpga/uart_tx.vhd'], state: 'up to date', reason: null });
  assert.equal(planLine(e), 'fpga: up to date; built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG');
  assert.equal(needsBuild(e), false);
  assert.equal(needsBuild(e, true), true, 'a node\'s own Build builds it up to date too');
});

test('#5489 an FPGA node out of date: a source changed, new, removed (its constraints file one, #5581); its constraints file, board or module changed; its place on the canvas not', () => {
  const st = (node, o) => { const [e] = plan([node], o).nodes; return [e.state, e.reason]; };
  assert.deepEqual(st(FPGA, { hashes: { ...HASHES, 'fpga/uart_tx.vhd': 'zz' } }), ['out of date', 'fpga/uart_tx.vhd changed since its last build']);
  assert.deepEqual(st(FPGA, { files: [...FILES, 'fpga/extra.v'] }), ['out of date', 'fpga/extra.v is new since its last build']);
  assert.deepEqual(st(FPGA, { files: FILES.filter(f => f !== 'fpga/uart_tx.vhd') }), ['out of date', 'fpga/uart_tx.vhd was removed since its last build']);
  // (its pins its constraints file's, a source of its folder, #5581: the file named another, or changed)
  assert.deepEqual(st({ ...FPGA, constraints: 'fpga/other.ucf' }), ['out of date', 'its constraints changed since its last build']);
  assert.deepEqual(st(FPGA, { files: [...FILES, 'fpga/uart.ucf'] }), ['out of date', 'fpga/uart.ucf is new since its last build']);
  assert.deepEqual(st({ ...FPGA, variant: '100' }), ['out of date', 'its variant changed since its last build']);
  assert.deepEqual(st({ ...FPGA, x: 500, y: -40, interfaces: [{ name: 'u', kind: 'uart', tx: 'tx', rx: 'rx' }] }), ['up to date', null]);
  assert.deepEqual(st({ ...FPGA, pins: { rx: 'J3', tx: 'B4' } }), ['up to date', null], 'its pins as read from its file: not its description');
  assert.deepEqual(st(FPGA, { records: {} }), ['out of date', 'its last build left no record of its sources']);
  assert.deepEqual(st(FPGA, { exists: new Set(FILES) }), ['not built', `no ${BIT} yet`]);
  // (a source's test bench changed: not its build's)
  assert.deepEqual(st(FPGA, { files: [...FILES, 'fpga/sim/tb2.vhd'] }), ['up to date', null]);
});

test('#5489 an FPGA node that cannot be built: why, no build', () => {
  const [e] = plan([{ ...FPGA, pins: {} }]).nodes;
  assert.equal(e.state, 'not buildable');
  assert.equal(e.build, null);
  assert.equal(planLine(e), 'fpga: not buildable (its module\'s ports are on no pin of its board (its User Constraints\' I/O Pin Planning)); programmed over JTAG');
  assert.equal(planLine(plan([{ ...FPGA, module: undefined }]).nodes[0]), 'fpga: not buildable (an FPGA node with no module); programmed over JTAG');
  assert.equal(planLine(plan([{ ...FPGA, board: 'nope' }]).nodes[0]), 'fpga: not buildable (no FPGA board \'nope\' (variant 250)); programmed over JTAG');
});

test('#5489 an Arduino node with a sketch: compiled by arduino-cli to its firmware; out of date when its sketch changed', () => {
  const [e] = plan([UNO]).nodes;
  assert.deepEqual(e, { id: 'uno', kind: 'mcu', board: 'arduino-uno', build: 'arduino-cli', image: 'uno/hello.hex', programmer: 'avrdude', sources: ['uno/hello.ino', 'uno/util.h'], state: 'up to date', reason: null });
  assert.equal(planLine(e), 'uno: up to date; compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)');
  assert.equal(planLine(plan([UNO], { hashes: { ...HASHES, 'uno/util.h': 'x' } }).nodes[0]), 'uno: out of date (uno/util.h changed since its last build); compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)');
  assert.equal(planLine(plan([{ ...UNO, board: 'arduino-nano' }]).nodes[0]), 'uno: out of date (its board changed since its last build); compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)');
  // (a drawing that makes its sketch, #5486: one of its sources; a schematic not)
  assert.deepEqual(sketchSources([...FILES, 'uno/traffic.fsm.json', 'uno/x.sch.json', 'fpga/y.fsm.json'], 'uno'), ['uno/hello.ino', 'uno/traffic.fsm.json', 'uno/util.h']);
  assert.equal(planLine(plan([UNO], { files: [...FILES, 'uno/traffic.fsm.json'] }).nodes[0]), 'uno: out of date (uno/traffic.fsm.json is new since its last build); compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)');
  // (no firmware yet: the .hex its sketch makes, not built)
  const none = plan([{ ...UNO, firmware: undefined }], { exists: new Set(FILES.filter(f => f !== 'uno/hello.hex')), records: {} }).nodes[0];
  assert.equal(planLine(none), 'uno: not built (no uno/hello.hex yet); compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)');
});

test('#5489 an Arduino node with a .hex and no sketch: given; its firmware missing, or a MicroPython node: said', () => {
  const files = ['uno/hello.hex', 'uno/hello.asm'];
  const [e] = systemBuildPlan(sys(UNO), { files }).nodes;
  assert.deepEqual(e, { id: 'uno', kind: 'mcu', board: 'arduino-uno', build: null, image: 'uno/hello.hex', programmer: 'avrdude', sources: [], state: 'given', reason: 'its firmware uno/hello.hex, no sketch to compile' });
  assert.equal(planLine(e), 'uno: given (its firmware uno/hello.hex, no sketch to compile); its image uno/hello.hex, programmed by avrdude (arduino-cli upload)');
  assert.equal(needsBuild(e, true), false);
  assert.equal(planLine(systemBuildPlan(sys(UNO), { files: [] }).nodes[0]), 'uno: not buildable (its firmware uno/hello.hex is missing and there is no sketch to compile); programmed by avrdude (arduino-cli upload)');
  assert.equal(planLine(systemBuildPlan(sys({ ...UNO, firmware: undefined }), { files: [] }).nodes[0]), 'uno: not buildable (no sketch in its folder uno/ (an .ino: write one, or draw its program)); programmed by avrdude (arduino-cli upload)');
  const py = { ...UNO, lang: 'micropython', firmware: undefined };
  assert.equal(planLine(systemBuildPlan(sys(py), { files: ['uno/main.py', 'uno/lib.py'] }).nodes[0]), 'uno: nothing to build (a MicroPython program runs as it is); programmed over its raw REPL (mpremote)');
  assert.deepEqual(systemBuildPlan(sys(py), { files: ['uno/main.py', 'uno/lib.py'] }).nodes[0].sources, ['uno/lib.py', 'uno/main.py']);
  assert.equal(planLine(systemBuildPlan(sys(py), { files: [] }).nodes[0]), 'uno: nothing to build (no .py in its folder uno/ yet); programmed over its raw REPL (mpremote)');
  assert.equal(planLine(systemBuildPlan(sys({ ...UNO, board: 'nope' }), { files }).nodes[0]), 'uno: not buildable (no microcontroller board \'nope\')');
});

test('#5489 a PIC24 node: its .hex given, programmed by a PICkit; its C not compiled yet (XC16, #5482)', () => {
  const PIC = { id: 'pic', kind: 'mcu', board: 'explorer-1632', firmware: 'pic/blink.hex', lang: 'c', interfaces: [] };
  assert.equal(planLine(systemBuildPlan(sys(PIC), { files: ['pic/blink.hex', 'pic/main.c'] }).nodes[0]), 'pic: given (its .hex pic/blink.hex, made outside Silinx); its image pic/blink.hex, programmed by a PICkit (MPLAB IPE)');
  assert.equal(planLine(systemBuildPlan(sys(PIC), { files: ['pic/main.c'] }).nodes[0]), 'pic: not buildable (its C is not compiled yet (XC16 on the local server, #5482): give it the .hex XC16 made); programmed by a PICkit (MPLAB IPE)');
  assert.equal(planLine(systemBuildPlan(sys({ ...PIC, firmware: undefined }), { files: [] }).nodes[0]), 'pic: not buildable (no .hex for its firmware: give it the .hex XC16 made); programmed by a PICkit (MPLAB IPE)');
  assert.equal(planLine(systemBuildPlan(sys(PIC), { files: [] }).nodes[0]), 'pic: not buildable (no .hex for its firmware (pic/blink.hex is missing): give it the .hex XC16 made); programmed by a PICkit (MPLAB IPE)');
});

test('#5489 the record: the node\'s description as its build reads it, its sources\' hashes', () => {
  assert.deepEqual(buildRecord(FPGA, ['fpga/uart.vhd', 'fpga/none.vhd'], HASHES), {
    node: { kind: 'fpga', board: 'basys2', variant: '250', module: 'uart', lang: 'vhdl' },
    sources: { 'fpga/uart.vhd': 'a1', 'fpga/none.vhd': null } });
  assert.deepEqual(describedNode({ id: 'x', kind: 'mcu', board: 'arduino-uno', firmware: '', lang: null, x: 3 }), { kind: 'mcu', board: 'arduino-uno' });
  assert.deepEqual(planLines(plan([UNO, FPGA])), [
    'Build plan (the FPGA nodes first, then the microcontrollers):',
    '  fpga: up to date; built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG',
    '  uno: up to date; compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)',
  ]);
});
