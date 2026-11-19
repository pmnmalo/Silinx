// The GateMate's back end (#2431): its constraints (CCF), its synthesis's resources, and a design from HDL to its bitstream
// through runFlow with YoWASP's nextpnr-himbaechel-gatemate and gmpack, on the CCGM1A1 and the CCGM1A2 (routed by router1, no
// CPE's CP lines: router2 passes WebAssembly's memory on it); the bitstream read back by gmunpack; a crash of nextpnr's placed
// and routed again with the next seed (a mock nextpnr's), each warned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlow, backendOf, familyOfPart, familyName, deviceFamily, constraintsFormatOf, constraintsExtOf, bitstreamExtOf, openOnlyDevice, CCF, GATEMATE_PARTS, nextpnrGatemateNode, gatemateIo, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { readConstraints } from '../packages/silinx-fpga/src/constraints.js';
import { gatemateUtilization, gatematePlaced, gatemateSdc, clockName, RETRIES } from '../packages/silinx-fpga/src/open-flow-gatemate.js';
import { orderSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { compareConfigs } from '../scripts/gatemate-measure.mjs';

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const PINS = '# the evaluation board\'s clock and two of its LEDs\nPin_in "clk" Loc = "IO_SB_A8" | SCHMITT_TRIGGER=true;\nNET "led[0]" Loc = "IO_EB_B1";   # D1\n'
  + 'Pin_out "led[1]"\n  Loc = "IO_EB_B2" | DRIVE=6 | SLEW=fast;\n# create_clock -period 100.000 [get_ports {clk}]\n';

test('CCF: NET, Pin_in, Pin_out, Pin_inout, their Loc and settings, and the clock\'s comment read into the constraints\' model; written back', () => {
  const m = readConstraints(CCF, PINS, 'blinky.ccf');
  assert.equal(m.format, 'ccf');
  assert.equal(m.name, 'blinky.ccf');
  assert.deepEqual(m.assignments, { clk: { loc: 'IO_SB_A8', ccf: { SCHMITT_TRIGGER: 'true' } }, 'led[0]': { loc: 'IO_EB_B1' }, 'led[1]': { loc: 'IO_EB_B2', drive: '6', slew: 'fast' } });
  assert.deepEqual(m.netStatements.map(s => [s.net, s.line]), [['clk', 2], ['led[0]', 3], ['led[1]', 4]]);
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 100 }]);
  assert.deepEqual(m.other, []);
  assert.equal(CCF.write(m), 'NET "clk" Loc = "IO_SB_A8" | SCHMITT_TRIGGER=true;\nNET "led[0]" Loc = "IO_EB_B1";\nNET "led[1]" Loc = "IO_EB_B2" | DRIVE=6 | SLEW=fast;\n'
    + '# create_clock -period 100.000 [get_ports {clk}]\n');
  // (written, read again: the same model)
  const again = readConstraints(CCF, CCF.write(m));
  assert.deepEqual([again.assignments, again.clocks], [m.assignments, m.clocks]);
  // the pulls (=true; false none), the keywords in any case, the last Loc of a port wins; nothing to write
  assert.deepEqual(CCF.read('net "a" loc = "IO_NA_A0" | pullup=true;\nPIN_IN "b" | PULLDOWN=true | KEEPER=false;\nNET "a" Loc = "IO_NA_A1";\nnet "c" | Loc = "IO_NA_B0";\n').assignments,
    { a: { loc: 'IO_NA_A1', pull: 'up' }, b: { pull: 'down' }, c: { loc: 'IO_NA_B0' } });
  assert.equal(CCF.write({ assignments: { a: { pull: 'keeper' }, b: {} } }), 'NET "a" | KEEPER=true;\n');
  assert.equal(CCF.write({ assignments: {} }), '');
  assert.equal(readConstraints(CCF, ''), null);
});

test('CCF: what nextpnr-himbaechel-gatemate would not apply throws, naming its line', () => {
  assert.throws(() => CCF.read('NET "a" Loc = "IO_NA_A0";\nLOCATE COMP "a";\n'), /^Error: line 2: LOCATE: not a CCF statement nextpnr-himbaechel-gatemate applies \(NET, Pin_in, Pin_out, Pin_inout\)/);
  assert.throws(() => CCF.read('NET "a" Loc = "IO_NA_A0"'), /line 1: NET: no ';' at its end/);
  assert.throws(() => CCF.read('\nNET a Loc = "IO_NA_A0";'), /line 2: NET: not a CCF statement/);
  assert.throws(() => CCF.read('NET "a" Site = "IO_NA_A0";'), /line 1: NET "a": Loc = "<pin>" expected, not Site = "IO_NA_A0"/);
  assert.throws(() => CCF.read('NET "a" Loc = "IO_NA_A0" | DRIVE;'), /line 1: NET "a": DRIVE is not KEY=VALUE/);
  assert.throws(() => CCF.read('# create_clock -period 0 [get_ports {clk}]'), /line 1: create_clock needs a period in ns/);
  assert.throws(() => CCF.read('"a";'), /^Error: line 1: "a";?: not a CCF statement/);
});

test('CCF: in linear time on a long line (CodeQL js/polynomial-redos)', () => {
  const t0 = performance.now();
  assert.deepEqual(CCF.read(`${'#'.repeat(100000)} `).assignments, {});
  assert.ok(performance.now() - t0 < 500, `${Math.round(performance.now() - t0)} ms`);
});

test('CCF: a clock\'s comment in linear time, its blanks and \';\' around (CodeQL js/polynomial-redos, #4587)', () => {
  // (the blanks either side of an optional ';' were quadratic: 100000 of them some 3 s)
  const blanks = ' '.repeat(100000);
  const t0 = performance.now();
  for (const text of [`# create_clock -period 1 [get_ports a]${blanks}x`, `# create_clock -period 1 [get_ports a]${blanks};${blanks}x`]) {
    const m = CCF.read(text);
    assert.deepEqual([m.clocks, m.assignments], [[], {}], 'not a clock: a comment');
  }
  assert.ok(performance.now() - t0 < 500, `${Math.round(performance.now() - t0)} ms`);
  // (the clock with its ';' and blanks around, as before)
  for (const tail of ['', ';', ' ;', '; ', ` ${blanks};${blanks}`]) assert.deepEqual(CCF.read(`  # create_clock -period 8 [get_ports {fast}]${tail}`).clocks, [{ net: 'fast', period: 8 }], JSON.stringify(tail.slice(0, 3)));
  assert.deepEqual(CCF.read('# create_clock -period 8 [get_ports {fast}];;').clocks, [], 'two \';\': a comment');
});

test('the GateMate family: its parts, its formats, its back end\'s steps and constraints, its synthesis\'s resources, its clocks', () => {
  for (const p of ['ccgm1a1', 'CCGM1A2', 'ccgm1a4']) assert.equal(familyOfPart(p), 'gatemate', p);
  assert.equal(familyOfPart('ccgm1'), null);
  const d = { part: 'ccgm1a1' };
  assert.equal(deviceFamily(d), 'gatemate');
  assert.equal(familyName('gatemate'), 'GateMate');
  assert.deepEqual([openOnlyDevice(d), constraintsFormatOf(d), constraintsExtOf(d), bitstreamExtOf(d)], [true, 'ccf', '.ccf', '.bit']);
  assert.deepEqual(GATEMATE_PARTS, { ccgm1a1: { device: 'CCGM1A1', router: null, vopts: [] }, ccgm1a2: { device: 'CCGM1A2', router: 'router1', vopts: ['no-cpe-cp'] } });
  const b = backendOf('gatemate');
  assert.equal(b.id, 'gatemate');
  assert.equal(b.constraints, CCF);
  // (the Post-Synthesis model, #2299: Yosys's netlist of the CC_ cells, gatemate-prims.js; no Post-Place & Route one)
  assert.deepEqual(b.steps.map(s => [s.id, s.label]), [['synth', 'Synthesize - Yosys'], ['postsynth', 'Generate Post-Synthesis Simulation Model'], ['translate', 'Translate'], ['par', 'Place & Route - nextpnr'],
    ['trce', 'Generate Post-Place & Route Static Timing'], ['bitgen', 'Generate Programming File - gmpack']]);
  assert.deepEqual(orderSteps(b.steps, ['bitgen']), ['synth', 'translate', 'par', 'bitgen']);
  assert.throws(() => orderSteps(b.steps, ['postpar']), /no step postpar/);
  assert.deepEqual(gatemateUtilization({ CC_LUT1: 1, CC_LUT2: 10, CC_L2T4: 20, CC_L2T5: 3, CC_DFF: 26, CC_DLT: 1, CC_ADDF: 12, CC_MX2: 2, CC_MX4: 1, CC_BRAM_20K: 1, CC_BRAM_40K: 1,
    CC_FIFO_40K: 1, CC_MULT: 2, CC_BUFG: 1, CC_PLL: 1, CC_IBUF: 2, CC_OBUF: 3, CC_IOBUF: 1, CC_TOBUF: 1, CC_USR_RSTN: 1 }),
  { luts: 34, flipFlops: 26, latches: 1, ios: 7, carry: 12, muxes: 3, blockRam: 3, multipliers: 2, clockBuffers: 1, dcms: 1, cells: 91 });
  assert.equal(b.synthName('luts'), 'Number of LUTs');
  // (nextpnr's report: the resources a design takes, not the CPEs it uses as an I/O's or a RAM's port, nor the I/O selects)
  assert.deepEqual(gatematePlaced({ utilization: { CPE_LT: { used: 34, available: 40960 }, CPE_FF: { used: 24, available: 40960 }, CPE_RAMIO: { used: 9, available: 40960 },
    CPE_CPLINES: { used: 1, available: 20480 }, IOSEL: { used: 9, available: 162 }, GPIO: { used: 9, available: 162 }, CLKIN: { used: 1, available: 1 }, PLL: { used: 0, available: 4 } } }).map(([n]) => n),
  ['CPE_LT', 'CPE_FF', 'GPIO']);
  // (a clock by its port's name: nextpnr's names its input buffer's net, or a global buffer's)
  assert.deepEqual(['$iopadmap$clk', '$glbnet$clk', 'clk', '$iopadmap$clk$die1'].map(clockName), ['clk', 'clk', 'clk', 'clk']);
  assert.equal(gatemateSdc([{ net: 'clk', period: 100 }, { net: 'fast', period: 8 }]), 'create_clock -period 100.000000 [get_ports {clk}]\ncreate_clock -period 8.000000 [get_ports {fast}]\n');
  assert.equal(gatemateSdc([]), '');
});

const gatemate = nextpnrGatemateNode();
function memoryIo(ccf, extra = {}) {
  const log = [], files = {};
  return { log, files, io: { log: l => log.push(l), sources: () => [{ path: 'blinky.v', lang: 'verilog', text: BLINKY }], ucf: ccf, ucfName: ccf ? 'blinky.ccf' : null,
    yosys: yosysNode, nextpnr: { gatemate }, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {}, ...extra } };
}
const SPEC = { top: 'blinky', family: 'gatemate', device: 'ccgm1a1', pkg: 'fbga324', speed: '', steps: ['synth', 'translate', 'par', 'trce', 'bitgen'] };
const warnings = log => log.filter(l => /^WARNING/.test(l));
const text = v => (typeof v === 'string' ? v : new TextDecoder().decode(v));

test('a design from HDL to its bitstream on the CCGM1A1: synth_gatemate, nextpnr at the CCF\'s pins and clock, gmpack; read back by gmunpack', { timeout: 300000 }, async () => {
  const { log, files, io } = memoryIo(PINS);
  const r = await runFlow(SPEC, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), []);
  assert.deepEqual(log.filter(l => /^=== SILINX STEP/.test(l)), ['synth', 'translate', 'par', 'trce', 'bitgen'].map(s => `=== SILINX STEP ${s} ===`));
  assert.ok(log.includes('Netlist of <blinky> read; constraints: blinky.ccf, 3 pin location(s), 1 PERIOD constraint(s).'));
  assert.deepEqual(r.report.map.utilization.map(u => [u.name, u.total]), [['CPE_FF', 40960], ['CPE_LT', 40960], ['GLBOUT', 1], ['GPIO', 162]]);
  assert.deepEqual(r.report.map.utilization.find(u => u.name === 'GPIO').used, 3);
  // (the clock by its port's name, its constraint the CCF's: 10 MHz, through an SDC)
  assert.deepEqual(r.report.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 10]]);
  assert.ok(r.report.par.fmax[0].achieved > 10 && r.report.par.constraintsMet);
  assert.ok(log.some(l => /^Clock clk: [\d.]+ MHz \(met, 10 MHz asked\)$/.test(l)));
  assert.match(files['open/timing.txt'], /nextpnr-himbaechel-gatemate/);
  const bit = files['blinky.bit'];
  assert.equal(r.report.bit.size, bit.length);
  assert.match(log.find(l => /^Bitstream: /.test(l)), new RegExp(`^Bitstream: build/blinky\\.bit \\(${bit.length} bytes, gmpack in [\\d.]+ m?s\\)$`));
  // gmunpack: the configuration nextpnr wrote, setting by setting
  const { runGmunpack } = await import('@yowasp/nextpnr-himbaechel-gatemate');
  const back = (await runGmunpack(['design.bit', 'design.cfg'], { 'design.bit': bit }, { stdout: () => {}, stderr: () => {}, fetchProgress: () => {} }))['design.cfg'];
  const cmp = compareConfigs(files['open/routed.cfg'], text(back));
  assert.ok(cmp.settings > 100);
  assert.deepEqual([cmp.lost.filter(s => !/FF_INIT/.test(s)), cmp.added], [[], []]);
});

test('the GateMate without pins: each port warned, nextpnr places it, its clock with no constraint; a bitstream from an earlier run\'s routed design', { timeout: 300000 }, async () => {
  const { log, files, io } = memoryIo(null);
  const r = await runFlow({ ...SPEC, steps: ['synth', 'translate', 'par'] }, io);
  assert.ok(r.ok, r.error);
  // (nextpnr's own warnings of them left out: Silinx says them by the port's name)
  assert.deepEqual(warnings(log), ['clk', 'led[0]', 'led[1]'].map(p => `WARNING:Place - the port ${p} has no pin (Loc in the CCF): nextpnr places it anywhere.`));
  assert.ok(log.includes('Netlist of <blinky> read; constraints: none.'));
  assert.equal(files['blinky.bit'], undefined);
  assert.deepEqual(r.report.par.fmax.map(f => [f.clock, f.constraint]), [['clk', null]]);
  assert.ok(log.some(l => /^Clock clk: [\d.]+ MHz \(no constraint\)$/.test(l)));
  const next = memoryIo(null);
  Object.assign(next.files, files);
  const r2 = await runFlow({ ...SPEC, steps: ['bitgen'] }, next.io);
  assert.ok(r2.ok, r2.error);
  assert.ok(next.files['blinky.bit'].length > 1000);
});

test('the CCGM1A2: routed by router1 with no CPE\'s CP lines, its clock mirrored on both dies (nextpnr\'s warning left out)', { timeout: 600000 }, async () => {
  const runs = [];
  const spy = { run: (args, files, onLine) => { runs.push(args); return gatemate.run(args, files, onLine); }, pack: c => gatemate.pack(c) };
  const { log, files, io } = memoryIo(PINS, { nextpnr: { gatemate: spy } });
  const r = await runFlow({ ...SPEC, device: 'ccgm1a2' }, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), []);
  assert.deepEqual(runs.map(a => [a[a.indexOf('--device') + 1], a[a.indexOf('--router') + 1], a.slice(-2)]), [['CCGM1A2', 'router1', ['--vopt', 'no-cpe-cp']]]);
  assert.deepEqual(r.report.map.utilization.map(u => [u.name, u.total]), [['CPE_FF', 81920], ['CPE_LT', 81920], ['GLBOUT', 2], ['GPIO', 324]]);
  assert.deepEqual(r.report.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 10]]);
  assert.ok(files['blinky.bit'].length > 1000);
});

test('a crash of nextpnr\'s (a WebAssembly trap): placed and routed again with the next seed, each warned; an ERROR: line or the last retry fails', { timeout: 300000 }, async () => {
  const trap = () => Object.assign(new Error('memory access out of bounds'), { name: 'RuntimeError' });
  const mock = crashes => {
    const seeds = [];
    return { seeds, io: { run: (args, files, onLine) => { const seed = +args[args.indexOf('--seed') + 1]; seeds.push(seed); if (seeds.length <= crashes) throw trap(); return gatemate.run(args, files, onLine); }, pack: c => gatemate.pack(c) } };
  };
  const m = mock(2), { log, io } = memoryIo(PINS, { nextpnr: { gatemate: m.io } });
  const r = await runFlow({ ...SPEC, steps: ['synth', 'translate', 'par'] }, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(m.seeds, [1, 2, 3]);
  assert.deepEqual(warnings(log), [1, 2].map(s => `WARNING:Place - nextpnr-himbaechel-gatemate crashed with seed ${s} (memory access out of bounds): placed and routed again with seed ${s + 1}.`));
  // (crashing every time: the last retry's error)
  const all = mock(99), a = memoryIo(PINS, { nextpnr: { gatemate: all.io } });
  const r2 = await runFlow({ ...SPEC, steps: ['synth', 'translate', 'par'], seed: 5 }, a.io);
  assert.equal(r2.ok, false);
  assert.equal(all.seeds.length, RETRIES + 1);
  assert.deepEqual(all.seeds, [5, 6, 7, 8]);
  assert.match(r2.error, /^nextpnr-himbaechel-gatemate failed: memory access out of bounds/);
  // (an error nextpnr says: no retry)
  const said = { run: async (args, files, onLine) => { onLine('ERROR: IO \'x\' is unconstrained in CCF'); throw new Error('nextpnr exited with code 1'); }, pack: () => null };
  const b = memoryIo(PINS, { nextpnr: { gatemate: said } });
  const r3 = await runFlow({ ...SPEC, steps: ['synth', 'translate', 'par'] }, b.io);
  assert.equal(r3.ok, false);
  assert.deepEqual(warnings(b.log), []);
  assert.match(r3.error, /^nextpnr-himbaechel-gatemate failed: nextpnr exited with code 1/);
});

test('the GateMate\'s errors: a part nextpnr does not have, no nextpnr, no routed design, a CCF it cannot read; gmpack\'s failure', async () => {
  const fail = async (spec, io) => { const r = await runFlow({ ...SPEC, ...spec }, io); assert.equal(r.ok, false); return r.error; };
  assert.match(await fail({ device: 'ccgm1a4' }, memoryIo(PINS).io), /^ccgm1a4: not a GateMate part of nextpnr-himbaechel-gatemate \(CCGM1A1, CCGM1A2\)/);
  assert.match(await fail({}, memoryIo(PINS, { nextpnr: {} }).io), /nextpnr-himbaechel-gatemate is not in this installation \(io\.nextpnr\.gatemate\)/);
  assert.match(await fail({ steps: ['bitgen'] }, memoryIo(PINS).io), /no routed design: run Place & Route first/);
  assert.match(await fail({}, memoryIo('LOCATE COMP "clk";\n').io), /line 1: LOCATE: not a CCF statement/);
  // (gmpack on a configuration it cannot read)
  const io = gatemateIo(async () => import('@yowasp/nextpnr-himbaechel-gatemate'));
  await assert.rejects(io.pack('not a configuration\n'), /^Error: gmpack/);
});
