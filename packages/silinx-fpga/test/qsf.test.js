// The Intel (Altera) families' constraints, QSF (#5376, src/qsf.js): read as Quartus reads a Terasic golden top's
// assignments, written with the ports the design keeps only, their I/O standards the board's; the clocks' SDC; the
// families of the part names and their experimental state (src/family.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QSF, readQsf, writeQsf, writeSdc } from '../src/qsf.js';
import { boardConstraintsText, constraintsExtOf, constraintsFormatOf, experimentalDevice, familyOfPart, noFlowMessage, openFlowDevice } from '../src/parts.js';

// lines as Terasic's DE10-Lite golden top writes them (DE10_LITE_Golden_Top.qsf, the System CD): the reader's reference
const TERASIC = `#============================================================
# CLOCK
#============================================================
set_location_assignment PIN_P11 -to MAX10_CLK1_50
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to MAX10_CLK1_50

#============================================================
# LED
#============================================================
set_location_assignment PIN_A8 -to LEDR[0]
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to LEDR[0]
set_location_assignment PIN_B8 -to KEY[0]
set_instance_assignment -name IO_STANDARD "3.3 V SCHMITT TRIGGER" -to KEY[0]
set_global_assignment -name FAMILY "MAX 10"
set_global_assignment -name DEVICE 10M50DAF484C7G
`;

test('QSF.read: a Terasic golden top\'s lines, their pins and standards; the global assignments kept as they are', () => {
  const m = readQsf(TERASIC);
  assert.deepEqual(m.assignments, {
    MAX10_CLK1_50: { loc: 'PIN_P11', iostandard: '3.3-V LVTTL' },
    'LEDR<0>': { loc: 'PIN_A8', iostandard: '3.3-V LVTTL' },
    'KEY<0>': { loc: 'PIN_B8', iostandard: '3.3 V SCHMITT TRIGGER' },
  });
  assert.deepEqual(m.other, ['set_global_assignment -name FAMILY "MAX 10"', 'set_global_assignment -name DEVICE 10M50DAF484C7G']);
  assert.deepEqual(m.clocks, []);
  assert.deepEqual(m.netStatements.map(s => [s.net, s.line]), [['MAX10_CLK1_50', 4], ['MAX10_CLK1_50', 5], ['LEDR<0>', 10], ['LEDR<0>', 11], ['KEY<0>', 12], ['KEY<0>', 13]]);
  assert.equal(QSF.id, 'qsf');
});

test('QSF.read: quoted and braced names, a pin in lower case, the weak pull-up, a clock comment with its waveform', () => {
  const m = readQsf([
    'set_location_assignment pin_aa12 -to "SW[1]"',
    'set_instance_assignment -to {SW[1]} -name IO_STANDARD "2.5 V"',
    'set_instance_assignment -name WEAK_PULL_UP_RESISTOR ON -to KEY[1]',
    'set_instance_assignment -name WEAK_PULL_UP_RESISTOR OFF -to KEY[2]',
    '# create_clock -name {clk} -period 20.000 [get_ports {CLOCK_50}]',
    '# create_clock -period 10 -waveform {0.000 2.500} [get_ports clk2]',
    '# an ordinary comment',
  ].join('\n'));
  assert.deepEqual(m.assignments, { 'SW<1>': { loc: 'PIN_AA12', iostandard: '2.5 V' }, 'KEY<1>': { pull: 'up' }, 'KEY<2>': {} });
  assert.deepEqual(m.clocks, [{ net: 'CLOCK_50', period: 20, duty: 50, name: 'clk' }, { net: 'clk2', period: 10, duty: 25 }]);
});

test('QSF.read: what is not a port\'s pin or standard kept as it is (a bus\'s wildcard, -from, another assignment)', () => {
  const lines = ['set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to LEDR[*]', 'set_instance_assignment -name CURRENT_STRENGTH_NEW 8MA -to LEDR[0]',
    'set_instance_assignment -name FAST_OUTPUT_REGISTER ON -from a -to b', 'set_location_assignment PIN_A1 -to x -entity top', 'set_global_assignment -name SDC_FILE top.sdc'];
  const m = readQsf(lines.join('\n'));
  assert.deepEqual(m.assignments, {});
  assert.deepEqual(m.other, lines);
});

test('QSF.read: the errors where Quartus stops, with their line', () => {
  assert.throws(() => readQsf('\nset_location_assignment PIN_A8'), /^Error: line 2: set_location_assignment needs a pin and -to <port>$/);
  assert.throws(() => readQsf('set_location_assignment A8 -to x'), /^Error: line 1: set_location_assignment A8: a pin is PIN_<ball> \(PIN_A8, PIN_AA12\)$/);
  assert.throws(() => readQsf('set_instance_assignment -name IO_STANDARD -to x'), /^Error: line 1: set_instance_assignment needs -name <assignment>, its value and -to <port>$/);
  assert.throws(() => readQsf('set_instance_assignment -name WEAK_PULL_UP_RESISTOR yes -to x'), /^Error: line 1: WEAK_PULL_UP_RESISTOR yes: ON or OFF$/);
  assert.throws(() => readQsf('set_instance_assignment -name IO_STANDARD "3.3-V LVTTL -to x'), /^Error: line 1: no closing "$/);
  assert.throws(() => readQsf('# create_clock -period 0 [get_ports clk]'), /^Error: line 1: create_clock needs a period in ns$/);
});

// a board's pins (the DE10-Lite's, as core/boards-intel.js has them): their I/O standards, for a pin without its own
const BOARD = { name: 'DE10-Lite', resources: [
  { name: 'clk', pins: ['PIN_P11'], iostandard: '3.3-V LVTTL' },
  { name: 'led', pins: ['PIN_A8', 'PIN_A9'], iostandard: '3.3-V LVTTL' },
  { name: 'btn', pins: ['PIN_B8'], iostandard: '3.3 V Schmitt Trigger' },
] };

test('writeQsf: each port\'s pin, its I/O standard (its own or the board\'s), its pull-up; the clocks as comments; the rest kept', () => {
  const model = { assignments: { clk: { loc: 'PIN_P11' }, 'led<0>': { loc: 'pin_a8', iostandard: '2.5 V' }, btn: { loc: 'PIN_B8', pull: 'up' }, free: { loc: 'PIN_C1' } },
    clocks: [{ net: 'clk', period: 20 }], other: ['set_global_assignment -name FOO bar'] };
  const { text, skipped } = writeQsf(model, { board: BOARD, header: 'QSF generated by Silinx\nfor top' });
  assert.equal(text, `# QSF generated by Silinx
# for top

set_location_assignment PIN_P11 -to clk
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk
set_location_assignment PIN_A8 -to led[0]
set_instance_assignment -name IO_STANDARD "2.5 V" -to led[0]
set_location_assignment PIN_B8 -to btn
set_instance_assignment -name IO_STANDARD "3.3 V Schmitt Trigger" -to btn
set_instance_assignment -name WEAK_PULL_UP_RESISTOR ON -to btn
set_location_assignment PIN_C1 -to free

# Timing constraints (Quartus reads them from the SDC Silinx writes)
# create_clock -name {clk} -period 20.000 [get_ports {clk}]

set_global_assignment -name FOO bar
`);
  assert.deepEqual(skipped, []);
  // read back: the same pins, standards and clock
  const back = readQsf(text);
  assert.deepEqual(back.assignments, { clk: { loc: 'PIN_P11', iostandard: '3.3-V LVTTL' }, 'led<0>': { loc: 'PIN_A8', iostandard: '2.5 V' },
    btn: { loc: 'PIN_B8', iostandard: '3.3 V Schmitt Trigger', pull: 'up' }, free: { loc: 'PIN_C1' } });
  assert.deepEqual(back.clocks, [{ net: 'clk', period: 20, duty: 50, name: 'clk' }]);
});

test('writeQsf: the ports the design keeps only, the others skipped in order; nothing: an empty text', () => {
  const model = { assignments: { clk: { loc: 'PIN_P11' }, 'led<0>': { loc: 'PIN_A8' }, 'led<1>': { loc: 'PIN_A9' }, gone: { loc: 'PIN_B8' } }, clocks: [{ net: 'clk', period: 20 }, { net: 'gone', period: 10 }] };
  const { text, skipped } = writeQsf(model, { ports: [{ name: 'clk', width: 1 }, { name: 'led', width: 1, msb: 0, lsb: 0 }] });
  assert.equal(text, 'set_location_assignment PIN_P11 -to clk\nset_location_assignment PIN_A8 -to led[0]\n\n# Timing constraints (Quartus reads them from the SDC Silinx writes)\n# create_clock -name {clk} -period 20.000 [get_ports {clk}]\n');
  assert.deepEqual(skipped, ['led<1>', 'gone']);
  assert.deepEqual(writeQsf({}), { text: '', skipped: [] });
  assert.equal(QSF.write({ assignments: { x: { loc: 'PIN_A1' } } }), 'set_location_assignment PIN_A1 -to x\n');
});

test('writeSdc: a create_clock per clock of a port kept (its duty cycle), the PLLs\' clocks and the uncertainty derived; none: \'\'', () => {
  const model = { clocks: [{ net: 'CLOCK_50', period: 20 }, { net: 'clk<1>', period: '100 MHz', duty: 25 }, { net: 'gone', period: 8 }] };
  assert.equal(writeSdc(model, { ports: [{ name: 'CLOCK_50' }, { name: 'clk', width: 2, msb: 1, lsb: 0 }], header: 'SDC generated by Silinx' }), `# SDC generated by Silinx

create_clock -name {CLOCK_50} -period 20.000 -waveform {0.000 10.000} [get_ports {CLOCK_50}]
create_clock -name {clk_1_} -period 10.000 -waveform {0.000 2.500} [get_ports {clk[1]}]
derive_pll_clocks
derive_clock_uncertainty
`);
  assert.equal(writeSdc({ clocks: [] }), '');
  assert.equal(writeSdc(model, { ports: [{ name: 'led' }] }), '');
  assert.equal(writeSdc(readQsf('# create_clock -name {sys} -period 37.037 [get_ports {clk}]')), 'create_clock -name {sys} -period 37.037 -waveform {0.000 18.518} [get_ports {clk}]\nderive_pll_clocks\nderive_clock_uncertainty\n');
});

test('the Intel families: their part names, an experimental family\'s QSF and no flow, the message saying what comes next', () => {
  const parts = { '10m50da': 'max10', '10m08sc': 'max10', ep4ce22: 'cyclone4e', ep4ce115: 'cyclone4e', '5ceba4': 'cyclone5', '5csema5': 'cyclone5', '5cseba6': 'cyclone5', '5cgxfc5': 'cyclone5' };
  for (const [part, family] of Object.entries(parts)) assert.equal(familyOfPart(part), family, part);
  for (const part of ['ep4cgx15', '10m50', '5c', 'ep3c16']) assert.equal(familyOfPart(part), null, part);
  const de0cv = { part: '5ceba4', package: 'f23', speed: 'c7' }, de10lite = { part: '10m50da', package: 'f484', speed: 'c7g' };
  assert.equal(constraintsFormatOf(de0cv), 'qsf');
  assert.equal(constraintsExtOf(de10lite), '.qsf');
  assert.equal(experimentalDevice(de0cv), true);
  assert.equal(openFlowDevice({ part: 'ep4ce22' }), true);   // (no openFlow: false; the experimental family's NO_FLOW decides)
  assert.equal(noFlowMessage(de0cv), 'the 5CEBA4 (Cyclone V, an experimental family) has no implementation flow yet: its boards and its QSF constraints only (the Silinx toolchain\'s flow and Quartus Prime come next)');
  assert.equal(noFlowMessage(de10lite), 'the 10M50DA (MAX 10, an experimental family) has no implementation flow yet: its boards and its QSF constraints only (Quartus Prime comes next)');
  assert.equal(noFlowMessage({ part: 'ep4ce22' }), 'the EP4CE22 (Cyclone IV E, an experimental family) has no implementation flow yet: its boards and its QSF constraints only (Quartus Prime comes next)');
  // (the 7-series' message as it was)
  assert.equal(noFlowMessage({ part: 'xc7s50' }), 'the XC7S50 (Spartan-7, an experimental family) has no implementation flow yet: its boards and its XDC constraints only');
});

test('boardConstraintsText: an Intel device\'s constraints as a QSF, the header saying QSF, the board\'s I/O standards', () => {
  const text = boardConstraintsText({ device: { part: '10m50da', package: 'f484', speed: 'c7g' }, ports: [{ name: 'clk', width: 1 }, { name: 'led', width: 2, msb: 1, lsb: 0 }],
    assignments: { clk: { loc: 'PIN_P11' }, 'led<0>': { loc: 'PIN_A8' }, 'led<1>': { loc: 'PIN_A9' } }, clocks: [{ net: 'clk', period: 20 }], header: 'UCF generated by Silinx', board: BOARD });
  assert.equal(text, `# QSF generated by Silinx

set_location_assignment PIN_P11 -to clk
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk
set_location_assignment PIN_A8 -to led[0]
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to led[0]
set_location_assignment PIN_A9 -to led[1]
set_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to led[1]

# Timing constraints (Quartus reads them from the SDC Silinx writes)
# create_clock -name {clk} -period 20.000 [get_ports {clk}]
`);
});
