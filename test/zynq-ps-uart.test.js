// A Zynq board's PS UART as its FPGA node's interface (#4687, part 4; core/system-edit.js, core/system-check.js): added
// (named as its PS's, PS_UART1 on the Zybo Z7, PS_UART0 on the Arty Z7; 115200 baud, the starter's; no ports), changed,
// refused (a board with no PS, a microcontroller, tx or rx ports, a second one), kept by the System document, described
// (its MIO pins, the board's USB serial port), checked (linked to a terminal: no wires, the link left out of the
// simulation, said; to another node's UART refused). A node's project's PS folder (nodeProject's psDir) is no Silinx HLS
// source: the regression of the PL's build warning on <id>/ps/main.c.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSystem, readSystem, writeSystem } from '../core/system-doc.js';
import { addInterface, changeInterface, addLink, describeSystem } from '../core/system-edit.js';
import { analyzeSystem } from '../core/system-check.js';
import { nodeProject } from '../core/system-node.js';
import { inCpuNode } from '../core/drawing-code.js';

const zybo = { id: 'zybo', kind: 'fpga', module: 'leds', board: 'zybo-z7', variant: '20', interfaces: [], x: 0, y: 0 };
const term = { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 115200, frame: '8N1' }], x: 300, y: 0 };
const sys = (...nodes) => normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes, links: [] });
const diags = (s) => analyzeSystem(s, {}).diags.map((d) => `${d.severity}: ${d.message}`);

test('#4687 a PS UART added: its PS\'s name, 115200 baud 8N1, no ports; the Arty Z7\'s UART0; kept by the document', () => {
  const r = addInterface(sys(zybo), 'zybo', { kind: 'uart', ps: true });
  assert.deepEqual([r.error, r.id, r.system.nodes[0].interfaces], [undefined, 'zybo.PS_UART1', [{ name: 'PS_UART1', kind: 'uart', ps: true, baud: 115200, frame: '8N1' }]]);
  assert.equal(addInterface(sys({ ...zybo, board: 'arty-z7', variant: undefined }), 'zybo', { ps: true }).id, 'zybo.PS_UART0');
  assert.deepEqual(addInterface(sys(zybo), 'zybo', { ps: true, name: 'console', baud: 9600 }).system.nodes[0].interfaces, [{ name: 'console', kind: 'uart', ps: true, baud: 9600, frame: '8N1' }]);
  assert.deepEqual(readSystem(writeSystem(r.system)).system.nodes[0].interfaces[0], { name: 'PS_UART1', kind: 'uart', ps: true, baud: 115200, frame: '8N1' });
  // (changed: its name, baud and frame; no ports)
  const c = changeInterface(r.system, 'zybo', 'PS_UART1', { baud: 57600 });
  assert.equal(c.system.nodes[0].interfaces[0].baud, 57600);
  assert.deepEqual(changeInterface(r.system, 'zybo', 'PS_UART1', { tx: 'tx' }), { error: 'zybo.PS_UART1: this interface has no field \'tx\' to change (name, baud, frame)' });
});

test('#4687 a PS UART refused: a board with no PS, a microcontroller, tx or rx ports, another kind, a second one', () => {
  const add = (n, f) => addInterface(sys(n), n.id, { ps: true, ...f }).error;
  assert.equal(add({ ...zybo, board: 'basys3', variant: undefined }), 'zybo: a PS UART is a Zynq board\'s FPGA node\'s (the Zybo Z7, the Arty Z7)');
  assert.equal(add({ id: 'uno', kind: 'mcu', board: 'arduino-uno', interfaces: [] }), 'uno: a PS UART is a Zynq board\'s FPGA node\'s (the Zybo Z7, the Arty Z7)');
  assert.equal(add(zybo, { tx: 'tx' }), 'zybo: a PS UART\'s pins are its board\'s MIO 48 (TX) and 49 (RX), not tx and rx ports');
  assert.equal(add(zybo, { kind: 'gpio' }), 'zybo: a PS interface is a UART (its PS\'s UART1)');
  const once = addInterface(sys(zybo), 'zybo', { ps: true }).system;
  assert.equal(addInterface(once, 'zybo', { ps: true }).error, 'zybo: its PS UART is there already (PS_UART1)');
});

test('#4687 a PS UART described and checked: linked to a terminal, no wires, the link out of the simulation; refused to another node', () => {
  let s = addInterface(sys(zybo, term), 'zybo', { ps: true }).system;
  s = addLink(s, { a: 'zybo.PS_UART1', b: 'term.serial' }).system;
  assert.ok(describeSystem(s).includes('  PS_UART1: UART 115200 baud 8N1, its PS\'s UART1: TX MIO 48, RX MIO 49, the board\'s USB serial port'));
  assert.deepEqual(analyzeSystem(s, {}).wires, []);
  assert.deepEqual(diags(s), ['warning: serial: zybo.PS_UART1 is its PS\'s, whose Cortex-A9 is not simulated: Simulate and Emulate leave the link out (its terminal\'s Real Board reaches it)']);
  // (the terminal at another baud: said, as any UART link)
  const slow = normalizeSystem({ ...s, nodes: [s.nodes[0], { ...term, interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] }] });
  assert.ok(diags(slow).includes('error: serial: zybo.PS_UART1 at 115200 baud, term.serial at 9600: a UART\'s ends at one baud'));
  // (to an FPGA node's UART: refused, the PS's UART reaches the USB serial port only)
  const b2 = { id: 'b2', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 115200, frame: '8N1' }], x: 600, y: 0 };
  let w = addInterface(sys(zybo, b2), 'zybo', { ps: true }).system;
  w = addLink(w, { a: 'zybo.PS_UART1', b: 'b2.uart' }).system;
  assert.ok(diags(w).includes('error: serial: zybo.PS_UART1 is its board\'s USB serial port: link it to a serial terminal (b2.uart is a fpga node\'s)'), diags(w).join('\n'));
  // (written by hand: on a board with no PS, with ports, twice)
  const hand = (ifaces, board = 'zybo-z7') => diags(sys({ ...zybo, board, interfaces: ifaces })).filter((d) => d.startsWith('error'));
  assert.deepEqual(hand([{ name: 'P', kind: 'uart', ps: true, baud: 115200, frame: '8N1' }], 'basys3'), ['error: zybo.P: a PS UART, but its board basys3 has no processing system']);
  assert.deepEqual(hand([{ name: 'P', kind: 'uart', ps: true, tx: 'tx', baud: 115200, frame: '8N1' }]), ['error: zybo.P: a PS UART\'s pins are its board\'s MIO 48 (TX) and 49 (RX), not tx and rx ports']);
  assert.deepEqual(hand([{ name: 'P', kind: 'uart', ps: true, baud: 115200, frame: '8N1' }, { name: 'Q', kind: 'uart', ps: true, baud: 115200, frame: '8N1' }]), ['error: zybo.Q: a second PS UART: its PS has one, UART1']);
});

test('#4687 regression: a node\'s project (nodeProject) names its PS folder, whose C is no Silinx HLS source in the PL\'s build', () => {
  const pj = { name: 'p', kind: 'system', top: '', files: [{ path: 'zybo/leds.vhd', lang: 'vhdl', role: 'design' }] };
  const np = nodeProject(pj, zybo, 'zybo/leds.xdc');
  assert.equal(np.psDir, 'zybo/ps');
  const cpu = inCpuNode(np, { files: ['zybo/leds.vhd', 'zybo/ps/main.c', 'zybo/hls.c'] });
  assert.deepEqual(['zybo/ps/main.c', 'zybo/hls.c'].map(cpu), ['ps', false]);
  assert.equal('psDir' in nodeProject(pj, { ...zybo, board: 'basys3', variant: undefined }, 'zybo/leds.xdc'), false);
});
