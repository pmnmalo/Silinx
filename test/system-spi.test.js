// A System's SPI links (#5214): an Arduino Uno, the master (its SPI on D13, D11, D12, its program's SS on D10), and an
// FPGA peripheral (examples/spi-avr/src/spi_echo.vhd, the spi-avr example's: each byte shown on its LEDs, answered with the last one plus one).
// The System document's SPI interface and its check (the master and the peripheral, one rate and one mode, its 5 V
// warnings); the plan's four wires (SS pulled up while floating), each at a sixteenth of SCK's period; the run: the
// Uno's 0x41 0x42 0x43 at 125 kHz, the FPGA's 00 42 43 back, its LEDs 0x43; the decoder against known waveforms (each
// mode, LSB first, SS raised, a short transfer) and its warning on a SCK faster than its interface says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeSystem } from '../core/system-doc.js';
import { checkSystem } from '../core/system-check.js';
import { systemPlan } from '../core/system-build.js';
import { systemFromInputs, systemReport } from '../core/system-run.js';
import { decodeSpi, spiWarnings } from '../core/system-decode.js';
import { loadAvr8js } from '../core/system-sim-avr.js';
import { designOf } from './compiled-diff.js';
import { netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { avrAssemble, intelHex } from './avr-asm.mjs';
import { ROOT } from './examples-lib.mjs';

await loadAvr8js();
const SRC = fs.readFileSync(path.join(ROOT, 'examples/spi-avr/src/spi_echo.vhd'), 'utf8');
const PORTS = { spi_echo: [['clk', 'in', 1], ['sck', 'in', 1], ['mosi', 'in', 1], ['ss', 'in', 1], ['miso', 'out', 1], ['led', 'out', 8]].map(([name, dir, width]) => ({ name, dir, width })) };
const system = (over = {}) => normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [
  { id: 'fpga', kind: 'fpga', module: 'spi_echo', board: 'basys2', variant: '250', pins: { clk: 'B8', sck: 'B2', mosi: 'A3', miso: 'J3', ss: 'B5' }, interfaces: [{ name: 'bus', kind: 'spi', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss', ...over.fpga }] },
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/spi.hex', interfaces: [{ name: 'SPI', kind: 'spi', ...over.uno }] },
], links: [{ id: 'spi', kind: 'spi', a: 'uno.SPI', b: 'fpga.bus' }] });
// the Uno's program: SCK, MOSI and SS outputs, SS high; the SPI a master at fosc/128 (125 kHz), mode 0; SS low, 0x41,
// 0x42, 0x43 each sent and waited for (SPIF), SS high
const send = (b) => [`ldi r16, ${b}`, 'out 0x2e, r16', `w${b}:`, 'in r18, 0x2d', 'sbrs r18, 7', `rjmp w${b}`, 'in r19, 0x2e'];
const PROG = ['ldi r16, 0x2c', 'out 0x04, r16', 'ldi r16, 0x04', 'out 0x05, r16', 'ldi r16, 0x53', 'out 0x2c, r16', 'ldi r16, 0', 'out 0x05, r16',
  ...send(0x41), ...send(0x42), ...send(0x43), 'ldi r16, 0x04', 'out 0x05, r16', 'end:', 'rjmp end'];
const W5 = (pin, port, loc) => `warning: spi: uno's ${pin}, a 5 V output, drives fpga's ${port} (pin ${loc}), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards`;

test('#5214 an SPI link checked: the master a microcontroller, the peripheral an FPGA; one rate and one mode; its 5 V warnings', () => {
  const run = (s) => checkSystem(s, { modules: PORTS, files: ['fw/spi.hex'] }).map((d) => `${d.severity}: ${d.message}`);
  assert.deepEqual(run(system()), [W5('D13', 'sck', 'B2'), W5('D11', 'mosi', 'A3'), W5('D10', 'ss', 'B5')]);
  assert.deepEqual(run(system({ uno: { hz: 1e6 } })).filter((d) => d.startsWith('error')), ['error: spi: uno.SPI\'s SCK at 1000000 Hz, fpga.bus\'s at 125000: an SPI bus\'s ends at one rate']);
  assert.deepEqual(run(system({ fpga: { mode: 3 } })).filter((d) => d.startsWith('error')), ['error: spi: uno.SPI in mode 0, fpga.bus in mode 3: an SPI bus\'s ends in one mode']);
  assert.deepEqual(run(system({ fpga: { mode: 4 } })).filter((d) => d.startsWith('error')), ['error: fpga.bus: its mode \'4\' is not an SPI mode (0 to 3)']);
  assert.deepEqual(run(system({ uno: { hz: 0 } })).filter((d) => d.startsWith('error')), ['error: uno.SPI: its SCK rate \'0\' is not a rate (Hz)']);
  assert.deepEqual(run(system({ fpga: { miso: undefined } })).filter((d) => d.startsWith('error')), ['error: fpga.bus: an SPI bus with no miso port']);
  assert.deepEqual(run(system({ fpga: { miso: 'sck' } })).filter((d) => d.startsWith('error')), ['error: fpga.bus: sck is an input of spi_echo, the interface an output']);
  const s = system();
  s.nodes[1].interfaces[0].name = 'SPI2';
  s.links[0].a = 'uno.SPI2';
  assert.deepEqual(run(s).filter((d) => d.startsWith('error')), ['error: uno: the Arduino Uno has no SPI bus SPI2 (its SPI: SPI)']);
});

test('#5214 an SPI link run: the Uno\'s 0x41 0x42 0x43 at 125 kHz, the FPGA\'s answers 00 42 43, its LEDs the last; four wires, no warnings', async () => {
  const sys = system();
  const plan = systemPlan(sys, { ports: PORTS });
  assert.deepEqual(plan.wires.map((w) => [w.name, w.from, w.to, w.line, w.hz]), [
    ['spi_sck', 'uno.D13', 'fpga.sck', 'sck', 125000], ['spi_mosi', 'uno.D11', 'fpga.mosi', 'mosi', 125000],
    ['spi_ss', 'uno.D10', 'fpga.ss', 'ss', 125000], ['spi_miso', 'fpga.miso', 'uno.D12', 'miso', 125000]]);
  const r = systemFromInputs(sys, { plan, netlists: { fpga: await netlistOf(designOf([{ path: 'src/spi_echo.vhd', lang: 'vhdl', role: 'design', text: SRC }], 'spi_echo'), { run: yosysNode }) },
    firmware: { uno: { name: 'fw/spi.hex', data: intelHex(avrAssemble(PROG)) } } });
  assert.equal(r.error, undefined);
  assert.equal(r.sim.links.get('spi_sck').latency, 500000, 'a sixteenth of SCK\'s 8 µs');
  r.sim.run(1e9);
  const rep = systemReport(r);
  assert.deepEqual(rep.spi.map((s) => [s.link, s.from, s.to, s.hz, s.mode, s.transfers.map((x) => [x.mosi, x.miso])]), [['spi', 'uno', 'fpga', 125000, 0, [[0x41, 0x00], [0x42, 0x42], [0x43, 0x43]]]]);
  assert.equal(r.sim.nodes.get('fpga').value('led'), 0x43);
  assert.equal(r.sim.nodes.get('uno').cpu.data[19 + 0], 0x43, 'r19: the last byte the Uno read');
  assert.ok(rep.lines.includes('spi (SPI uno → fpga, 125000 Hz mode 0): 3 transfer(s): MOSI 41 42 43; MISO 00 42 43'), rep.lines.join('\n'));
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

test('#5214 the SPI decoder: each mode\'s sampling edge, LSB first, SS high, a short transfer dropped; a SCK faster than said', () => {
  // a byte's waveform: SCK's 8 cycles from its rest level, each bit set half a period before the edge that reads it
  const wave = (byte, { mode = 0, t0 = 1000, half = 100, lsb = false } = {}) => {
    const cpol = mode >> 1, cpha = mode & 1, sck = [0, cpol], mosi = [0, 0];
    for (let i = 0; i < 8; i++) {
      const bit = (byte >> (lsb ? i : 7 - i)) & 1, lead = t0 + (2 * i + 1) * half, trail = lead + half;
      mosi.push(cpha ? lead : lead - half, bit);
      sck.push(lead, 1 - cpol, trail, cpol);
    }
    return { sck, mosi };
  };
  for (const mode of [0, 1, 2, 3]) {
    const w = wave(0xa5, { mode });
    assert.deepEqual(decodeSpi({ ...w, miso: w.mosi }, { mode }).transfers.map((x) => [x.mosi, x.miso]), [[0xa5, 0xa5]], `mode ${mode}`);
  }
  assert.deepEqual(decodeSpi(wave(0x01, { lsb: true }), { lsbFirst: true }).transfers.map((x) => x.mosi), [0x01]);
  assert.deepEqual(decodeSpi({ ...wave(0x5a), ss: [0, 1] }).transfers, [], 'SS high: not selected');
  const short = wave(0xff);
  assert.deepEqual(decodeSpi({ ...short, ss: [0, 0, 1000 + 7 * 200, 1] }).transfers, [], 'SS raised after 7 bits');
  assert.equal(decodeSpi(wave(0x00, { half: 4e6 })).hz, 125000);
  assert.deepEqual(spiWarnings('spi', { hz: 4000000, declared: 125000 }), ['spi: SCK at 4000000 Hz, faster than its interface\'s 125000 Hz: its MISO may be read late (the interface\'s SCK rate at least the program\'s)']);
  assert.deepEqual(spiWarnings('spi', { hz: 125000, declared: 125000 }), []);
});

test('#5214 an SPI interface added and changed as the editor and edit_system do: the Uno\'s its board\'s, the FPGA\'s its ports; described', async () => {
  const { addInterface, changeInterface, describeSystem } = await import('../core/system-edit.js');
  const s0 = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [
    { id: 'fpga', kind: 'fpga', module: 'spi_echo', board: 'basys2', variant: '250', pins: { sck: 'B2', mosi: 'A3', miso: 'J3', ss: 'B5' }, interfaces: [] },
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', interfaces: [] }], links: [] });
  let r = addInterface(s0, 'uno', { kind: 'spi' });
  assert.deepEqual([r.id, r.system.nodes[1].interfaces], ['uno.SPI', [{ name: 'SPI', kind: 'spi', hz: 125000, mode: 0 }]]);
  assert.deepEqual(addInterface(s0, 'uno', { kind: 'spi', name: 'SPI2' }), { error: 'uno: a microcontroller\'s SPI bus is its board\'s (SPI)' });
  r = addInterface(r.system, 'fpga', { kind: 'spi', name: 'bus', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss' });
  assert.deepEqual(r.system.nodes[0].interfaces, [{ name: 'bus', kind: 'spi', sck: 'sck', mosi: 'mosi', miso: 'miso', ss: 'ss', hz: 125000, mode: 0 }]);
  assert.deepEqual(changeInterface(r.system, 'fpga', 'bus', { mode: 5 }), { error: 'fpga.bus: an SPI bus\'s mode is 0, 1, 2 or 3, not \'5\'' });
  assert.deepEqual(changeInterface(r.system, 'uno', 'SPI', { sck: 'D2' }), { error: 'uno.SPI: this interface has no field \'sck\' to change (hz, mode)' });
  const s = changeInterface(r.system, 'uno', 'SPI', { hz: 1e6 }).system;
  assert.deepEqual(describeSystem(s).filter((l) => /SPI/.test(l)), [
    '  bus: SPI 125000 Hz mode 0, SCK sck (B2), MOSI mosi (A3), MISO miso (J3), SS ss (B5)',
    '  SPI: SPI 1000000 Hz mode 0, SCK D13, MOSI D11, MISO D12, SS D10']);
});

test('#5214 an SPI link added as the Link tool does: its id spi (a UART\'s serial, GPIO\'s wires)', async () => {
  const { addLink } = await import('../core/system-edit.js');
  assert.equal(addLink(system(), { a: 'uno.SPI', b: 'fpga.bus' }).error, 'uno.SPI is linked already (spi): an interface joins one link');
  const s = system();
  s.links = [];
  assert.deepEqual(addLink(s, { a: 'uno.SPI', b: 'fpga.bus' }).system.links, [{ id: 'spi', kind: 'spi', a: 'uno.SPI', b: 'fpga.bus' }]);
});
