// The local server runs the 7-series' back end (#3146): its status (the Basys 3's xc7a35t and the Nexys A7's xc7a100t
// have Project X-Ray's bit database, #3145; another part not), its steps, and every example (gates … micro80) on the
// Basys 3 and on the Nexys A7 from HDL to its .bit (server/open-flow.js, its own process server/open-flow-run.js: Yosys's
// synth_xilinx, nextpnr-himbaechel-xc7, the bitstream from nextpnr's FASM) with the XDC the board's pin assignment
// writes: no warning, every clock at the board's 100 MHz by nextpnr's estimate, its LUTs, registers and frequency
// reported and held to a table (#3147), the .bit read back as its part's; the build folder has no ISE file. The .bit
// checked against nextpnr's FASM with no Vivado (#3145, readback.js and roundtrip.js, apart from the generator): its frames
// the ones fasm2frames makes of the FASM, and read back into features no bit lost and none stray; its pins (pins.js) each
// port's IOB at its XDC pin, with its direction and IO standard, and no other. A pin the package does not have: Place &
// Route's failure, no bitstream. (The examples' tests: test/xc7-examples-lib.mjs, the Zybo Z7's in
// test/open-flow-zynq-server.test.js, #4681.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStatus, openSteps } from '../server/open-flow.js';
import { loadBitDbXc7 } from '../packages/silinx-fpga/src/node.js';
import { xc7BscanCells, xc7BscanTile } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { exampleProject, XC7_TARGETS } from './examples-lib.mjs';
import { run, xc7ExampleTests } from './xc7-examples-lib.mjs';

const BASYS3 = { family: 'artix7', part: 'xc7a35t', package: 'cpg236', speed: '-1' };
const NEXYSA7 = { family: 'artix7', part: 'xc7a100t', package: 'csg324', speed: '-1' };
// each board's part: its slices and their registers, its pins, its .bit's name and ID code, its frames (the part's, the
// tiles' fasm2frames writes), its clock (MHz)
const PARTS = {
  basys3: { part: 'xc7a35tcpg236-1', slices: 5200, regs: 41600, iobs: 106, bitPart: '7a35tcpg236', idcode: 0x362d093, frames: [5408, 4974], mhz: 100 },
  'nexys-a7': { part: 'xc7a100tcsg324-1', slices: 15850, regs: 126800, iobs: 210, bitPart: '7a100tcsg324', idcode: 0x3631093, frames: [9448, 9012], mhz: 100 },
};

test('openStatus: the xc7a35t (Basys 3) and the xc7a100t (Nexys A7) are available with their steps; another part has no bit database', () => {
  for (const [board, part] of [[BASYS3, 'xc7a35tcpg236-1'], [NEXYSA7, 'xc7a100tcsg324-1']]) {
    const st = openStatus(board);
    assert.deepEqual([st.available, st.part, st.device, st.graph, st.bitDb], [true, part, board.part, null, true]);
    assert.deepEqual(st.steps, ['synth', 'postsynth', 'translate', 'par', 'trce', 'postpar', 'bitgen']);   // (its simulation models, #4362)
    assert.equal(st.reason, `${part}: nextpnr-himbaechel (xilinx) and Project X-Ray's bit database (the 7-series, an experimental family, #3146)`);
  }
  // (another package of the xc7a100t: no bit database)
  const ftg = openStatus({ family: 'artix7', part: 'xc7a100t', package: 'ftg256', speed: '-1' });
  assert.equal(ftg.available, false);
  assert.equal(ftg.reason, 'no 7-series bit database for the xc7a100tftg256-1 yet (only xc7a100tcsg324-1, xc7a35tcpg236-1, xc7z010clg400-1, xc7z020clg400-1): use AMD Vivado for this device');
});

test('#4680 openStatus: the Zynq-7000\'s XC7Z010 and XC7Z020 (the Zybo Z7\'s) are the 7-series\'; its other parts AMD Vivado\'s alone', () => {
  for (const part of ['xc7z010', 'xc7z020']) {
    const st = openStatus({ family: 'zynq', part, package: 'clg400', speed: '-1' });
    assert.deepEqual([st.available, st.part, st.device, st.graph, st.bitDb], [true, `${part}clg400-1`, part, null, true]);
    assert.deepEqual(st.steps, ['synth', 'postsynth', 'translate', 'par', 'trce', 'postpar', 'bitgen']);
    assert.equal(st.reason, `${part}clg400-1: nextpnr-himbaechel (xilinx) and Project X-Ray's bit database (the 7-series, an experimental family, #3146)`);
  }
  // (the XC7Z020's other package: no bit database; the XC7Z030: no open flow of its family's)
  assert.equal(openStatus({ family: 'zynq', part: 'xc7z020', package: 'clg484', speed: '-1' }).reason, 'no 7-series bit database for the xc7z020clg484-1 yet (only xc7a100tcsg324-1, xc7a35tcpg236-1, xc7z010clg400-1, xc7z020clg400-1): use AMD Vivado for this device');
  const z30 = openStatus({ family: 'zynq', part: 'xc7z030', package: 'sbg485', speed: '-1' });
  assert.deepEqual([z30.available, z30.reason], [false, 'the Silinx toolchain has no back end for the XC7Z030 (Zynq-7000): AMD Vivado implements it (Synthesis Tool: Vivado, on the local server)']);
  assert.deepEqual(openSteps(undefined, { family: 'artix7' }), ['synth', 'translate', 'par', 'trce', 'bitgen']);
});

test('#4680 the BSCAN\'s tile of the part: its CFG_CENTER_MID in the bit database, nextpnr\'s X<grid x>Y<grid y>', () => {
  // (Project X-Ray's tile grid: the xc7a50t's CFG_CENTER_MID_X46Y32 at 46, 124; the xc7z010's CFG_CENTER_MID_X67Y32 at 67, 72;
  // the xc7z020's CFG_CENTER_MID_X123Y84 at 123, 72)
  assert.deepEqual(['xc7a35tcpg236-1', 'xc7a100tcsg324-1', 'xc7z010clg400-1', 'XC7Z020CLG400-1', ''].map(xc7BscanTile), ['X46Y124', 'X46Y124', 'X67Y72', 'X123Y72', 'X46Y124']);
  for (const [part, tile] of [['xc7z010clg400-1', 'X67Y72'], ['xc7z020clg400-1', 'X123Y72']]) {
    const db = loadBitDbXc7(part);
    assert.deepEqual(db.tiles().filter(n => db.tile(n).type === 'CFG_CENTER_MID'), [`CFG_CENTER_MID_${{ X67Y72: 'X67Y32', X123Y72: 'X123Y84' }[tile]}`], part);
    const text = JSON.stringify({ modules: { top: { cells: { b: { type: 'BSCANE2', parameters: { JTAG_CHAIN: '00000000000000000000000000000010' }, attributes: {} } } } } });
    const out = xc7BscanCells(text, part);
    assert.deepEqual([out.chains, JSON.parse(out.text).modules.top.cells.b.attributes.BEL], [[2], `${tile}/BSCAN_X0Y1.BSCAN`]);
  }
});

test('openSteps: the 7-series\' list (nextpnr maps in its Place & Route); the Spartan-3E\'s chain as it was', () => {
  const family = 'artix7';
  assert.deepEqual(openSteps(undefined, { family }), ['synth', 'translate', 'par', 'trce', 'bitgen']);
  assert.deepEqual(openSteps(['synth', 'translate', 'map', 'par'], { family }), ['synth', 'translate', 'par']);   // (Implement Design's chain)
  assert.deepEqual(openSteps(['trce'], { family }), ['synth', 'translate', 'par', 'trce']);
  assert.deepEqual(openSteps(['bitgen'], { family, synthUpToDate: true }), ['translate', 'par', 'bitgen']);
  // (its Post-Place & Route model, #4362: after Place & Route; no post-map one)
  assert.deepEqual(openSteps(['postpar'], { family }), ['synth', 'translate', 'par', 'postpar']);
  assert.throws(() => openSteps(['postmap'], { family }), /no step postmap/);
  assert.throws(() => openSteps(['prombit'], { family }), /no step prombit/);
  assert.ok(openSteps(['par'], { family: 'spartan3e' }).includes('map'));
});

// each example's LUTs, registers and frequency (MHz, nextpnr's estimate, router2) on each board (#3147), measured with
// @silinx/nextpnr-himbaechel-xc7 0.3.0 (#3875; stopwatch with the best of 3 seeds, its project's): a build may have up
// to 15 % more LUTs, its registers 10 % apart (an example's counters sized from its clock, #3710), its frequency 15 %
// lower (and 100 MHz, the boards' clock, at least). The LUTs nextpnr's (each 6LUT and 5LUT, the
// feed-throughs included); Vivado's on the same netlists in #3160. (blinky: 93, 134, 158.86 and 153.99 MHz with its
// debouncers' 22-bit counters, #3922; their 2 bits counting ticks since #4377)
const QUALITY = {
  basys3: { gates: [1, 0, null], breadboard: [4, 8, 241.02], traffic: [79, 60, 142.63], blinky: [79, 96, 167.7],
    pong: [252, 215, 102.07], stopwatch: [169, 207, 101.21], clock: [141, 164, 132.75], vga: [115, 58, 136.72],
    isqrt: [69, 87, 154.68], uart: [105, 142, 161.76], micro80: [157, 187, 115.37] },
  'nexys-a7': { gates: [1, 0, null], breadboard: [4, 8, 249.81], traffic: [81, 60, 142.61], blinky: [79, 96, 176.71],
    pong: [251, 215, 107.42], stopwatch: [170, 207, 100.84], clock: [141, 164, 133.9], vga: [115, 58, 131.8],
    isqrt: [69, 87, 157.93], uart: [107, 142, 156.27], micro80: [157, 187, 106.19] },
};

xc7ExampleTests(XC7_TARGETS, { parts: PARTS, quality: QUALITY });

test('the 7-series\' failure in the server: a pin the package does not have, Place & Route\'s error, no bitstream', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-'));
  try {
    const { dir, project } = exampleProject('gates', { board: 'basys3' }, tmp);
    const xdc = path.join(dir, project.constraints);
    fs.writeFileSync(xdc, fs.readFileSync(xdc, 'utf8').replace(/PACKAGE_PIN \w+/, 'PACKAGE_PIN ZZ99'));
    const { lines, result, error } = await run(dir, project);
    assert.equal(result, undefined);
    assert.match(error.message, /Silinx toolchain failed in step 'par'/);
    assert.ok(lines.some(l => /^ERROR:Silinx - nextpnr failed/.test(l)), lines.join('\n'));
    assert.equal(fs.existsSync(path.join(dir, `build/${project.top}.bit`)), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
