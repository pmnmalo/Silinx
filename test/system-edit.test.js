// A System document's edits (#4700, core/system-edit.js): nodes, interfaces and links added, changed and removed, as the
// System editor and the MCP server's edit_system do them; every error's message; the System given never changed; the
// System described (check_system's first lines). The edits' results checked by the System's check (core/system-check.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSystem, writeSystem, readSystem } from '../core/system-doc.js';
import { checkSystem } from '../core/system-check.js';
import { addNode, changeNode, removeNode, addInterface, changeInterface, removeInterface, addLink, changeLink, removeLink,
  editSystem, describeSystem, freeId, EDIT_ACTIONS, UART_DEFAULTS, NODE_KIND_NAMES } from '../core/system-edit.js';

const ok = r => { assert.equal(r.error, undefined, r.error); return r; };
const MODULES = { uart: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rx', dir: 'in', width: 1 }, { name: 'tx', dir: 'out', width: 1 }, { name: 'led', dir: 'out', width: 8 }] };

// the uart_avr system built edit by edit, as the editor does
function built() {
  let s = newSystem('uart_avr');
  s = ok(addNode(s, { kind: 'fpga', module: 'uart', board: 'basys2', x: 0, y: 0 })).system;
  s = ok(addNode(s, { kind: 'mcu', x: -200 })).system;
  s = ok(addNode(s, { kind: 'terminal', y: 200 })).system;
  s = ok(addInterface(s, 'fpga', { kind: 'uart', name: 'uart', tx: 'tx', rx: 'rx' })).system;
  s = ok(changeNode(s, 'fpga', { variant: '250', pins: { rx: 'j3', tx: 'A3' } })).system;
  s = ok(addLink(s, { a: 'mcu.Serial', b: 'fpga.uart' })).system;
  return s;
}

test('#4700 a system built by edits: its nodes, interfaces and link as the format has them; checked with its two warnings (the 5 V output, the terminal)', () => {
  const s = built();
  assert.deepEqual(s.nodes.map(n => n.id), ['fpga', 'mcu', 'term']);
  assert.deepEqual(s.nodes[0], { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { rx: 'J3', tx: 'A3' }, lang: 'vhdl',
    interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], x: 0, y: 0 });
  assert.deepEqual(s.nodes[1], { id: 'mcu', kind: 'mcu', board: 'arduino-uno', firmware: null, lang: 'c', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: -200, y: 0 });
  assert.deepEqual(s.nodes[2], { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 200 });
  assert.deepEqual(s.links, [{ id: 'serial', kind: 'uart', a: 'mcu.Serial', b: 'fpga.uart' }]);
  // (its text read back the same)
  assert.deepEqual(readSystem(writeSystem(s)).system, s);
  const diags = checkSystem(s, { modules: MODULES, files: null }).map(d => `${d.severity}: ${d.message}`);
  assert.deepEqual(diags, [
    "warning: serial: mcu's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards",
    'warning: term joins nothing: no link reaches it']);
});

test('#4700 the System given is never changed', () => {
  const s = built(), before = JSON.stringify(s);
  for (const r of [addNode(s, { kind: 'terminal' }), changeNode(s, 'fpga', { id: 'f', board: 'nexys2' }), removeNode(s, 'mcu'),
    addInterface(s, 'fpga', { kind: 'gpio', pins: ['led<0>'], dir: 'out' }), changeInterface(s, 'fpga', 'uart', { baud: 115200 }),
    removeInterface(s, 'fpga', 'uart'), addLink(s, { a: 'term.serial', b: 'fpga.uart' }), changeLink(s, 'serial', { id: 's1' }), removeLink(s, 'serial')]) assert.ok(r.system || r.error);
  assert.equal(JSON.stringify(s), before);
});

test('#4700 ids: free ones made, renamed in the links\' ends, refused when used or not an id', () => {
  let s = built();
  assert.equal(freeId(s, 'mcu'), 'mcu2');
  assert.equal(freeId(s, 'MCU'), 'MCU2');   // (ids compared without case)
  assert.equal(freeId(s, 'board'), 'board');
  const r = ok(addNode(s, { kind: 'mcu', board: 'arduino-nano' }));
  assert.equal(r.id, 'mcu2');
  assert.equal(r.system.nodes.at(-1).board, 'arduino-nano');
  s = ok(changeNode(s, 'mcu', { id: 'uno' })).system;
  assert.deepEqual(s.links[0], { id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' });
  assert.deepEqual(changeNode(s, 'uno', { id: 'FPGA' }), { error: "the id 'FPGA' is used already" });
  assert.deepEqual(changeNode(s, 'uno', { id: 'serial' }), { error: "the id 'serial' is used already" });   // (a link's)
  assert.deepEqual(changeNode(s, 'uno', { id: '2x' }), { error: "'2x' is not an id: a letter, then letters, digits and _" });
  // (the rule core/ident.js's NAME_RE, #5184: no _ first, no - nor space; letters, digits and _ after the first)
  for (const id of ['_x', 'a-b', 'a b', '']) assert.deepEqual(changeNode(s, 'uno', { id }), { error: `'${id}' is not an id: a letter, then letters, digits and _` }, id);
  assert.equal(ok(changeNode(s, 'uno', { id: 'Uno_2' })).system.nodes.some(n => n.id === 'Uno_2'), true);
  assert.deepEqual(addNode(s, { kind: 'terminal', id: 'uno' }), { error: "the id 'uno' is used already" });
  assert.deepEqual(changeLink(s, 'serial', { id: 'uno' }), { error: "the id 'uno' is used already" });
  assert.deepEqual(ok(changeLink(s, 'serial', { id: 'link1' })).system.links[0].id, 'link1');
});

test('#4700 a node\'s fields: by its kind, its pins merged and removed, a variant and a firmware removed', () => {
  let s = built();
  s = ok(changeNode(s, 'fpga', { pins: { tx: null, rx: 'K3' }, variant: null, x: 13.4, y: '-7' })).system;
  // (a pin removed: '' until the System is saved, which sets its constraints file, #5581)
  assert.deepEqual([s.nodes[0].pins, s.nodes[0].variant, s.nodes[0].x, s.nodes[0].y], [{ rx: 'K3', tx: '' }, undefined, 13, -7]);
  s = ok(changeNode(s, 'mcu', { firmware: 'mcu/echo.hex', board: 'arduino-nano' })).system;
  assert.deepEqual([s.nodes[1].firmware, s.nodes[1].board], ['mcu/echo.hex', 'arduino-nano']);
  assert.equal(ok(changeNode(s, 'mcu', { firmware: '' })).system.nodes[1].firmware, null);
  assert.deepEqual(changeNode(s, 'mcu', { board: 'esp32' }), { error: "no microcontroller board 'esp32': arduino-uno, arduino-nano, explorer-1632, pico, pico-w, esp32-devkitc" });
  assert.deepEqual(changeNode(s, 'mcu', { module: 'uart' }), { error: "mcu: a Microcontroller node has no field 'module' (id, board, firmware, runtime, usb, x, y, lang)" });
  assert.deepEqual(changeNode(s, 'term', { board: 'basys2' }), { error: "term: a Serial terminal node has no field 'board' (id, x, y)" });
  assert.deepEqual(changeNode(s, 'fpga', { firmware: 'a.hex' }), { error: "fpga: a FPGA node has no field 'firmware' (id, module, board, variant, pins, constraints, ps, psClocks, psMap, usb, x, y, lang)" });
  assert.deepEqual(changeNode(s, 'nope', {}), { error: "no node 'nope' in the System" });
});

test('#4700 nodes added: every kind, an unknown kind or board refused', () => {
  const s = newSystem('x');
  assert.deepEqual(addNode(s, { kind: 'pico' }), { error: "no node kind 'pico': fpga, mcu, terminal, circuit, design, broker" });
  assert.deepEqual(addNode(s, { kind: 'mcu', board: 'esp32' }), { error: "no microcontroller board 'esp32': arduino-uno, arduino-nano, explorer-1632, pico, pico-w, esp32-devkitc" });
  const f = ok(addNode(s, { kind: 'fpga' }));
  assert.deepEqual(f.system.nodes[0], { id: 'fpga', kind: 'fpga', module: null, board: 'basys2', lang: 'vhdl', interfaces: [], x: 0, y: 0 });
  assert.deepEqual(Object.keys(NODE_KIND_NAMES), ['fpga', 'mcu', 'terminal', 'circuit', 'broker']);
  assert.deepEqual(UART_DEFAULTS, { baud: 9600, frame: '8N1' });
});

test('#4700 a node removed with its links; a link removed', () => {
  const s = built();
  const r = ok(removeNode(s, 'fpga'));
  assert.deepEqual([r.system.nodes.map(n => n.id), r.system.links], [['mcu', 'term'], []]);
  assert.deepEqual(ok(removeLink(s, 'serial')).system.links, []);
  assert.deepEqual(removeLink(s, 'nope'), { error: "no link 'nope' in the System" });
  assert.deepEqual(removeNode(s, 'nope'), { error: "no node 'nope' in the System" });
});

test('#4700 interfaces: added, changed, renamed in the links, removed with their links; their fields checked', () => {
  let s = built();
  const g = ok(addInterface(s, 'fpga', { kind: 'gpio', pins: ['led<0>', 'led<1>'], dir: 'out' }));
  assert.equal(g.id, 'fpga.gpio1');
  assert.deepEqual(g.system.nodes[0].interfaces[1], { name: 'gpio1', kind: 'gpio', pins: ['led<0>', 'led<1>'], dir: 'out' });
  assert.deepEqual(ok(addInterface(s, 'mcu', { kind: 'gpio', name: 'btn', pins: ['D2'] })).system.nodes[1].interfaces[1], { name: 'btn', kind: 'gpio', pins: ['D2'], dir: 'in' });
  s = ok(changeInterface(s, 'fpga', 'uart', { name: 'serial', baud: 115200, frame: '8E1' })).system;
  assert.deepEqual(s.nodes[0].interfaces[0], { name: 'serial', kind: 'uart', tx: 'tx', rx: 'rx', baud: 115200, frame: '8E1' });
  assert.equal(s.links[0].b, 'fpga.serial');
  assert.deepEqual(ok(changeInterface(s, 'fpga', 'serial', { tx: '' })).system.nodes[0].interfaces[0].tx, undefined);
  assert.deepEqual(ok(changeInterface(s, 'mcu', 'Serial', { baud: 115200 })).system.nodes[1].interfaces[0].baud, 115200);
  // the errors
  assert.deepEqual(changeInterface(s, 'mcu', 'Serial', { name: 'S2' }), { error: "mcu.Serial: this interface has no field 'name' to change (baud, frame)" });
  assert.deepEqual(changeInterface(s, 'fpga', 'serial', { baud: 0 }), { error: "fpga.serial: the baud is a whole number of bits a second, not '0'" });
  assert.deepEqual(changeInterface(s, 'fpga', 'serial', { frame: '9N1' }), { error: "fpga.serial: the frame is its data bits (5 to 8), its parity (N, E, O) and its stop bits (1, 2), as 8N1, not '9N1'" });
  assert.deepEqual(changeInterface(s, 'fpga', 'nope', {}), { error: "fpga: no interface 'nope'" });
  assert.deepEqual(addInterface(s, 'fpga', { kind: 'can' }), { error: "fpga.can1: no interface kind 'can': uart, gpio, spi, i2c, mqtt" });
  assert.deepEqual(addInterface(s, 'fpga', { kind: 'gpio', name: 'g', dir: 'both' }), { error: "fpga.g: a GPIO's direction is in or out, not 'both'" });
  assert.deepEqual(addInterface(s, 'fpga', { name: 'Serial' }), { error: "fpga: an interface named 'Serial' is there already" });
  assert.deepEqual(addInterface(s, 'fpga', { name: 'a b' }), { error: "fpga: 'a b' is not an interface's name: a letter, then letters, digits and _" });
  assert.deepEqual(addInterface(s, 'mcu', { kind: 'uart' }), { error: "mcu: a microcontroller's UARTs are its board's (Serial)" });
  assert.deepEqual(addInterface(s, 'term', { kind: 'gpio' }), { error: 'term: a serial terminal has one UART, its own' });
  assert.deepEqual(removeInterface(s, 'mcu', 'Serial'), { error: "mcu.Serial: the board's UART stays (remove the node instead)" });
  assert.deepEqual(removeInterface(s, 'term', 'serial'), { error: "term.serial: the terminal's UART stays (remove the node instead)" });
  const r = ok(removeInterface(s, 'fpga', 'serial'));
  assert.deepEqual([r.system.nodes[0].interfaces, r.system.links], [[], []]);
});

test('#4700 links: of one kind, two nodes, each end free; their errors', () => {
  let s = built();
  s = ok(addInterface(s, 'fpga', { kind: 'gpio', name: 'leds', pins: ['led<0>'], dir: 'out' })).system;
  s = ok(addInterface(s, 'mcu', { kind: 'gpio', name: 'btn', pins: ['D2'], dir: 'in' })).system;
  const r = ok(addLink(s, { a: 'fpga.leds', b: 'mcu.btn' }));
  assert.deepEqual(r.system.links[1], { id: 'wires', kind: 'gpio', a: 'fpga.leds', b: 'mcu.btn' });
  assert.deepEqual(addLink(s, { a: 'term.serial', b: 'fpga.uart' }), { error: 'fpga.uart is linked already (serial): an interface joins one link' });
  assert.deepEqual(addLink(s, { a: 'term.serial', b: 'mcu.btn' }), { error: 'term.serial is a UART, mcu.btn is GPIO: a link joins two interfaces of one kind' });
  assert.deepEqual(addLink(s, { a: 'fpga.leds', b: 'fpga.leds' }), { error: 'a link joins two nodes: fpga.leds and fpga.leds are both of fpga' });
  assert.deepEqual(addLink(s, { a: 'term', b: 'fpga.leds' }), { error: "'term' is not a link's end: node.interface" });
  assert.deepEqual(addLink(s, { a: 'x.y', b: 'fpga.leds' }), { error: "no node 'x' in the System" });
  assert.deepEqual(addLink(s, { a: 'term.y', b: 'fpga.leds' }), { error: "term: no interface 'y'" });
  assert.deepEqual(addLink(s, { a: 'fpga.leds', b: 'mcu.btn', id: 'mcu' }), { error: "the id 'mcu' is used already" });
  assert.deepEqual(changeLink(s, 'serial', { a: 'x.y' }), { error: "serial: a link has no field 'a' to change (id; its ends: remove it and add another)" });
  assert.deepEqual(changeLink(s, 'nope', {}), { error: "no link 'nope' in the System" });
});

test('#4700 editSystem: each action as its edit; a missing node, interface or link and an unknown action said', () => {
  const s = built();
  assert.equal(EDIT_ACTIONS.length, 9);
  assert.deepEqual(editSystem(s, { action: 'add_node', fields: { kind: 'terminal' } }), addNode(s, { kind: 'terminal' }));
  assert.deepEqual(editSystem(s, { action: 'change_node', node: 'mcu', fields: { id: 'uno' } }), changeNode(s, 'mcu', { id: 'uno' }));
  assert.deepEqual(editSystem(s, { action: 'remove_node', node: 'mcu' }), removeNode(s, 'mcu'));
  assert.deepEqual(editSystem(s, { action: 'add_interface', node: 'fpga', fields: { kind: 'gpio' } }), addInterface(s, 'fpga', { kind: 'gpio' }));
  assert.deepEqual(editSystem(s, { action: 'change_interface', node: 'fpga', interface: 'uart', fields: { baud: 19200 } }), changeInterface(s, 'fpga', 'uart', { baud: 19200 }));
  assert.deepEqual(editSystem(s, { action: 'remove_interface', node: 'fpga', interface: 'uart' }), removeInterface(s, 'fpga', 'uart'));
  assert.deepEqual(editSystem(s, { action: 'add_link', fields: { a: 'term.serial', b: 'mcu.Serial' } }), addLink(s, { a: 'term.serial', b: 'mcu.Serial' }));
  assert.deepEqual(editSystem(s, { action: 'change_link', link: 'serial', fields: { id: 's' } }), changeLink(s, 'serial', { id: 's' }));
  assert.deepEqual(editSystem(s, { action: 'remove_link', link: 'serial' }), removeLink(s, 'serial'));
  assert.deepEqual(editSystem(s, { action: 'remove_node' }), { error: 'remove_node: which node? (node)' });
  assert.deepEqual(editSystem(s, { action: 'change_interface', node: 'fpga' }), { error: 'change_interface: which interface? (interface)' });
  assert.deepEqual(editSystem(s, { action: 'remove_link' }), { error: 'remove_link: which link? (link)' });
  assert.deepEqual(editSystem(s, { action: 'rotate' }), { error: `no action 'rotate': ${EDIT_ACTIONS.join(', ')}` });
});

test('#4700 a System described: its nodes, their interfaces, its links', () => {
  let s = built();
  s = ok(addInterface(s, 'mcu', { kind: 'gpio', name: 'btn', pins: ['D2'] })).system;
  assert.deepEqual(describeSystem(s), [
    'System uart_avr: 3 nodes, 1 link',
    'node fpga: FPGA, module uart on basys2-250, in VHDL',
    '  uart: UART 9600 baud 8N1, TX tx (A3), RX rx (J3)',
    'node mcu: Arduino Uno, firmware (none), in C',
    '  Serial: UART 9600 baud 8N1, TX D1, RX D0',
    '  btn: GPIO in, D2',
    'node term: Serial terminal',
    '  serial: UART 9600 baud 8N1',
    'link serial: UART mcu.Serial ↔ fpga.uart',
  ]);
  assert.deepEqual(describeSystem(newSystem('e')), ['System e: 0 nodes, 0 links']);
});

test('#5488 a node\'s base language: its kind\'s default when added, given or changed; refused when not its kind\'s; kept through a rename', () => {
  let s = newSystem('l');
  s = addNode(s, { kind: 'fpga', module: 'top', board: 'basys2' }).system;
  s = addNode(s, { kind: 'mcu', lang: 'micropython' }).system;
  assert.deepEqual(s.nodes.map(n => n.lang), ['vhdl', 'micropython']);
  assert.deepEqual(addNode(s, { kind: 'fpga', lang: 'c' }), { error: "'c' is not an FPGA node's base language: vhdl, verilog" });
  assert.deepEqual(addNode(s, { kind: 'circuit', lang: 'vhdl' }), { error: 'a circuit node has no base language' });
  s = changeNode(s, 'fpga', { lang: 'verilog', id: 'top' }).system;
  assert.deepEqual(s.nodes.map(n => [n.id, n.lang]), [['top', 'verilog'], ['mcu', 'micropython']]);
  assert.deepEqual(changeNode(s, 'mcu', { lang: 'verilog' }), { error: "mcu: 'verilog' is not a microcontroller node's base language: c, cpp, micropython" });
  const t = addNode(s, { kind: 'terminal' }).system;
  assert.deepEqual(changeNode(t, 'term', { lang: 'c' }), { error: "term: a Serial terminal node has no field 'lang' (id, x, y)" });
});

test('#5910 edit_system\'s add_node with the project\'s profile: a node kind it does not allow refused, the others added', () => {
  const s = newSystem('p');
  const why = k => `an Embedded / SoC project's System has no ${k} node (Embedded / SoC allows design, circuit, fpga, mcu: Design Properties' Project Kind changes it)`;
  for (const kind of ['terminal', 'broker']) assert.deepEqual(editSystem(s, { action: 'add_node', fields: { kind } }, { profile: 'embedded' }), { error: why(kind) });
  for (const kind of ['fpga', 'mcu']) assert.deepEqual(editSystem(s, { action: 'add_node', fields: { kind } }, { profile: 'embedded' }), addNode(s, { kind }));
  // (a System project: every kind, the broker too; no profile given: no rule, as before)
  for (const kind of ['terminal', 'broker', 'mcu']) assert.deepEqual(editSystem(s, { action: 'add_node', fields: { kind } }, { profile: 'system' }), addNode(s, { kind }));
  assert.deepEqual(editSystem(s, { action: 'add_node', fields: { kind: 'broker' } }), addNode(s, { kind: 'broker' }));
  // (the other actions: the profile not asked)
  const m = ok(addNode(s, { kind: 'terminal' })).system;
  assert.deepEqual(editSystem(m, { action: 'remove_node', node: 'term0' }, { profile: 'embedded' }), removeNode(m, 'term0'));
});
