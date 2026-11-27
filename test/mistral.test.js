// The Cyclone V's back end of the Silinx toolchain (#5377): Yosys's synth_intel_alm -family cyclonev, nextpnr-mistral (a mock of
// @silinx/nextpnr-mistral's io here: the arguments and files it is given, the report, the .rbf it writes), the .rbf the project's
// bitstream; the parts of Mistral's e50f and sx120f, the others Quartus's; mistralIo's data from the package or from its files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlow, backendOf, deviceFamily, openFlowDevice, quartusDevice, noOpenFlowMessage, QSF, MISTRAL_PARTS, MISTRAL_STEPS, mistralIo, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { mistralUtilization, mistralPlaced, mistralSdc, mistralModel, clockName } from '../packages/silinx-fpga/src/open-flow-mistral.js';

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const PINS = 'set_location_assignment PIN_M9 -to clk\nset_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk\n'
  + 'set_location_assignment PIN_AA2 -to led[0]\nset_location_assignment PIN_AA1 -to led[1]\n# create_clock -name {clk} -period 20.000 [get_ports {clk}]\n';
const RBF = Uint8Array.from({ length: 70000 }, (_, i) => (i * 7) & 255);
const REPORT = { utilization: { MISTRAL_COMB: { used: 26, available: 36160 }, MISTRAL_FF: { used: 26, available: 72320 }, MISTRAL_IO: { used: 3, available: 224 }, MISTRAL_M10K: { used: 0, available: 308 } },
  // (the clock's net as nextpnr-mistral names it: out of the port's input buffer and its clock buffer)
  fmax: { 'clk_MISTRAL_IB_PAD_O_MISTRAL_CLKBUF_A_Q': { achieved: 312.5, constraint: 50 } }, critical_paths: [] };

/** A mock of io.nextpnr.cyclone5: what it was given; writes the report, the routed design and the .rbf. */
function mockNextpnr({ fail = null, warn = [] } = {}) {
  const calls = [];
  return {
    calls,
    data: async model => ({ [`${model.startsWith('5CE') ? 'e50f' : 'sx120f'}-r.bin`]: new Uint8Array([0xfd, 0x37]) }),
    run: async (args, files, onLine) => {
      calls.push({ args, files });
      for (const w of warn) onLine(`Warning: ${w}`);
      if (fail) { onLine(`ERROR: ${fail}`); throw new Error('nextpnr exited with code 1'); }
      return { 'report.json': JSON.stringify(REPORT), 'routed.json': '{"modules":{}}', 'design.rbf': RBF };
    },
  };
}
function memoryIo(qsf, np = mockNextpnr()) {
  const log = [], files = {};
  return { log, files, np, io: { log: l => log.push(l), sources: () => [{ path: 'blinky.v', lang: 'verilog', text: BLINKY }], ucf: qsf, ucfName: qsf ? 'blinky.qsf' : null,
    yosys: yosysNode, nextpnr: { cyclone5: np }, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {} } };
}
const SPEC = { top: 'blinky', family: 'cyclone5', device: '5ceba4', pkg: 'f23', speed: 'c7', steps: ['synth', 'translate', 'par', 'trce', 'bitgen'] };
const warnings = log => log.filter(l => /^WARNING/.test(l));

test('the Cyclone V\'s parts: Mistral\'s e50f and sx120f the Silinx toolchain\'s, the others Intel Quartus Prime\'s alone', () => {
  const on = part => ({ family: 'cyclone5', part });
  for (const p of ['5ceba2', '5ceba4', '5cefa4', '5csema5', '5cseba6', '5csxfc6', '5cstfd6']) assert.equal(openFlowDevice(on(p)), true, p);
  for (const p of ['5ceba5', '5ceba9', '5cgxfc7', '5csema4', '5cseba2']) assert.equal(openFlowDevice(on(p)), false, p);
  assert.ok(MISTRAL_PARTS.test('5ceba4') && quartusDevice(on('5ceba4')));
  // (the others: Quartus's, the message saying so; the MAX 10 and the Cyclone IV E never the Silinx toolchain's)
  assert.equal(noOpenFlowMessage(on('5cgxfc7')), 'the Silinx toolchain has no back end for the 5CGXFC7 (Cyclone V): Intel Quartus Prime implements it (Synthesis Tool: Quartus, on the local server)');
  assert.equal(noOpenFlowMessage({ family: 'kintex7', part: 'xc7k70t' }), 'the Silinx toolchain has no back end for the XC7K70T (Kintex-7): AMD Vivado implements it (Synthesis Tool: Vivado, on the local server)');
  for (const p of ['10m50da', 'ep4ce22', 'ep4ce115']) assert.equal(openFlowDevice({ part: p }), false, p);
  // the model nextpnr-mistral's --device names: the part, its package, its grade
  assert.deepEqual([['5ceba4', 'f23', 'c7'], ['5csema5', 'f31', 'c6'], ['5cseba6', 'u23', 'i7'], ['5cgxfc7', 'f23', 'c8']].map(([device, pkg, speed]) => mistralModel({ device, pkg, speed })),
    ['5CEBA4F23C7', '5CSEMA5F31C6', '5CSEBA6U23I7', null]);
});

test('the Cyclone V\'s back end: its steps, its constraints, its synthesis\'s resources, nextpnr\'s report read', () => {
  assert.equal(deviceFamily({ part: '5ceba4' }), 'cyclone5');
  const b = backendOf('cyclone5');
  assert.equal(b.id, 'cyclone5');
  assert.equal(b.constraints, QSF);
  assert.equal(b.steps, MISTRAL_STEPS);
  assert.deepEqual(b.steps.map(s => [s.id, s.label, s.needs]), [['synth', 'Synthesize - Yosys', []], ['translate', 'Translate', ['synth']], ['par', 'Place & Route - nextpnr', ['translate']],
    ['trce', 'Generate Post-Place & Route Static Timing', ['par']], ['bitgen', 'Generate Programming File - nextpnr-mistral', ['par']]]);
  assert.deepEqual(mistralUtilization({ MISTRAL_ALUT6: 3, MISTRAL_ALUT2: 2, MISTRAL_ALUT_ARITH: 4, MISTRAL_NOT: 1, MISTRAL_FF: 5, MISTRAL_MLAB: 1, MISTRAL_M10K: 2, MISTRAL_MUL27X27: 1,
    MISTRAL_IB: 2, MISTRAL_OB: 3, MISTRAL_IO: 1, MISTRAL_CLKBUF: 1, cyclonev_oscillator: 1 }),
  { luts: 10, flipFlops: 5, ios: 6, carry: 4, distributedRam: 1, blockRam: 2, multipliers: 1, clockBuffers: 1, cells: 27 });
  assert.deepEqual(['luts', 'ffs', 'iob', 'ramb16', 'mult18x18', 'bufgmux', 'dcm', 'other'].map(id => b.synthName(id, { report: 'Number of Slice LUTs' })),
    ['Number of ALUTs', 'Number of flip-flops', 'Number of IOs', 'Number of M10K blocks', 'Number of DSP blocks', 'Number of global clock buffers', 'Number of PLLs', 'Number of Slice LUTs']);
  assert.deepEqual(mistralPlaced(REPORT).map(([n]) => n), ['MISTRAL_COMB', 'MISTRAL_FF', 'MISTRAL_IO']);
  assert.deepEqual(['$iopadmap$clk', '$glbnet$clk', '$clkbuf$clk', 'clk', 'clk_MISTRAL_IB_PAD_O_MISTRAL_CLKBUF_A_Q', 'clk_MISTRAL_IB_PAD_O'].map(clockName),
    ['clk', 'clk', 'clk', 'clk', 'clk', 'clk']);
  assert.equal(mistralSdc([{ net: 'clk', period: 20 }]), 'create_clock -period 20.000000 [get_ports {clk}]\n');
  assert.equal(mistralSdc([]), '');
});

test('a design from HDL to its .rbf on the DE0-CV\'s 5CEBA4F23C7: synth_intel_alm, nextpnr-mistral at the QSF\'s pins and clock, the .rbf kept', { timeout: 300000 }, async () => {
  const { log, files, np, io } = memoryIo(PINS);
  const r = await runFlow(SPEC, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), []);
  assert.deepEqual(log.filter(l => /^=== SILINX STEP/.test(l)), ['synth', 'translate', 'par', 'trce', 'bitgen'].map(s => `=== SILINX STEP ${s} ===`));
  // (synth_intel_alm's cells: the counter's carry chain, its flip-flops)
  // (synth_intel_alm's cells: the counter's ALUTs, its carry chain, its flip-flops, the clock's buffer, the I/Os)
  assert.deepEqual(r.report.synthesis.utilization.map(u => [u.name, u.used]), [['Number of ALUTs', 25], ['Number of flip-flops', 26], ['Number of carry cells', 24],
    ['Number of global clock buffers', 1], ['Number of IOs', 3]]);
  // nextpnr-mistral: the model, the QSF (its pins by nextpnr's names), the SDC of its clock, the die's routing data
  assert.equal(np.calls.length, 1);
  const { args, files: given } = np.calls[0];
  assert.deepEqual(args, ['--device', '5CEBA4F23C7', '--json', 'netlist.json', '--rbf', 'design.rbf', '--write', 'routed.json', '--report', 'report.json', '--seed', '1', '--timing-allow-fail',
    '--qsf', 'design.qsf', '--sdc', 'design.sdc', '--freq', '50']);   // (the SDC's clock stays on the port's net: --freq its target)
  assert.deepEqual(Object.keys(given).sort(), ['design.qsf', 'design.sdc', 'e50f-r.bin', 'netlist.json']);
  assert.match(given['design.qsf'], /^set_location_assignment PIN_AA2 -to led\[0\]$/m);
  assert.match(given['design.qsf'], /^set_instance_assignment -name IO_STANDARD "3\.3-V LVTTL" -to clk$/m);
  assert.equal(given['design.sdc'], 'create_clock -period 20.000000 [get_ports {clk}]\n');
  assert.deepEqual(r.report.map.utilization.map(u => [u.name, u.used, u.total]), [['MISTRAL_COMB', 26, 36160], ['MISTRAL_FF', 26, 72320], ['MISTRAL_IO', 3, 224]]);
  assert.deepEqual(r.report.par.fmax, [{ clock: 'clk', achieved: 312.5, constraint: 50 }]);
  assert.ok(r.report.par.constraintsMet && log.includes('Clock clk: 312.5 MHz (met, 50 MHz asked)'));
  // the .rbf: nextpnr-mistral's, byte for byte, the project's bitstream
  assert.deepEqual(files['blinky.rbf'], RBF);
  assert.deepEqual(r.report.bit, { path: 'build/blinky.rbf', size: RBF.length });
  assert.ok(log.includes(`Bitstream: build/blinky.rbf (${RBF.length} bytes, nextpnr-mistral's)`));
});

test('Generate Programming File alone: the routed design\'s .rbf of an earlier Place & Route; none, an error', { timeout: 300000 }, async () => {
  const first = memoryIo(PINS);
  assert.ok((await runFlow({ ...SPEC, steps: ['synth', 'translate', 'par'] }, first.io)).ok);
  assert.equal(first.files['blinky.rbf'], undefined);
  const next = memoryIo(PINS);
  Object.assign(next.files, first.files);
  const r = await runFlow({ ...SPEC, steps: ['bitgen'] }, next.io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(next.files['blinky.rbf'], RBF);
  const none = await runFlow({ ...SPEC, steps: ['bitgen'] }, memoryIo(PINS).io);
  assert.equal(none.ok, false);
  assert.match(none.error, /no routed design: run Place & Route first/);
});

test('the Cyclone V\'s warnings and errors: a port with no pin, nextpnr\'s own warnings; a part out of Mistral\'s data, no nextpnr, nextpnr\'s error, no routing data', { timeout: 300000 }, async () => {
  // (led[1] with no pin; nextpnr's warning passed on)
  const a = memoryIo(PINS.replace('set_location_assignment PIN_AA1 -to led[1]\n', ''), mockNextpnr({ warn: ['unknown IO standard'] }));
  assert.ok((await runFlow(SPEC, a.io)).ok);
  assert.deepEqual(warnings(a.log), ['WARNING:Place - the port led[1] has no pin (set_location_assignment in the QSF): nextpnr places it anywhere.', 'WARNING:Place - unknown IO standard']);
  // (the DE1-SoC's model: the sx120f's data)
  const s = memoryIo(PINS);
  assert.ok((await runFlow({ ...SPEC, device: '5csema5', pkg: 'f31', speed: 'c6' }, s.io)).ok);
  assert.deepEqual([s.np.calls[0].args[1], Object.keys(s.np.calls[0].files).filter(f => f.endsWith('.bin'))], ['5CSEMA5F31C6', ['sx120f-r.bin']]);
  const fail = async (spec, io) => { const r = await runFlow({ ...SPEC, ...spec, steps: ['synth', 'translate', 'par'] }, io); assert.equal(r.ok, false); return r.error; };
  assert.match(await fail({ device: '5cgxfc7' }, memoryIo(PINS).io), /^5cgxfc7: not a Cyclone V part of nextpnr-mistral here/);
  const no = memoryIo(PINS);
  delete no.io.nextpnr.cyclone5;
  assert.match(await fail({}, no.io), /nextpnr-mistral is not in this installation \(io\.nextpnr\.cyclone5\)/);
  assert.match(await fail({}, memoryIo(PINS, mockNextpnr({ fail: 'IO pin \'clk\' not found' })).io), /^nextpnr-mistral failed: nextpnr exited with code 1/);
  const offline = mockNextpnr();
  offline.data = async () => { throw new Error('fetch failed'); };
  assert.match(await fail({}, memoryIo(PINS, offline).io), /^nextpnr-mistral's routing data of 5CEBA4F23C7 could not be loaded \(fetch failed\)/);
});

test('mistralIo: nextpnr run as the other packages\' (runNextpnrMistral), the die\'s data from the package or from its files', async () => {
  const pkg = { dieOf: m => (m === '5CEBA4F23C7' ? 'e50f' : 'sx120f'), data: async m => ({ [`${pkg.dieOf(m)}-r.bin`]: new Uint8Array([1]) }),
    runNextpnrMistral: async (args, files, { stdout }) => { stdout(new TextEncoder().encode('Info: placed\n')); return { 'design.rbf': new Uint8Array([2]) }; }, Exit: class extends Error {} };
  const lines = [];
  const io = mistralIo(async () => pkg);
  assert.deepEqual(await io.run(['--device', '5CEBA4F23C7'], {}, l => lines.push(l)), { 'design.rbf': new Uint8Array([2]) });
  assert.deepEqual(lines, ['Info: placed']);
  assert.deepEqual(await io.data('5CEBA4F23C7'), { 'e50f-r.bin': new Uint8Array([1]) });
  // (a package from its tarball: its data/ file read)
  const asked = [];
  const tar = mistralIo(async () => pkg, name => { asked.push(name); return name === 'data/sx120f-r.bin' ? new Uint8Array([3]) : null; });
  assert.deepEqual(await tar.data('5CSEMA5F31C6'), { 'sx120f-r.bin': new Uint8Array([3]) });
  await assert.rejects(tar.data('5CEBA4F23C7'), /^Error: data\/e50f-r\.bin is not in @silinx\/nextpnr-mistral$/);
  assert.deepEqual(asked, ['data/sx120f-r.bin', 'data/e50f-r.bin']);
});
