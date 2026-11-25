// The nodes of a System that run (#5581, core/system-alone.js): the System cut to them, each link to a node that does not
// run with its open end replaced (a UART's by a terminal, the others left open) and said, a circuit whose boards do not all
// run left out; the Emulation Properties' nodes in silinx.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RUN_KINDS, runnableNodes, runRefusal, runningSystem, emulateNodesOf, withEmulateNodes, runName, simulateSettingsOf, withSimulateSettings, SIMULATE_MS } from '../core/system-alone.js';
import { readSystem } from '../core/system-doc.js';
import { checkSystem } from '../core/system-check.js';
import { ROOT } from './examples-lib.mjs';

const uartAvr = () => readSystem(fs.readFileSync(path.join(ROOT, 'examples/uart-avr/uart_avr.sys.json'), 'utf8')).system;

// a System of every kind of link: an FPGA, a Uno, a terminal on the Uno, a circuit between the Uno and the FPGA
const mixed = () => ({
  format: 'silinx-system', version: 2, name: 'mix',
  nodes: [
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'uno/a.hex', lang: 'c', interfaces: [
      { name: 'Serial', kind: 'uart', baud: 115200, frame: '8E1' }, { name: 'outs', kind: 'gpio', pins: ['D2', 'D3'], dir: 'out' },
      { name: 'ins', kind: 'gpio', pins: ['D4'], dir: 'in' }, { name: 'SPI', kind: 'spi' }, { name: 'Wire', kind: 'i2c' }], x: 0, y: 0 },
    { id: 'fpga', kind: 'fpga', module: 'top', board: 'basys2', variant: '250', pins: {}, lang: 'vhdl', interfaces: [
      { name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 115200, frame: '8E1' }, { name: 'btns', kind: 'gpio', pins: ['b<0>', 'b<1>'], dir: 'in' },
      { name: 'led', kind: 'gpio', pins: ['l'], dir: 'out' }, { name: 'spi', kind: 'spi', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss' },
      { name: 'i2c', kind: 'i2c', scl: 'scl', sda: 'sda' }], x: 0, y: 0 },
    { id: 'term', kind: 'terminal', interfaces: [{ name: 'uart', kind: 'uart', baud: 115200, frame: '8E1' }], x: 0, y: 0 },
    { id: 'board', kind: 'circuit', circuit: 'board/board.circ.json', interfaces: [], x: 0, y: 0 },
  ],
  links: [
    { id: 'ser', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' },
    { id: 'g1', kind: 'gpio', a: 'uno.outs', b: 'fpga.btns' },
    { id: 'g2', kind: 'gpio', a: 'fpga.led', b: 'uno.ins' },
    { id: 'bus', kind: 'spi', a: 'uno.SPI', b: 'fpga.spi' },
    { id: 'i2', kind: 'i2c', a: 'uno.Wire', b: 'fpga.i2c' },
  ],
});
const circuits = { 'board/board.circ.json': { parts: [{ id: 'A1', type: 'arduino-uno', label: 'uno' }, { id: 'R1', type: 'resistor' }], wires: [] } };

test('#5581 the nodes that are ticked to run: the FPGAs, the microcontrollers, the circuits and the designs, not the terminals', () => {
  assert.deepEqual(RUN_KINDS, ['fpga', 'mcu', 'circuit', 'design']);
  assert.deepEqual(runnableNodes(mixed()), ['uno', 'fpga', 'board']);
  assert.deepEqual(runnableNodes(uartAvr()), ['uno', 'fpga']);
  assert.deepEqual(runnableNodes(null), []);
});

test('#5581 every node (null): the System as it is, no warning', () => {
  const sys = uartAvr();
  const r = runningSystem(sys, null);
  assert.equal(r.system, sys);
  assert.deepEqual(r.warnings, []);
});

test('#5581 uart-avr\'s FPGA alone: its UART\'s far end the terminal serial, at the link\'s baud and frame, said; the System checks clean', () => {
  const sys = uartAvr();
  const r = runningSystem(sys, ['fpga']);
  assert.deepEqual(r.warnings, ['link serial: uno is not run, its end fpga.uart is the terminal serial here (9600 baud, 8N1)']);
  assert.deepEqual(r.system.nodes.map(n => [n.id, n.kind]), [['fpga', 'fpga'], ['serial', 'terminal']]);
  assert.deepEqual(r.system.nodes[1].interfaces, [{ name: 'uart', kind: 'uart', baud: 9600, frame: '8N1' }]);
  assert.deepEqual(r.system.links, [{ id: 'serial', kind: 'uart', a: 'fpga.uart', b: 'serial.uart' }]);
  // (the cut System is a System its check takes: no error, no warning (the 5 V one was the Uno's))
  const modules = { uart: ['clk', 'rx', 'btn', 'tx', 'led', 'seg', 'dp', 'an'].map(name => ({ name, dir: ['clk', 'rx', 'btn'].includes(name) ? 'in' : 'out', width: { btn: 1, led: 8, seg: 7, an: 4 }[name] ?? 1 })) };
  const constraints = { 'fpga/uart.ucf': fs.readFileSync(path.join(ROOT, 'examples/uart-avr/fpga/uart.ucf'), 'utf8') };   // (its pins, #5581)
  assert.deepEqual(checkSystem(r.system, { modules, files: ['fpga/uart.vhd'], constraints }).map(d => `${d.severity}: ${d.message}`), []);
  // (the document's own System unchanged)
  assert.deepEqual(sys.nodes.map(n => n.id), ['uno', 'fpga']);
});

test('#5581 uart-avr\'s Uno alone: the terminal on its Serial', () => {
  const r = runningSystem(uartAvr(), ['uno']);
  assert.deepEqual(r.warnings, ['link serial: fpga is not run, its end uno.Serial is the terminal serial here (9600 baud, 8N1)']);
  assert.deepEqual(r.system.links, [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'serial.uart' }]);
});

test('#5581 each kind of link\'s open end: a UART\'s a terminal (its id free), a GPIO input\'s said undriven, an output\'s, an SPI\'s and an I²C\'s left open; a terminal linked to a node that runs runs; a circuit whose board does not run is not run', () => {
  const sys = mixed();
  sys.links.push({ id: 't', kind: 'uart', a: 'term.uart', b: 'uno.Serial' });
  sys.nodes.push({ id: 'ser', kind: 'terminal', interfaces: [], x: 0, y: 0 });   // (the link's name taken: ser_2)
  const f = runningSystem(sys, ['fpga', 'board'], { circuits });
  assert.deepEqual(f.warnings, [
    'circuit board is not run: its board uno is not run',
    'link ser: uno is not run, its end fpga.uart is the terminal ser_2 here (115200 baud, 8E1)',
    'link g1: uno is not run, its end fpga.btns is held at 0: its inputs b<0>, b<1>',
    'link g2: uno is not run, its end fpga.led is left open',
    'link bus: uno is not run, its end fpga.spi is left open',
    'link i2: uno is not run, its end fpga.i2c is left open',
  ]);
  assert.deepEqual(f.system.nodes.map(n => n.id), ['fpga', 'ser_2']);
  const u = runningSystem(sys, ['uno', 'board'], { circuits });
  assert.deepEqual(u.warnings, [
    'link ser: fpga is not run, its end uno.Serial is the terminal ser_2 here (115200 baud, 8E1)',
    'link g1: fpga is not run, its end uno.outs is left open',
    'link g2: fpga is not run, its end uno.ins is held at 0: its input D4',
    'link bus: fpga is not run, its end uno.SPI is left open',
    'link i2: fpga is not run, its end uno.Wire is left open',
  ]);
  // (the terminal on the Uno runs with it; the circuit, its board the Uno, too)
  assert.deepEqual(u.system.nodes.map(n => n.id), ['uno', 'term', 'board', 'ser_2']);
  assert.deepEqual(u.system.links.map(l => l.id), ['ser', 't']);
  // (a circuit not read: kept)
  assert.deepEqual(runningSystem(mixed(), ['board']).system.nodes.map(n => n.id), ['board']);
});

test('#5581 refused: a node it has not, a terminal, none', () => {
  assert.deepEqual(runningSystem(uartAvr(), ['fpga', 'x']), { error: 'x: no such node to run in uart_avr (its nodes: uno, fpga)' });
  assert.deepEqual(runningSystem(mixed(), ['term']), { error: 'term: no such node to run in mix (its nodes: uno, fpga, board)' });
  assert.deepEqual(runningSystem(uartAvr(), []), { error: 'no node of uart_avr is chosen to run' });
  assert.equal(runRefusal(uartAvr(), null), null);
  assert.equal(runRefusal(uartAvr(), ['uno', 'fpga']), null);
});

test('#5581 the Emulation Properties\' nodes in silinx.json: kept in the document\'s order, every node the setting left out, a node removed since dropped', () => {
  const sys = uartAvr(), pj = { name: 'ua', top: '' };
  assert.equal(emulateNodesOf(pj, sys), null);
  const one = withEmulateNodes(pj, sys, ['fpga']);
  assert.deepEqual(one, { name: 'ua', top: '', system: { emulate: { nodes: ['fpga'] } } });
  assert.deepEqual(emulateNodesOf(one, sys), ['fpga']);
  // (both: the setting left out; other System settings kept)
  assert.deepEqual(withEmulateNodes({ ...one, system: { ...one.system, other: 1 } }, sys, ['fpga', 'uno']), { name: 'ua', top: '', system: { other: 1 } });
  assert.deepEqual(withEmulateNodes(one, sys, null), { name: 'ua', top: '' });
  assert.deepEqual(withEmulateNodes(pj, sys, ['x']), { error: 'x: no such node to run in uart_avr (its nodes: uno, fpga)' });
  assert.deepEqual(withEmulateNodes(pj, sys, []), { error: 'no node of uart_avr is chosen to run' });
  // (a node renamed or removed since: not run; every node left: null)
  assert.deepEqual(emulateNodesOf({ system: { emulate: { nodes: ['old', 'fpga'] } } }, sys), ['fpga']);
  assert.equal(emulateNodesOf({ system: { emulate: { nodes: ['fpga', 'uno', 'old'] } } }, sys), null);
});

test('#5581 a run\'s name: Emulate System, Emulate Node <id> for one node, Simulate\'s the same', () => {
  assert.equal(runName('Emulate', null), 'Emulate System');
  assert.equal(runName('Emulate', ['fpga', 'uno']), 'Emulate System');
  assert.equal(runName('Emulate', ['fpga']), 'Emulate Node fpga');
  assert.equal(runName('Simulate', ['uno']), 'Simulate Node uno');
});

test('#5581 a GPIO input held at 0, its link cut: in the engine, the Uno\'s D4 (an input with its pull-up, copied to D13) reads 0, not its pull-up\'s 1; the plan says so', async () => {
  const { prepareSystem } = await import('../core/system-run.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  // D13 an output; D4 an input with its pull-up; D13 = D4, again and again
  const hex = intelHex(avrAssemble(['ldi r16, 0x20', 'out 0x04, r16', 'ldi r16, 0x10', 'out 0x0B, r16', 'loop:', 'in r17, 0x09', 'ldi r18, 0', 'sbrc r17, 4', 'ldi r18, 0x20', 'out 0x05, r18', 'rjmp loop']));
  const sys = { format: 'silinx-system', version: 2, name: 'held', nodes: [
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'uno/a.hex', lang: 'c', interfaces: [{ name: 'ins', kind: 'gpio', pins: ['D4'], dir: 'in' }], x: 0, y: 0 },
    { id: 'uno2', kind: 'mcu', board: 'arduino-uno', firmware: 'uno/a.hex', lang: 'c', interfaces: [{ name: 'outs', kind: 'gpio', pins: ['D13'], dir: 'out' }], x: 0, y: 0 },
  ], links: [{ id: 'g', kind: 'gpio', a: 'uno2.outs', b: 'uno.ins' }] };
  const cut = runningSystem(sys, ['uno']);
  assert.deepEqual([cut.system.held, cut.warnings], [['uno.ins'], ['link g: uno2 is not run, its end uno.ins is held at 0: its input D4']]);
  const d13 = async (s) => {
    const r = await prepareSystem(s, { ports: {}, firmware: async () => hex, netlist: () => null });
    assert.equal(r.error, undefined, r.error);
    r.sim.watch('uno', ['D13']);
    r.sim.run(2e9);
    return { idle: r.plan.idle, d13: r.sim.nodes.get('uno').value('D13') };
  };
  assert.deepEqual(await d13(cut.system), { idle: [{ node: 'uno', pin: 'D4', value: 0, held: true }], d13: 0 });
  // (the same Uno with no link and nothing held: its pull-up's 1)
  assert.deepEqual(await d13({ ...sys, nodes: [sys.nodes[0]], links: [] }), { idle: [], d13: 1 });
});

test('#5581 the Simulation Properties in silinx.json: the nodes, the run\'s time, the stimulus file; left out at their defaults; refusals', () => {
  const sys = uartAvr(), pj = { name: 'ua' };
  assert.deepEqual(simulateSettingsOf(pj, sys), { nodes: null, ms: SIMULATE_MS, stimulus: null });
  assert.equal(SIMULATE_MS, 100);
  const set = withSimulateSettings(pj, sys, { nodes: ['fpga'], ms: 20, stimulus: 'ua.stim.json' }, ['ua.stim.json']);
  assert.deepEqual(set, { name: 'ua', system: { simulate: { nodes: ['fpga'], ms: 20, stimulus: 'ua.stim.json' } } });
  assert.deepEqual(simulateSettingsOf(set, sys), { nodes: ['fpga'], ms: 20, stimulus: 'ua.stim.json' });
  // (the Emulation Properties kept; only what is given changed; the defaults left out)
  const both = withEmulateNodes(set, sys, ['uno']);
  assert.deepEqual(withSimulateSettings(both, sys, { ms: 100 }).system, { simulate: { nodes: ['fpga'], stimulus: 'ua.stim.json' }, emulate: { nodes: ['uno'] } });
  assert.deepEqual(withSimulateSettings(set, sys, { nodes: null, ms: SIMULATE_MS, stimulus: '' }), { name: 'ua' });
  assert.deepEqual(withSimulateSettings(set, sys, { nodes: ['uno', 'fpga'] }).system.simulate, { ms: 20, stimulus: 'ua.stim.json' });
  const no = (s, error, files = ['ua.stim.json']) => assert.deepEqual(withSimulateSettings(pj, sys, s, files), { error });
  no({ nodes: ['x'] }, 'x: no such node to run in uart_avr (its nodes: uno, fpga)');
  no({ nodes: [] }, 'no node of uart_avr is chosen to run');
  no({ ms: 0 }, 'its run\'s time: from 0 to 10000 ms (10 s)');
  no({ ms: 20000 }, 'its run\'s time: from 0 to 10000 ms (10 s)');
  no({ stimulus: 'a.json' }, 'a.json: a stimulus file is a .stim.json');
  no({ stimulus: 'b.stim.json' }, 'b.stim.json: no such file in the project');
  // (a node removed since: not run; a time not a number: the default's)
  assert.deepEqual(simulateSettingsOf({ system: { simulate: { nodes: ['old', 'fpga'], ms: 'x' } } }, sys), { nodes: ['fpga'], ms: 100, stimulus: null });
});
