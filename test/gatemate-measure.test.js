// The GateMate's measurement (#2431, scripts/gatemate-measure.mjs): its parts (the size of a netlist's cells, nextpnr's
// warnings split, the ULX3S's clock read, clk's pin, the table), then through Yosys's synth_gatemate,
// nextpnr-himbaechel-gatemate and gmpack on the CCGM1A1: the examples gates (no clock) and blinky (its 25 MHz met), each to
// its bitstream, read back by gmunpack the same, the ports nextpnr placed warned and no other warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cellCounts, synthSize, splitWarnings, clockMhz, deviceCcf, configSettings, compareConfigs, table, measureNetlist, exampleNetlist, DEVICES, CLOCK_PIN } from '../scripts/gatemate-measure.mjs';

test('the parts measured: the CCGM1A1 and CCGM1A2, clk on the A1 Evaluation Board\'s clock pin', () => {
  assert.deepEqual(DEVICES, ['CCGM1A1', 'CCGM1A2']);
  assert.equal(CLOCK_PIN, 'IO_SB_A8');
});

test('a netlist\'s cells counted by type, and its size: LUTs, multiplexers, flip-flops, adders, RAM, multipliers, the other cells by name', () => {
  const json = JSON.stringify({ modules: { top: { cells: { a: { type: 'CC_LUT2' }, b: { type: 'CC_L2T4' }, c: { type: 'CC_L2T5' }, d: { type: 'CC_DFF' },
    e: { type: 'CC_ADDF' }, f: { type: 'CC_BRAM_20K' }, g: { type: 'CC_IBUF' }, h: { type: 'CC_PLL' }, i: { type: 'CC_MX4' }, j: { type: 'CC_BUFG' },
    k: { type: 'CC_MULT' }, l: { type: 'CC_DLT' }, m: { type: 'CC_OBUF' }, n: { type: 'CC_USR_RSTN' } } }, other: { cells: { x: { type: 'CC_LUT2' } } } } });
  const cells = cellCounts(json, 'top');
  assert.deepEqual(cells, { CC_LUT2: 1, CC_L2T4: 1, CC_L2T5: 1, CC_DFF: 1, CC_ADDF: 1, CC_BRAM_20K: 1, CC_IBUF: 1, CC_PLL: 1, CC_MX4: 1, CC_BUFG: 1,
    CC_MULT: 1, CC_DLT: 1, CC_OBUF: 1, CC_USR_RSTN: 1 });
  assert.deepEqual(synthSize(cells), { luts: 3, muxes: 1, ffs: 2, carry: 1, bram: 1, mult: 1, other: ['CC_PLL', 'CC_USR_RSTN'] });
  assert.deepEqual(cellCounts(json, 'none'), {});
  assert.deepEqual(synthSize({}), { luts: 0, muxes: 0, ffs: 0, carry: 0, bram: 0, mult: 0, other: [] });
});

test('nextpnr\'s warnings: the ports it placed itself apart (Yosys\'s pad prefix taken off), the others as they are, its other lines left out', () => {
  assert.deepEqual(splitWarnings([
    'Info: Packing IOs..',
    'Warning: IO \'$iopadmap$top.q_7\' is unconstrained in CCF and will be automatically placed.',
    'Warning: IO \'sw[3]\' is unconstrained in CCF and will be automatically placed.',
    'Warning: Multi die clock placement strategy set to \'mirror\'.',
    'ERROR: not a warning',
  ]), { unpinned: ['q_7', 'sw[3]'], other: ['Multi die clock placement strategy set to \'mirror\'.'] });
  assert.deepEqual(splitWarnings([]), { unpinned: [], other: [] });
});

test('the ULX3S\'s LPF: clk\'s FREQUENCY in MHz, none for another port or no LPF', () => {
  assert.equal(clockMhz('LOCATE COMP "clk" SITE "G2";\nIOBUF PORT "clk" IO_TYPE=LVCMOS33;\nFREQUENCY PORT "clk" 25 MHZ;\r\n'), 25);
  assert.equal(clockMhz('  frequency port "clk" 12.5 MHz;'), 12.5);
  assert.equal(clockMhz('FREQUENCY PORT "clk_in" 12 MHZ;'), null);
  assert.equal(clockMhz('LOCATE COMP "a" SITE "B1";\n'), null);
  assert.equal(clockMhz(''), null);
  assert.equal(clockMhz(undefined), null);
});

test('the CCF given nextpnr: a clocked design\'s clk on the clock pin, nothing for a design with no clock', () => {
  assert.equal(deviceCcf(25), 'NET "clk" Loc = "IO_SB_A8";\n');
  assert.equal(deviceCcf(null), '');
});

test('a configuration\'s settings: by their section, the zero ones and the empty sections left out, spaces made one', () => {
  const config = '.device CCGM1A1\n\n.config 0 \nCLKIN.REF0 000\nGLBOUT.GLB0_EN 1\n.tile 0 2 39\nIM1.P09 000\n.tile 0 2 30\nCPE4.FF_INIT  10\r\nCPE4.C_O1 00\nCPE4.C_I4 1\n';
  assert.deepEqual(configSettings(config), ['.config 0|GLBOUT.GLB0_EN 1', '.tile 0 2 30|CPE4.C_I4 1', '.tile 0 2 30|CPE4.FF_INIT 10']);
  assert.deepEqual(configSettings(''), []);
});

test('nextpnr\'s configuration against the one read back: the same (an all-zero tile dropped), a setting lost, one added, a repeated one counted', () => {
  const written = '.tile 1 1 1\nA 1\nB 10\nB 10\n.tile 0 2 39\nIM1.P09 000\n';
  assert.deepEqual(compareConfigs(written, '.tile 1 1 1\nB 10\nA 1\nB 10\n'), { settings: 3, lost: [], added: [] });
  assert.deepEqual(compareConfigs(written, '.tile 1 1 1\nA 1\nB 10\nC 1\n'), { settings: 3, lost: ['.tile 1 1 1|B 10'], added: ['.tile 1 1 1|C 1'] });
});

test('the table: one row per example, what failed and why, the warnings counted, the run time', () => {
  const ok = { name: 'blinky', seconds: 7, synth: { ok: true, warnings: [], size: { luts: 120, muxes: 3, ffs: 92, carry: 40, bram: 1, mult: 0 } },
    par: { ok: true, warnings: { unpinned: ['q'], other: [] }, util: { CPE_LT: [200, 40960], CPE_FF: [92, 40960], GPIO: [27, 162], RAM_HALF: [1, 64] }, fmax: [{ clock: '$abc$1', achieved: 89.5, constraint: 25 }] },
    bit: { ok: true, size: 9000, warnings: [], readBack: { settings: 300, lost: [], added: [] }, sameBytes: true } };
  const bad = { name: 'micro80', synth: { ok: true, warnings: ['w1'], size: { luts: 1, muxes: 0, ffs: 1, carry: 0, bram: 0, mult: 0 } },
    par: { ok: false, warnings: { unpinned: [], other: ['w2'] }, error: 'crashed (a WebAssembly exception)' }, bit: { ok: false } };
  const unread = { ...ok, name: 'pong', bit: { ...ok.bit, readBack: { settings: 300, lost: ['.tile 0 2 30|CPE4.FF_INIT 10'], added: [] }, sameBytes: false } };
  const nobit = { ...ok, name: 'uart', bit: { ok: false, error: 'exit code 1' } };
  const lines = table([ok, bad, { name: 'x', error: 'synthesis failed', synth: {}, par: {}, bit: {} }, unread, nobit]).split('\n');
  assert.equal(lines.length, 7);
  assert.equal(lines[2], '| blinky | 120 / 3 / 92 / 40 / 1 / 0 | 200/40960, 92/40960; 27/162; 1/64 | 89.5 MHz | 9000 bytes | none | 7 s |');
  assert.equal(lines[3], '| micro80 | 1 / 0 / 1 / 0 / 0 / 0 | no: crashed (a WebAssembly exception) | - | - | 2: Yosys: w1; nextpnr: w2 | - |');
  assert.equal(lines[4], '| x | no: synthesis failed | - | - | - | none | - |');
  assert.equal(lines[5], '| pong | 120 / 3 / 92 / 40 / 1 / 0 | 200/40960, 92/40960; 27/162; 1/64 | 89.5 MHz | 9000 bytes (read back: 1 of 300 settings lost) | none | 7 s |');
  assert.equal(lines[6], '| uart | 120 / 3 / 92 / 40 / 1 / 0 | 200/40960, 92/40960; 27/162; 1/64 | 89.5 MHz | no: exit code 1 | none | 7 s |');
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-gatemate-test-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// a design's build on the CCGM1A1 (seed 1): synthesised, placed and routed, its bitstream read back by gmunpack with every
// setting nextpnr wrote and packed again the same bytes, no warning but the ports nextpnr placed itself
async function build(design, unpinned) {
  const r = await measureNetlist({ ...design, device: 'CCGM1A1' });
  assert.ok(r.synth.ok && r.par.ok && r.bit.ok, JSON.stringify(r));
  assert.deepEqual(r.synth.warnings, []);
  assert.deepEqual(r.par.warnings.other, []);
  assert.equal(r.par.warnings.unpinned.length, unpinned);
  assert.deepEqual(r.bit.warnings, []);
  assert.deepEqual([r.bit.readBack.lost, r.bit.readBack.added], [[], []]);
  assert.equal(r.bit.sameBytes, true);
  return r;
}

test('gates on the CCGM1A1: its 6 ports placed by nextpnr, no clock, no CCF', { timeout: 600000 }, async () => {
  const n = await exampleNetlist('gates', tmp);
  assert.equal(n.mhz, null);
  const r = await build(n, 6);
  assert.deepEqual(r.synth.size, { luts: 3, muxes: 1, ffs: 0, carry: 0, bram: 0, mult: 0, other: [] });
  assert.deepEqual([r.par.util.CPE_LT, r.par.util.GPIO], [[5, 40960], [6, 162]]);
  assert.deepEqual(r.par.fmax, []);
  assert.deepEqual([r.bit.size, r.bit.readBack.settings], [797, 80]);
});

test('blinky on the CCGM1A1: clk on the clock pin, the other 26 ports placed by nextpnr, the global clock (CC_BUFG) at the board\'s 25 MHz met', { timeout: 600000 }, async () => {
  const n = await exampleNetlist('blinky', tmp);
  assert.equal(n.error, undefined);
  assert.equal(n.mhz, 25);
  const r = await build(n, 26);
  assert.deepEqual(r.synth.size, { luts: 205, muxes: 53, ffs: 92, carry: 103, bram: 0, mult: 0, other: [] });
  assert.equal(r.synth.cells.CC_BUFG, 1);
  assert.deepEqual([r.par.util.CPE_LT, r.par.util.CPE_FF, r.par.util.GPIO, r.par.util.GLBOUT], [[298, 40960], [92, 40960], [27, 162], [1, 1]]);
  assert.equal(r.par.fmax.length, 1);
  assert.equal(r.par.fmax[0].constraint, 25);
  assert.ok(r.par.fmax[0].achieved > 25, JSON.stringify(r.par.fmax));
  assert.deepEqual([r.bit.size, r.bit.readBack.settings], [22122, 5193]);
});
