// The MachXO2's measurement (#2302, scripts/machxo2-measure.mjs): its parts (the family of a part, the size of a netlist's
// cells, nextpnr's warnings split, the ULX3S's clock constraint kept, clk's pin, the table), then through Yosys's
// synth_lattice, nextpnr-machxo2 and ecppack on the LCMXO2-1200HC: the examples gates (no clock) and blinky (its 25 MHz
// met), and the MachXO2's clocks (its oscillator OSCH, its PLL EHXPLLJ), each to its bitstream, read back the same, the
// ports nextpnr placed warned and no other warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { familyOf, cellCounts, synthSize, splitWarnings, clockLpf, deviceLpf, table, measureNetlist, exampleNetlist, DEVICES } from '../scripts/machxo2-measure.mjs';

test('the family of a part: xo2 for a MachXO2, xo3 for a MachXO3L/LF, none for another', () => {
  assert.equal(familyOf('LCMXO2-1200HC-4TG100C'), 'xo2');
  assert.equal(familyOf('lcmxo2-640uhc-4tg144c'), 'xo2');
  assert.equal(familyOf('LCMXO3LF-6900C-5BG256C'), 'xo3');
  assert.equal(familyOf('LCMXO3L-4300C-5BG400C'), 'xo3');
  assert.equal(familyOf('LFE5U-85F-6BG381C'), null);
  assert.deepEqual(DEVICES.map(familyOf), ['xo2', 'xo3']);
});

test('a netlist\'s cells counted by type, and its size: LUT4s, flip-flops, carries, RAM, the other cells by name', () => {
  const json = JSON.stringify({ modules: { top: { cells: { a: { type: 'LUT4' }, b: { type: 'LUT4' }, c: { type: 'TRELLIS_FF' }, d: { type: 'CCU2D' },
    e: { type: 'DP8KC' }, f: { type: 'TRELLIS_DPR16X4' }, g: { type: 'TRELLIS_IO' }, h: { type: 'OSCH' }, i: { type: 'PFUMX' } } }, other: { cells: { x: { type: 'LUT4' } } } } });
  const cells = cellCounts(json, 'top');
  assert.deepEqual(cells, { LUT4: 2, TRELLIS_FF: 1, CCU2D: 1, DP8KC: 1, TRELLIS_DPR16X4: 1, TRELLIS_IO: 1, OSCH: 1, PFUMX: 1 });
  assert.deepEqual(synthSize(cells), { luts: 2, ffs: 1, carry: 1, muxes: 1, dram: 1, bram: 1, mult: 0, other: ['OSCH'] });
  assert.deepEqual(cellCounts(json, 'none'), {});
});

test('nextpnr\'s warnings: the ports it placed itself apart, the others as they are, its other lines left out', () => {
  assert.deepEqual(splitWarnings([
    'Info: Packing IOs..',
    'Warning: IO \'sw[3]\' is unconstrained in LPF and will be automatically placed',
    'Warning: IO \'clk\' is unconstrained in LPF and will be automatically placed',
    'Warning: something else',
    'ERROR: not a warning',
  ]), { unpinned: ['sw[3]', 'clk'], other: ['something else'] });
  assert.deepEqual(splitWarnings([]), { unpinned: [], other: [] });
});

test('the ULX3S\'s LPF: its clock\'s FREQUENCY kept, its pins left', () => {
  assert.equal(clockLpf('LOCATE COMP "clk" SITE "G2";\nIOBUF PORT "clk" IO_TYPE=LVCMOS33;\nFREQUENCY PORT "clk" 25 MHZ;\r\n  frequency port "x" 10 MHZ;\n'),
    'FREQUENCY PORT "clk" 25 MHZ;\n  frequency port "x" 10 MHZ;');
  assert.equal(clockLpf('LOCATE COMP "a" SITE "B1";\n'), '');
});

test('the LPF given nextpnr: a clocked design\'s clk on a pin of the device\'s package, a design with no clock as it is', () => {
  const f = 'FREQUENCY PORT "clk" 25 MHZ;';
  assert.equal(deviceLpf(f, 'LCMXO2-1200HC-4TG100C'), `${f}\nLOCATE COMP "clk" SITE "27";`);
  assert.equal(deviceLpf(f, 'LCMXO3LF-6900C-5BG256C'), `${f}\nLOCATE COMP "clk" SITE "C8";`);
  assert.equal(deviceLpf(f, 'LCMXO2-1200HC-4SG32C'), f);   // (a package with no pin chosen)
  assert.equal(deviceLpf('', 'LCMXO2-1200HC-4TG100C'), '');
  assert.equal(deviceLpf('FREQUENCY PORT "clk_in" 12 MHZ;', 'LCMXO2-1200HC-4TG100C'), 'FREQUENCY PORT "clk_in" 12 MHZ;');
});

test('the table: one row per example, what failed and why, the warnings counted', () => {
  const ok = { name: 'blinky', synth: { ok: true, warnings: [], size: { luts: 127, ffs: 132, carry: 64, dram: 0, bram: 1 } },
    par: { ok: true, warnings: { unpinned: ['clk'], other: [] }, util: { TRELLIS_COMB: [285, 1280], TRELLIS_FF: [132, 1280], TRELLIS_IO: [27, 108] }, fmax: [{ clock: 'clk', achieved: 89.5, constraint: 25 }] },
    bit: { ok: true, size: 45060, warnings: [], roundTrip: true } };
  const bad = { name: 'micro80', synth: { ok: true, warnings: ['w1'], size: { luts: 1, ffs: 1, carry: 0, dram: 2, bram: 0 } },
    par: { ok: false, warnings: { unpinned: [], other: ['w2'] }, error: 'ERROR: too big' }, bit: { ok: false } };
  const unread = { ...ok, name: 'pong', bit: { ...ok.bit, roundTrip: false } };
  const lines = table([ok, bad, { name: 'x', error: 'synthesis failed', synth: {}, par: {}, bit: {} }, unread]).split('\n');
  assert.equal(lines.length, 6);
  assert.match(lines[5], /^\| pong \| .* \| 45060 bytes \(not read back the same\) \| none \|$/);
  assert.equal(lines[2], '| blinky | 127 / 132 / 64 / 1 EBR | 285/1280, 132/1280, 27/108 | 89.5 MHz | 45060 bytes | none |');
  assert.equal(lines[3], '| micro80 | 1 / 1 / 0 / 2 DPR16X4 | no: ERROR: too big | - | - | 2: Yosys: w1; nextpnr: w2 |');
  assert.match(lines[4], /^\| x \| no: synthesis failed \| - \| - \| - \| none \|$/);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-machxo2-test-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const DEVICE = 'LCMXO2-1200HC-4TG100C';
// a design's build on the LCMXO2-1200HC: synthesised, placed and routed, its bitstream (45060 bytes, the part's whole
// configuration) read back the same, no warning but the ports nextpnr placed itself
async function build(design, unpinned) {
  const r = await measureNetlist({ ...design, device: DEVICE });
  assert.ok(r.synth.ok && r.par.ok && r.bit.ok, JSON.stringify(r));
  assert.deepEqual(r.synth.warnings, []);
  assert.deepEqual(r.par.warnings.other, []);
  assert.equal(r.par.warnings.unpinned.length, unpinned);
  assert.deepEqual(r.bit.warnings, []);
  assert.equal(r.bit.size, 45060);
  assert.equal(r.bit.roundTrip, true);
  return r;
}

test('gates on the LCMXO2-1200HC: its 6 ports placed by nextpnr, no clock, no LPF (so nothing warned)', { timeout: 600000 }, async () => {
  const n = await exampleNetlist('gates', tmp);
  assert.equal(n.lpf, '');
  const r = await build(n, 0);
  assert.deepEqual(r.par.util.TRELLIS_IO, [6, 108]);
  assert.deepEqual(r.par.fmax, []);
});

test('blinky on the LCMXO2-1200HC: clk on its pin, the other 26 ports placed by nextpnr, the global clock (DCCA) at the board\'s 25 MHz met', { timeout: 600000 }, async () => {
  const n = await exampleNetlist('blinky', tmp);
  assert.equal(n.error, undefined);
  assert.equal(n.lpf, 'FREQUENCY PORT "clk" 25 MHZ;');
  const r = await build(n, 26);
  assert.deepEqual(r.synth.size, { luts: 114, ffs: 92, carry: 42, muxes: 0, dram: 0, bram: 0, mult: 0, other: [] });
  assert.deepEqual(r.par.util.TRELLIS_IO, [27, 108]);
  assert.deepEqual(r.par.util.DCCA, [1, 8]);
  assert.equal(r.par.fmax.length, 1);
  assert.equal(r.par.fmax[0].constraint, 25);
  assert.ok(r.par.fmax[0].achieved > 25, JSON.stringify(r.par.fmax));
});

const COUNTER = 'reg [27:0] c = 0; always @(posedge clk) c <= c + 1;';
test('the MachXO2\'s oscillator (OSCH): placed, its 12.09 MHz the clock nextpnr times', { timeout: 600000 }, async () => {
  const syn = `module top(output [7:0] led); wire clk; OSCH #(.NOM_FREQ("12.09")) u_osc(.STDBY(1'b0), .OSC(clk), .SEDSTDBY());
  ${COUNTER} assign led = c[27:20]; endmodule`;
  const r = await build({ syn, top: 'top' }, 0);   // (no LPF: nextpnr warns of no port)
  assert.deepEqual(r.synth.size.other, ['OSCH']);
  assert.deepEqual(r.par.util.OSCH, [1, 1]);
  assert.deepEqual(r.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 12.1]]);
});

test('the MachXO2\'s PLL (EHXPLLJ): the board\'s 25 MHz times 4, the 100 MHz nextpnr derives met', { timeout: 600000 }, async () => {
  const syn = `module top(input clk_in, output [7:0] led); wire clk, lock;
  EHXPLLJ #(.CLKI_DIV(1), .CLKFB_DIV(4), .CLKOP_DIV(8), .CLKOP_ENABLE("ENABLED"), .FEEDBK_PATH("CLKOP"), .CLKOP_CPHASE(7)) u_pll(
    .CLKI(clk_in), .CLKFB(clk), .CLKOP(clk), .LOCK(lock), .RST(1'b0), .STDBY(1'b0), .PHASESEL0(1'b0), .PHASESEL1(1'b0), .PHASEDIR(1'b0),
    .PHASESTEP(1'b0), .LOADREG(1'b0), .PLLWAKESYNC(1'b0), .ENCLKOP(1'b0), .ENCLKOS(1'b0), .ENCLKOS2(1'b0), .ENCLKOS3(1'b0));
  ${COUNTER} assign led = {lock, c[27:21]}; endmodule`;
  const r = await build({ syn, top: 'top', lpf: 'FREQUENCY PORT "clk_in" 25 MHZ;' }, 9);
  assert.deepEqual(r.synth.size.other, ['EHXPLLJ']);
  assert.deepEqual(r.par.util.EHXPLLJ, [1, 1]);
  assert.equal(r.par.fmax.length, 1);
  assert.equal(r.par.fmax[0].constraint, 100);
  assert.ok(r.par.fmax[0].achieved > 100, JSON.stringify(r.par.fmax));
});
