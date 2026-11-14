// The boards of Vivado ML Standard's other 7-series (#3895, core/boards-vivado.js): the Digilent Arty S7 (-50 and -25, a Spartan-7)
// and Zybo Z7 (-20 and -10, a Zynq-7000's PL), their pins from Digilent's master XDCs; every example's ports on a pin (its
// display, LEDs and switches the boards lack on their Pmods, #3709), the XDC Vivado reads back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import * as dev from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { EXAMPLES, VIVADO_TARGETS, example, exampleUcf, exampleProject } from './examples-lib.mjs';
import { XDC, experimentalDevice, vivadoDevice, openFlowDevice } from '../packages/silinx-fpga/src/parts.js';
import { compile, elaborate } from '../core/compile.js';
import { boardGenericValues } from '../core/board-generics.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-boards-vivado-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const board = id => BOARDS.find(b => b.id === id);
const pins = (b, name) => b.resources.find(r => r.name === name).pins;

test('the Arty S7 and the Zybo Z7: their variants\' devices in the database, AMD Vivado\'s alone, Digilent\'s XDCs their source', () => {
  assert.deepEqual(VIVADO_TARGETS, [{ board: 'arty-s7' }, { board: 'zybo-z7' }]);
  for (const [id, variants, xdcFile] of [['arty-s7', [['50', 'spartan7', 'xc7s50', 'csga324'], ['25', 'spartan7', 'xc7s25', 'csga324']], 'Arty-S7-50'],
    ['zybo-z7', [['20', 'zynq', 'xc7z020', 'clg400'], ['10', 'zynq', 'xc7z010', 'clg400']], 'Zybo-Z7']]) {
    const b = board(id);
    assert.deepEqual(b.variants.map(v => [v.id, v.device.family, v.device.part, v.device.package, v.device.speed, !!v.default]), variants.map(([v, f, p, k], i) => [v, f, p, k, '-1', i === 0]), id);
    assert.deepEqual(b.device, b.variants[0].device, id);
    for (const v of b.variants) {
      assert.deepEqual(dev.validateDevice(v.device), [], `${id} ${v.id}`);
      assert.deepEqual([experimentalDevice(v.device), vivadoDevice(v.device), openFlowDevice(v.device)], [true, true, false], `${id} ${v.id}`);
      assert.deepEqual(dev.resolveBoard(id, { variant: v.id }).device, v.device);
    }
    assert.equal(b.sourceUrl, `https://github.com/Digilent/digilent-xdc/blob/c8644a9fe31cc803789643124545d56b3bef4600/${xdcFile}-Master.xdc`);
    assert.deepEqual([b.programmer.preferred, b.programmer.tools.openFPGALoader.board], ['openFPGALoader', id === 'arty-s7' ? 'arty_s7_50' : 'zybo_z7_20']);
    // every pin once, of the 3.3 V banks, transcribed (verified), a CSGA324's / CLG400's ball
    const all = b.resources.flatMap(r => r.pins);
    assert.equal(new Set(all).size, all.length, `${id}: a pin twice`);
    for (const r of b.resources) {
      assert.deepEqual([r.verified, r.iostandard], [true, 'LVCMOS33'], `${id} ${r.name}`);
      assert.ok(r.pins.every(p => /^[A-Y]\d{1,2}$/.test(p)), `${id} ${r.name}`);
    }
  }
  // the configuration: the Arty S7's master XDC's (its quad-SPI flash at 50 MHz); none on a Zynq's PL
  assert.deepEqual(board('arty-s7').xdc.config, { CONFIG_VOLTAGE: '3.3', CFGBVS: 'VCCO', 'BITSTREAM.GENERAL.COMPRESS': 'TRUE', 'BITSTREAM.CONFIG.CONFIGRATE': '50', 'BITSTREAM.CONFIG.SPI_BUSWIDTH': '4', CONFIG_MODE: 'SPIx4' });
  assert.deepEqual(board('zybo-z7').xdc.config, {});
});

test('the boards\' resources against the master XDCs: the clock, the LEDs, switches and buttons, the UART, the Pmods', () => {
  const s7 = board('arty-s7'), z7 = board('zybo-z7');
  assert.deepEqual([pins(s7, 'clk'), s7.resources[0].extra.period, pins(z7, 'clk'), z7.resources[0].extra.period], [['F14'], '83.333 ns', ['K17'], '8 ns']);
  assert.deepEqual([pins(s7, 'led'), pins(s7, 'sw'), pins(s7, 'btn')], [['E18', 'F13', 'E13', 'H15'], ['H14', 'H18', 'G18'], ['G15', 'K16', 'J16', 'H13']]);
  assert.deepEqual([pins(s7, 'led0_rgb'), pins(s7, 'led1_rgb')], [['J15', 'G17', 'F15'], ['E15', 'F18', 'E14']]);
  assert.deepEqual([pins(s7, 'uart_rx'), pins(s7, 'uart_tx')], [['V12'], ['R12']]);
  assert.deepEqual([pins(s7, 'ja')[0], pins(s7, 'jb')[0], pins(s7, 'jc')[7], pins(s7, 'jd')[7]], ['L17', 'P17', 'V14', 'U11']);
  assert.deepEqual([pins(z7, 'led'), pins(z7, 'sw'), pins(z7, 'btn'), pins(z7, 'led6_rgb')], [['M14', 'M15', 'G14', 'D18'], ['G15', 'P15', 'W13', 'T16'], ['K18', 'P16', 'K19', 'Y16'], ['V16', 'F17', 'M17']]);
  assert.deepEqual([pins(z7, 'ja')[0], pins(z7, 'jc')[0], pins(z7, 'jd')[7], pins(z7, 'je')[7]], ['N15', 'V15', 'V18', 'Y17']);
  // (no Pmod JB on the Zybo Z7: the Z7-20's only; no UART in its PL: the PS's)
  assert.ok(!z7.resources.some(r => r.name === 'jb' || r.group === 'USB-UART'));
  assert.deepEqual(s7.resources.filter(r => r.group === 'Headers').map(r => r.name), ['ja', 'jb', 'jc', 'jd']);
  assert.deepEqual(z7.resources.filter(r => r.group === 'Headers').map(r => r.name), ['ja', 'jc', 'jd', 'je']);
  // the examples' generics (#3710): the board's clock, its buttons and switches active high, no display
  assert.deepEqual(boardGenericValues(dev.resolveBoard('arty-s7')), { CLK_HZ: 12_000_000, BTN_LOW: false, SW_LOW: false });
  assert.deepEqual(boardGenericValues(dev.resolveBoard('zybo-z7')), { CLK_HZ: 125_000_000, BTN_LOW: false, SW_LOW: false });
});

test('every example on the boards: each port a pin (the ones the board lacks on its Pmods), the XDC Vivado reads back', () => {
  for (const t of VIVADO_TARGETS) for (const name of EXAMPLES) {
    const ex = example(name);
    const ports = elaborate(compile(ex.design), ex.project.top).top.ports;
    const bits = ports.reduce((n, p) => n + (p.sig.t.w || 1), 0);
    const { text, unmatched } = exampleUcf(name, t);
    assert.deepEqual(unmatched, [], `${name} ${t.board}`);
    const m = XDC.read(text);
    assert.equal(Object.keys(m.assignments).length, bits, `${name} ${t.board}`);
    assert.ok(Object.values(m.assignments).every(a => a.loc && a.iostandard === 'LVCMOS33'), `${name} ${t.board}`);
    const locs = Object.values(m.assignments).map(a => a.loc);
    assert.equal(new Set(locs).size, locs.length, `${name} ${t.board}: a pin twice`);
    if (name !== 'gates') assert.deepEqual(m.clocks.map(c => [c.net, c.period]), [['clk', t.board === 'arty-s7' ? 83.333 : 8]], `${name} ${t.board}`);
    assert.deepEqual(m.config, t.board === 'arty-s7' ? board('arty-s7').xdc.config : {}, `${name} ${t.board}`);
  }
  // gates on the board's own switches and LEDs, no Pmod; blinky's switch 3, its LEDs 4..7 and its display on the Pmods (a pull-down on an input)
  const gates = XDC.read(exampleUcf('gates', { board: 'zybo-z7' }).text).assignments;
  assert.deepEqual(['sw<0>', 'sw<3>', 'led<0>', 'led<1>'].map(n => gates[n].loc), ['G15', 'T16', 'M14', 'M15']);
  const blinky = exampleUcf('blinky', { board: 'arty-s7' }).text;
  assert.ok(blinky.includes('set_property -dict { PACKAGE_PIN H15 IOSTANDARD LVCMOS33 } [get_ports {led[3]}]\n'
    + 'set_property -dict { PACKAGE_PIN L17 IOSTANDARD LVCMOS33 PULLTYPE PULLDOWN } [get_ports {sw[3]}]\n'
    + 'set_property -dict { PACKAGE_PIN L18 IOSTANDARD LVCMOS33 } [get_ports {led[4]}]\n'), blinky);
  assert.ok(blinky.includes('set_property -dict { PACKAGE_PIN P14 IOSTANDARD LVCMOS33 } [get_ports {dp}]\nset_property -dict { PACKAGE_PIN P15 IOSTANDARD LVCMOS33 } [get_ports {an[0]}]\n'), blinky);
  assert.ok(blinky.includes('create_clock -add -name clk -period 83.333 -waveform {0.000 41.666} [get_ports {clk}]\n'), blinky);
});

test('an example\'s project on the Zybo Z7-10: its device the variant\'s, its constraints an XDC with no configuration property', () => {
  const { dir, project } = exampleProject('blinky', { board: 'zybo-z7', variant: '10' }, tmp);
  assert.deepEqual([project.device, project.boardVariant, project.constraints], [{ family: 'zynq', part: 'xc7z010', package: 'clg400', speed: '-1' }, '10', 'constraints/top.xdc']);
  const text = fs.readFileSync(path.join(dir, project.constraints), 'utf8');
  assert.equal(text.split('\n')[0], '# XDC for top \'top\' on Digilent Zybo Z7 (xc7z010-1-clg400), generated by Silinx');
  assert.doesNotMatch(text, /CFGBVS|CONFIG_VOLTAGE|current_design/);
});
