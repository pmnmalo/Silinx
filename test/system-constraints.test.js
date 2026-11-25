// A System's FPGA node's constraints file (#5581's part 2, core/system-constraints.js): its path (its `constraints`, else
// <id>/<module> in its board's format: UCF, a 7-series' XDC, an iCE40's PCF); its pins read from it; the System with its
// nodes' pins filled (a file missing: a warning, no pin; one that cannot be read: an error; a document of before keeps
// its own); a file made or changed with pins (a new one as Implement wrote a node's: its board's attributes, its clock's
// period; an old one's other lines kept); a System's pins moved into the files, each said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nodeConstraintsPath, nodePinsOf, withNodePins, constraintsPaths, pinsText, pinsToConstraints } from '../core/system-constraints.js';
import { readSystem } from '../core/system-doc.js';
import { nodeConstraints } from '../core/system-node.js';
import { ROOT } from './examples-lib.mjs';

const EX = path.join(ROOT, 'examples/uart-avr');
const SYS = readSystem(fs.readFileSync(path.join(EX, 'uart_avr.sys.json'), 'utf8')).system;
const UCF = fs.readFileSync(path.join(EX, 'fpga/uart.ucf'), 'utf8');
const FPGA = { id: 'f', kind: 'fpga', module: 'top', board: 'basys2', variant: '250', lang: 'vhdl', interfaces: [], x: 0, y: 0 };
const PORTS = [{ name: 'clk', dir: 'in', width: 1, msb: null }, { name: 'tx', dir: 'out', width: 1, msb: null }, { name: 'led', dir: 'out', width: 2, msb: 1, lsb: 0 }];

test('#5581 a node\'s constraints file: its own, else <id>/<module> in its board\'s format', () => {
  assert.equal(nodeConstraintsPath({ ...FPGA, constraints: 'f/pins.ucf' }), 'f/pins.ucf');
  assert.equal(nodeConstraintsPath(FPGA), 'f/top.ucf');
  assert.equal(nodeConstraintsPath({ ...FPGA, board: 'basys3', variant: undefined }), 'f/top.xdc');
  assert.equal(nodeConstraintsPath({ ...FPGA, board: 'icebreaker', variant: undefined }), 'f/top.pcf');
  assert.equal(nodeConstraintsPath({ ...FPGA, module: null }), 'f/f.ucf');
  assert.equal(nodeConstraintsPath({ ...FPGA, board: 'nope' }), 'f/top.ucf');
  assert.deepEqual(constraintsPaths(SYS), ['fpga/uart.ucf']);
});

test('#5581 the uart-avr example\'s FPGA node: its pins its file\'s, the ones its System document had', () => {
  const n = SYS.nodes.find(x => x.kind === 'fpga');
  assert.deepEqual([n.constraints, n.pins], ['fpga/uart.ucf', undefined]);
  const { pins } = nodePinsOf(n, UCF);
  assert.deepEqual(Object.keys(pins).length, 24);
  assert.deepEqual([pins.clk, pins.rx, pins.tx, pins['btn<0>'], pins['led<7>'], pins['an<3>']], ['B8', 'J3', 'A3', 'G12', 'G1', 'K14']);
  // (a 7-series' XDC, a bus's bit as its model writes it)
  const xdc = '# x\nset_property PACKAGE_PIN W5 [get_ports clk]\nset_property PACKAGE_PIN U16 [get_ports {led[0]}]\n';
  assert.deepEqual(nodePinsOf({ ...FPGA, board: 'basys3', variant: undefined }, xdc).pins, { clk: 'W5', 'led<0>': 'U16' });
});

test('#5581 the System with its nodes\' pins: from their files; a file missing a warning, one unreadable an error; a document of before keeps its own', () => {
  const r = withNodePins(SYS, { 'fpga/uart.ucf': UCF });
  assert.deepEqual(r.problems, []);
  assert.equal(r.system.nodes[1].pins.rx, 'J3');
  assert.equal(SYS.nodes[1].pins, undefined, 'the System given unchanged');
  assert.equal(r.system.nodes[0], SYS.nodes[0], 'a microcontroller as it is');
  const none = withNodePins(SYS, {});
  assert.deepEqual([none.system.nodes[1].pins, none.problems], [{}, [{ node: 'fpga', severity: 'warning', message: 'fpga: no constraints file fpga/uart.ucf yet: its module\'s ports are on no pin of its board (its I/O Pin Planning)' }]]);
  const bad = withNodePins({ ...SYS, nodes: [{ ...FPGA, board: 'basys3', variant: undefined, constraints: 'f/x.xdc' }] }, { 'f/x.xdc': 'set_property PACKAGE_PIN W5 [get_ports\n' });
  assert.equal(bad.problems.length, 1);
  assert.equal(bad.problems[0].severity, 'error');
  assert.match(bad.problems[0].message, /^f: its constraints file f\/x\.xdc cannot be read: /);
  const old = withNodePins({ ...SYS, nodes: [{ ...FPGA, pins: { clk: 'B8', tx: '' } }] }, {});
  assert.deepEqual([old.system.nodes[0].pins, old.problems], [{ clk: 'B8' }, []]);
  assert.deepEqual(withNodePins(null, {}), { system: null, problems: [] });
});

test('#5581 a constraints file made from pins as Implement wrote a node\'s; an old one\'s pins set and removed, its other lines kept', () => {
  const made = pinsText(FPGA, null, { clk: 'B8', tx: 'a3', 'led<0>': 'M5', 'led<1>': '' }, PORTS);
  assert.equal(made, nodeConstraints({ ...FPGA, pins: { clk: 'B8', tx: 'a3', 'led<0>': 'M5' } }, PORTS).text);
  assert.match(made, /^TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;$/m);
  assert.deepEqual(nodePinsOf(FPGA, made).pins, { clk: 'B8', tx: 'A3', 'led<0>': 'M5' });
  const changed = pinsText(FPGA, made, { tx: 'B4', 'led<0>': null, 'led<1>': 'm11' });
  assert.deepEqual(nodePinsOf(FPGA, changed).pins, { clk: 'B8', tx: 'B4', 'led<1>': 'M11' });
  assert.match(changed, /PERIOD "clk" 20 ns/, 'its clock kept');
  // (a 7-series': its own format)
  const x7 = { ...FPGA, board: 'basys3', variant: undefined };
  const xdc = pinsText(x7, null, { clk: 'W5' }, PORTS);
  assert.match(xdc, /^set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } \[get_ports {clk}\]$/m);
  assert.deepEqual(nodePinsOf(x7, pinsText(x7, xdc, { tx: 'U16' })).pins, { clk: 'W5', tx: 'U16' });
  assert.throws(() => pinsText({ ...FPGA, board: 'nope' }, null, {}), { message: 'f: no FPGA board \'nope\'' });
});

test('#5581 a System\'s pins moved into its nodes\' constraints files: written or set, each said; a node with no pin, or no board, as it is', () => {
  const sys = { ...SYS, nodes: [SYS.nodes[0], { ...FPGA, pins: { clk: 'B8', tx: 'A3' } }, { ...FPGA, id: 'g', constraints: 'g/own.ucf', pins: { tx: 'P4' } },
    { ...FPGA, id: 'h' }, { ...FPGA, id: 'k', board: 'nope', pins: { tx: 'A1' } }] };
  const r = pinsToConstraints(sys, { texts: { 'g/own.ucf': 'NET "clk" LOC = "B8" ;\n' }, portsOf: m => (m === 'top' ? PORTS : null) });
  assert.deepEqual(r.lines, ['f: its pins written to its constraints file f/top.ucf', 'g: its pins set in its constraints file g/own.ucf']);
  assert.deepEqual(r.writes.map(w => w.path), ['f/top.ucf', 'g/own.ucf']);
  assert.deepEqual(nodePinsOf(FPGA, r.writes[1].text).pins, { clk: 'B8', tx: 'P4' });
  assert.deepEqual(r.system.nodes.map(n => [n.id, n.constraints ?? null, n.pins ?? null]),
    [['uno', null, null], ['f', 'f/top.ucf', null], ['g', 'g/own.ucf', null], ['h', null, null], ['k', null, { tx: 'A1' }]]);
  const same = pinsToConstraints(SYS);   // (the example's: no pin in its document)
  assert.deepEqual([same.writes, same.lines, same.system.nodes], [[], [], SYS.nodes]);
});
