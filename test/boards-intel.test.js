// The Intel (Altera) FPGAs' boards (#5376, core/boards-intel.js): Terasic's DE10-Lite, DE0-CV, DE1-SoC, DE10-Nano, DE0-Nano and
// DE2-115, every pin checked against the tables of Terasic's user manuals (test/fixtures/terasic/<board>.json: each table's
// signal, number in the manual, I/O standard and pins, transcribed from the manual's PDF); their devices in the database, of
// experimental families; their constraints a QSF of the top's ports (and its clocks' SDC), Check Constraints with no warning.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import * as dev from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { INTEL_BOARDS } from '../core/boards-intel.js';
import { QSF, boardAutoAssign, boardConstraintsText, constraintsFormatOf, experimentalDevice, writeSdc } from '../packages/silinx-fpga/src/parts.js';
import { constraintsDiagnostics } from '../core/constraints-check.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-boards-intel-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'terasic');
const manual = id => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${id}.json`), 'utf8'));
const board = id => BOARDS.find(b => b.id === id);
const IDS = ['de10-lite', 'de0-cv', 'de1-soc', 'de10-nano', 'de0-nano', 'de2-115'];
// the manual's signal a resource is: the first of its label's names that is one of the manual's tables
const signalOf = (r, tables) => r.label.match(/[A-Z][A-Z0-9_]+/g)?.find(s => tables[s]) || null;
// Quartus's name of a manual's I/O standard: 3.3V, 3.3-V (the manuals' short forms) as Terasic's golden tops write them
const quartus = s => ({ '3.3V': '3.3-V LVTTL', '3.3-V': '3.3-V LVTTL', '2.5V': '2.5 V' }[String(s).split(' (')[0]] || String(s).split(' (')[0]);

test('the six boards: Terasic\'s, their devices in the database of the Intel families, experimental, their manuals the source', () => {
  const want = {
    'de10-lite': [{ family: 'max10', part: '10m50da', package: 'f484', speed: 'c7g' }, '10M50DAF484C7G'],
    'de0-cv': [{ family: 'cyclone5', part: '5ceba4', package: 'f23', speed: 'c7' }, '5CEBA4F23C7N'],
    'de1-soc': [{ family: 'cyclone5', part: '5csema5', package: 'f31', speed: 'c6' }, '5CSEMA5F31C6N'],
    'de10-nano': [{ family: 'cyclone5', part: '5cseba6', package: 'u23', speed: 'i7' }, '5CSEBA6U23I7'],
    'de0-nano': [{ family: 'cyclone4e', part: 'ep4ce22', package: 'f17', speed: 'c6' }, 'EP4CE22F17C6N'],
    'de2-115': [{ family: 'cyclone4e', part: 'ep4ce115', package: 'f29', speed: 'c7' }, 'EP4CE115F29C7N'],
  };
  assert.deepEqual(INTEL_BOARDS.map(b => b.id), IDS);
  for (const id of IDS) {
    const b = board(id), m = manual(id), [device, ordering] = want[id];
    assert.ok(b, id);
    assert.deepEqual(b.device, device, id);
    assert.deepEqual(dev.validateDevice(b.device), [], id);
    assert.equal(experimentalDevice(b.device), true, id);
    assert.equal(constraintsFormatOf(b.device), 'qsf', id);
    assert.equal(b.vendor, 'Terasic');
    // (the manual's ordering code: Quartus's device name and the RoHS suffix N)
    assert.equal(m.part.split(' ')[0], ordering, id);
    assert.ok(ordering.startsWith(`${device.part}${device.package}${device.speed}`.toUpperCase()), id);
    assert.equal(b.sourceUrl, m.manual.url, id);
    assert.ok(b.source.startsWith(m.manual.title), id);
    assert.deepEqual(dev.resolveBoard(id).device, b.device, id);
  }
});

test('every resource of the boards the manual\'s table of its signal: its pins in their order, each table used once', () => {
  for (const id of IDS) {
    const b = board(id), { tables } = manual(id), used = new Set();
    for (const r of b.resources) {
      const s = signalOf(r, tables);
      assert.ok(s, `${id} ${r.name}: no table of the manual`);
      assert.ok(!used.has(s), `${id} ${s} twice`);
      used.add(s);
      assert.deepEqual(r.pins, tables[s].pins, `${id} ${r.name} (${s}, ${tables[s].table})`);
      assert.equal(r.verified, true, `${id} ${r.name}`);
      assert.ok(r.pins.every(p => /^PIN_[A-Z]{1,2}\d{1,2}$/.test(p)), `${id} ${r.name}`);
    }
    assert.deepEqual([...used].sort(), Object.keys(tables).sort(), `${id}: a table of the manual with no resource`);
    const all = b.resources.flatMap(r => r.pins);
    assert.equal(new Set(all).size, all.length, `${id}: a pin twice`);
  }
});

test('the I/O standards: the manual\'s as Quartus names them; the DE2-115\'s the jumpers\' defaults (JP7 2.5 V, JP6 3.3 V)', () => {
  for (const id of IDS.filter(x => x !== 'de2-115')) {
    const { tables } = manual(id);
    // (the names' case as Quartus lists them: it reads them in any case)
    for (const r of board(id).resources) assert.equal(r.iostandard.toUpperCase(), quartus(tables[signalOf(r, tables)].iostandard).toUpperCase(), `${id} ${r.name}`);
  }
  // (the DE10-Lite's keys and Arduino reset: Schmitt-trigger inputs)
  assert.deepEqual(board('de10-lite').resources.filter(r => r.iostandard !== '3.3-V LVTTL').map(r => [r.name, r.iostandard]), [['btn', '3.3 V Schmitt Trigger'], ['arduino_reset_n', '3.3 V Schmitt Trigger']]);
  // the DE2-115: the manual says "Depending on JP6 / JP7" for these, the golden top's standards those of the jumpers' defaults
  const d = board('de2-115'), std = n => d.resources.find(r => r.name === n);
  assert.deepEqual(['sw', 'btn', 'led', 'ledg', 'hex0', 'hex1', 'hex2'].map(n => std(n).iostandard), Array(7).fill('2.5 V'));
  assert.deepEqual(['hex4', 'hex5', 'hex6', 'hex7', 'gpio', 'clk', 'vga_red', 'uart_tx'].map(n => std(n).iostandard), Array(8).fill('3.3-V LVTTL'));
  assert.equal(std('hex3').iostandard, '2.5 V');
  assert.deepEqual(Object.keys(std('hex3').pinIostandards), std('hex3').pins.slice(2));
  // the manual's UART_CTS / UART_RTS (its golden top swaps them)
  assert.deepEqual([std('uart_cts').pins, std('uart_rts').pins], [['PIN_G14'], ['PIN_J13']]);
});

test('the resources the examples and the Board Emulator know: the clock, the LEDs, switches and active-low keys, the displays', () => {
  const pins = (id, n) => board(id).resources.find(r => r.name === n)?.pins;
  const res = (id, n) => board(id).resources.find(r => r.name === n);
  assert.deepEqual(IDS.map(id => pins(id, 'clk')[0]), ['PIN_P11', 'PIN_M9', 'PIN_AF14', 'PIN_V11', 'PIN_R8', 'PIN_Y2']);
  assert.deepEqual(IDS.map(id => res(id, 'clk').extra.period), Array(6).fill('20 ns'));
  assert.deepEqual(IDS.map(id => [pins(id, 'led').length, pins(id, 'sw').length, pins(id, 'btn').length]), [[10, 10, 2], [10, 10, 4], [10, 10, 4], [8, 4, 2], [8, 4, 2], [18, 18, 4]]);
  for (const id of IDS) assert.equal(res(id, 'btn').extra.activeLow, true, id);
  // the displays: 6 (8 on the DE2-115), 7 segments each, the DE10-Lite's with its decimal point; none on the Nanos
  assert.deepEqual(IDS.map(id => board(id).resources.filter(r => r.group === '7-segment').map(r => r.pins.length)),
    [Array(6).fill(8), Array(6).fill(7), Array(6).fill(7), [], [], Array(8).fill(7)]);
  assert.ok(IDS.every(id => board(id).resources.filter(r => r.group === '7-segment').every(r => r.extra.activeLow)));
  // the VGA: 4 bits a colour on the DE10-Lite and the DE0-CV, 8 (a DAC with its clock) on the DE1-SoC and the DE2-115
  assert.deepEqual(IDS.map(id => pins(id, 'vga_red')?.length ?? 0), [4, 4, 8, 0, 0, 8]);
  assert.deepEqual(IDS.map(id => board(id).resources.filter(r => r.group === 'Headers').map(r => `${r.name}:${r.pins.length}`).join(' ')),
    ['gpio:36', 'gpio_0:36 gpio_1:36', 'gpio_0:36 gpio_1:36', 'gpio_0:36 gpio_1:36', 'gpio_0:34 gpio_0_in:2 gpio_1:34 gpio_1_in:2 gpio_2:13 gpio_2_in:3', 'gpio:36']);
});

// a top's ports, as the examples name them (blinky's and a counter on the displays)
const bit = (name, width, dir = 'in') => ({ name, dir, width, msb: width > 1 ? width - 1 : null, lsb: width > 1 ? 0 : null });

test('each board\'s constraints: a QSF of the top\'s ports with the board\'s I/O standards, its clock in the SDC, Check Constraints clean', () => {
  for (const id of IDS) {
    const r = dev.resolveBoard(id), b = { ...r.board, resources: r.resources };
    const ports = [bit('clk', 1), bit('sw', 4), bit('btn', 2), bit('led', 8, 'out')];
    const { assignments, clocks, unmatched } = boardAutoAssign(ports, { ...b, device: r.device }, { byDirection: true });
    assert.deepEqual(unmatched, [], id);
    const text = boardConstraintsText({ device: r.device, board: b, ports, assignments, clocks, header: `UCF for top 'top' on ${b.name}` });
    assert.equal(text.split('\n')[0], `# QSF for top 'top' on ${b.name}`, id);
    const m = QSF.read(text);
    assert.equal(Object.keys(m.assignments).length, 15, id);
    assert.ok(Object.entries(m.assignments).every(([net, a]) => a.loc && a.iostandard === r.resources.find(x => x.pins.includes(a.loc)).iostandard), id);
    assert.deepEqual(m.clocks, [{ net: 'clk', period: 20, duty: 50, name: 'clk' }], id);
    assert.equal(writeSdc(m, { ports }), 'create_clock -name {clk} -period 20.000 -waveform {0.000 10.000} [get_ports {clk}]\nderive_pll_clocks\nderive_clock_uncertainty\n', id);
    assert.deepEqual(constraintsDiagnostics('qsf', text, { ports, top: 'top', device: r.device, board: b }), [], id);
  }
});

test('an empty project and blinky\'s on the DE0-CV: their constraints file top.qsf, the board\'s pins in it', async () => {
  const P = await import('../server/projects.js');
  const r = dev.resolveBoard('de0-cv');
  await P.createProject({ name: 'emptyde0', device: r.device, board: 'de0-cv' });
  assert.equal((await P.readProject('emptyde0')).constraints, 'constraints/top.qsf');
  await P.createProject({ name: 'blinkyde0', template: 'blinky', device: r.device, board: 'de0-cv' });
  const pj = await P.readProject('blinkyde0');
  assert.equal(pj.constraints, 'constraints/top.qsf');
  const dir = P.projectDir('blinkyde0');
  assert.equal(fs.existsSync(path.join(dir, 'constraints/top.ucf')), false);
  const text = fs.readFileSync(path.join(dir, 'constraints/top.qsf'), 'utf8');
  assert.match(text.split('\n')[0], /^# QSF for top 'top' on Terasic DE0-CV/);
  const m = QSF.read(text);
  assert.deepEqual([m.assignments.clk, m.assignments['led<0>']], [{ loc: 'PIN_M9', iostandard: '3.3-V LVTTL' }, { loc: 'PIN_AA2', iostandard: '3.3-V LVTTL' }]);
  assert.deepEqual(m.clocks.map(c => [c.net, c.period]), [['clk', 20]]);
});
