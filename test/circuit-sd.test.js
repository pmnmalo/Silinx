// An SD card on SPI (#5477, core/circuit-sd.js): CRC7 and CRC16 against their known values; the card's protocol byte by
// byte (power-up, CMD0, CMD8's echo, ACMD41's idle then ready, CMD58's OCR, a block written and read back with its CRC16;
// a wrong CRC, an illegal command, a read before it is ready, an address past the card, a wrong block length); its SPI side
// bit by bit; in a circuit (a host's switches on SCK, MOSI and CS, its MISO lighting an LED) its HDL compiled with no
// warnings, its answers the live one's in VHDL and in Verilog; its checks; an Arduino's SPI writing a block and reading it
// back through a System.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSd, createSdSpi, crc7, crc16, sdText, SD_CARD, R1 } from '../core/circuit-sd.js';
import { normalizeCircuit } from '../core/circuit.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { checkCircuit } from '../core/circuit-check.js';
import { PARTS, PART_ORDER } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { EXPORTED_PARTS } from '../core/kicad-export.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';

const frame = (i, arg) => { const c = [0x40 | i, arg >>> 24, (arg >> 16) & 255, (arg >> 8) & 255, arg & 255]; return [...c, crc7(c)]; };

test('#5477 CRC7 and CRC16: the SD specification\'s and the usual commands\' known values', () => {
  // (CMD0 0x95, CMD8 0x1AA 0x87, CMD55 0x65, ACMD41 HCS 0x77, CMD58 0xFD; CRC16-CCITT XMODEM of "123456789": 0x31C3)
  assert.deepEqual([frame(0, 0), frame(8, 0x1aa), frame(55, 0), frame(41, 0x40000000), frame(58, 0)].map((f) => f[5]), [0x95, 0x87, 0x65, 0x77, 0xfd]);
  assert.equal(crc16([...'123456789'].map((c) => c.charCodeAt(0))), 0x31c3);
  assert.equal(crc16(new Uint8Array(512)), 0);
});

// a host over the card's byte side: a command's frame, then FF until its R1, and n bytes more
function host(card) {
  const send = (b) => card.exchange(b);
  let pending = 0xff;
  const xfer = (b) => { const r = pending; pending = send(b); return r; };
  const cmd = (i, arg, more = 0, f = frame(i, arg)) => { f.forEach(xfer); let r1 = 0xff; for (let k = 0; k < 9 && r1 === 0xff; k++) r1 = xfer(0xff); return [r1, ...Array.from({ length: more }, () => xfer(0xff))]; };
  return { xfer, cmd };
}

test('#5477 the card\'s protocol: power-up, its initialisation, a block written and read back; its refusals and their R1 bits', () => {
  const card = createSd(), h = host(card);
  // (too few clocks: not answered, said once)
  card.clocks(10);
  assert.deepEqual(h.cmd(0, 0), [0xff]);
  assert.deepEqual(card.warnings.map((w) => w.text), ['only 10 clocks with CS high before its first command: an SD card needs 74 or more']);
  card.clocks(70);
  assert.deepEqual(h.cmd(0, 0), [R1.idle]);
  assert.deepEqual(h.cmd(0, 0, 0, [0x40, 0, 0, 0, 0, 0x01]), [R1.idle | R1.crc], 'CMD0\'s CRC wrong');
  assert.deepEqual(h.cmd(8, 0x1aa, 4), [R1.idle, 0, 0, 1, 0xaa]);
  assert.deepEqual(h.cmd(17, 0), [R1.idle | R1.illegal], 'a read before it is ready');
  assert.deepEqual(h.cmd(2, 0), [R1.idle | R1.illegal], 'CMD2: not in SPI mode');
  assert.deepEqual([h.cmd(55, 0), h.cmd(41, 0x40000000), h.cmd(55, 0), h.cmd(41, 0x40000000)], [[R1.idle], [R1.idle], [R1.idle], [0]]);
  assert.deepEqual(card.state().stage, 'ready');
  assert.deepEqual(h.cmd(58, 0, 4), [0, 0xc0, 0xff, 0x80, 0x00], 'its OCR: powered up, SDHC');
  assert.deepEqual([h.cmd(16, 512), h.cmd(16, 1024), h.cmd(17, 65536), h.cmd(13, 0, 1)], [[0], [R1.parameter], [R1.address], [0, 0]]);
  // (block 7 written: R1, its token, 512 bytes, its CRC; its data response, busy, then FF)
  const data = Uint8Array.from({ length: 512 }, (_, i) => 'Hello SD! '.charCodeAt(i % 10));
  assert.deepEqual(h.cmd(24, 7), [0]);
  h.xfer(0xff); h.xfer(0xfe); data.forEach(h.xfer); h.xfer(0xff); h.xfer(0xff);
  const after = Array.from({ length: 10 }, () => h.xfer(0xff));
  assert.equal(after[0] & 0x1f, 0x05, 'data accepted');
  assert.deepEqual(after.slice(1), [0, 0, 0, 0, 0, 0, 0, 0, 0xff]);
  // (read back: R1, a byte, its token, 512 bytes, its CRC16)
  const r = h.cmd(17, 7, 1 + 1 + 512 + 2);
  assert.deepEqual([r[0], r[1], r[2]], [0, 0xff, 0xfe]);
  assert.deepEqual(Uint8Array.from(r.slice(3, 515)), data);
  assert.equal((r[515] << 8) | r[516], crc16(data));
  assert.deepEqual([card.state(), card.log()], [{ stage: 'ready', written: [7], last: { block: 7, op: 'read' } }, ['ready', 'wrote block 7', 'read block 7']]);
  assert.equal(sdText(card.block(7)), '"Hello SD! Hello SD! Hello SD! He…"');
  // (unpowered: its blocks kept, its stage off)
  card.powerOff();
  assert.deepEqual([card.state().stage, card.block(7)[0]], ['off', 72]);
});

test('#5477 its SPI side, mode 0: MOSI read on SCK\'s rise, MISO set on its fall, a byte\'s MSB first; MISO released while CS is high', () => {
  const spi = createSdSpi();
  assert.equal(spi.edge('0', '0', '1'), 'Z');
  for (let i = 0; i < 80; i++) { spi.edge('1', '1', '1'); spi.edge('0', '1', '1'); }
  const xfer = (b) => { let r = 0; for (let k = 7; k >= 0; k--) { const m = (b >> k) & 1 ? '1' : '0'; r = (r << 1) | (spi.edge('1', m, '0') === '1' ? 1 : 0); spi.edge('0', m, '0'); } return r; };
  spi.edge('0', '1', '0');
  frame(0, 0).forEach(xfer);
  assert.deepEqual([xfer(0xff), xfer(0xff)], [0xff, 0x01]);
  assert.equal(spi.edge('0', '1', '1'), 'Z');
});

// a circuit: a host's switches on MOSI, SCK and CS (CS high at first), MISO lighting an LED
const bench = ({ power = true } = {}) => normalizeCircuit({ name: 'sd', parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'SD1', type: 'sd-card', x: 0, y: 0 },
  { id: 'MOSI', type: 'logic-switch', x: 3, y: 4 }, { id: 'SCK', type: 'logic-switch', x: 4, y: 6 }, { id: 'CS', type: 'logic-switch', x: 5, y: 8, on: true }, { id: 'D1', type: 'led', x: -3, y: 3 }],
wires: [{ id: 'm', points: [[3, 4], [3, 0]] }, { id: 'k', points: [[4, 6], [4, 0]] }, { id: 'c', points: [[5, 8], [5, 0]] }, { id: 'o', points: [[2, 0], [2, 2], [-3, 2], [-3, 3]] },
  { id: 'dk', points: [[-2, 3], [-10, -13]] }, { id: 'g', points: [[0, 0], [-11, 0], [-11, -13], [-10, -13]] }, ...(power ? [{ id: 'v', points: [[1, 0], [1, -1], [-12, -1], [-12, -14], [-10, -14]] }] : [])] });
// the host's waveform: 80 clocks with CS high, CS low, CMD0, CMD8, ACMD41 twice, block 5 written, block 5 read
const WAVE = (() => {
  const H = 5000, ev = [];
  let t = 1000;
  const at = (k, v) => ev.push([t, k, v]);
  for (let i = 0; i < 80; i++) { at('SCK', 1); t += H; at('SCK', 0); t += H; }
  at('CS', 0); t += H;
  const byte = (b) => { for (let k = 7; k >= 0; k--) { at('MOSI', (b >> k) & 1); t += H; at('SCK', 1); t += H; at('SCK', 0); } t += H; };
  const cmd = (i, arg) => { frame(i, arg).forEach(byte); for (let k = 0; k < 6; k++) byte(0xff); };
  cmd(0, 0); cmd(8, 0x1aa); cmd(55, 0); cmd(41, 0x40000000); cmd(55, 0); cmd(41, 0x40000000);
  cmd(24, 5); byte(0xfe); for (let i = 0; i < 512; i++) byte('Hello SD! '.charCodeAt(i % 10)); byte(0xff); byte(0xff); for (let k = 0; k < 12; k++) byte(0xff);
  cmd(17, 5); for (let k = 0; k < 520; k++) byte(0xff);
  at('CS', 1); t += 10 * H;
  return { ev, end: t };
})();
function live(m) {
  const sim = createCircuitSim(m), seen = [];
  let lit = null;
  const look = () => { const v = sim.leds().D1; if (v !== lit) { seen.push(`D1=${v === 'on' ? 1 : 0} at ${sim.time}`); lit = v; } };
  sim.run(); look();
  for (const [t, k, v] of WAVE.ev) { sim.advance(t - sim.time); sim.set(k, !!v); sim.run(); look(); }
  sim.advance(WAVE.end - sim.time); look();
  return { sim, seen };
}

test('#5477 the card in a circuit: a host\'s switches initialise it, write block 5 and read it back, MISO lighting the LED; unpowered: nothing', () => {
  const r = live(bench());
  assert.equal(r.seen.length, 2093);
  assert.deepEqual([r.sim.sds().SD1, r.sim.servoWarnings()], [{ stage: 'ready', written: [5], last: { block: 5, op: 'read' } }, []]);
  assert.equal(sdText(r.sim.sdBlock('SD1', 5)), '"Hello SD! Hello SD! Hello SD! He…"');
  const off = live(bench({ power: false }));
  assert.deepEqual([off.sim.sds().SD1, off.seen], [{ stage: 'off', written: [], last: null }, ['D1=0 at 0']]);
});

test('#5477 its checks; the library\'s part', () => {
  const lines = (c) => checkCircuit(c).map((x) => `${x.severity}: ${x.message}`);
  assert.deepEqual(lines(bench()), []);
  assert.deepEqual(lines(bench({ power: false })), ['warning: SD1 (SD card module (SPI, microSD)) is not powered: its VCC (pin 2) is not on the supply\'s +']);
  const alone = normalizeCircuit({ name: 'c', parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'SD1', type: 'sd-card', x: 0, y: 0 }], wires: [{ id: 'g', points: [[0, 0], [-10, -13]] }, { id: 'v', points: [[1, 0], [-10, -14]] }] });
  assert.deepEqual(lines(alone), ['warning: SD1\'s SCK, MOSI, CS are driven by nothing: no host talks to it']);
  assert.deepEqual(lines(normalizeCircuit({ name: 'c', parts: [{ id: 'SD1', type: 'sd-card', x: 0, y: 0 }] })), ['warning: SD1 (SD card module (SPI, microSD)) joins nothing']);
  assert.deepEqual([PARTS['sd-card'], SD_CARD.pins.map((p) => `${p.n} ${p.name} ${p.dir}`), PART_ORDER.indexOf('sd-card') > 0, EXPORTED_PARTS.includes('sd-card')],
    [SD_CARD, ['1 GND gnd', '2 VCC vcc', '3 MISO out', '4 MOSI in', '5 SCK in', '6 CS in'], true, false]);
  assert.match(partInfo('sd-card').about, /^A microSD card module with a 32 MB SDHC card, on SPI/);
});

// the circuit's HDL simulated with a test bench playing the host's waveform: what it says, the LED's changes
function hdl(lang) {
  const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
  const L = ['`timescale 1ns / 1ps', 'module tb; reg MOSI, SCK, CS; wire D1; sd dut (.MOSI(MOSI), .SCK(SCK), .CS(CS), .D1(D1));', '  always @(D1) if (D1 !== 1\'bx) $display("D1=%b at %0t", D1, $time);', '  initial begin', '    MOSI = 0; SCK = 0; CS = 1;'];
  let now = 0;
  for (const [t, k, v] of WAVE.ev) { L.push(`    #${t - now}; ${k} = ${v};`); now = t; }
  L.push(`    #${WAVE.end - now}; $finish;`, '  end', 'endmodule');
  const r = simulate([{ path, text: g.code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e16 });
  assert.deepEqual(r.errors, [], lang);
  const log = r.sim.log.map((e) => String(e.text).trim()), leds = log.filter((x) => /^D1=/.test(x));
  while (leds.length > 1 && / at 0$/.test(leds[1])) leds.shift();   // (its levels settling at 0)
  return { said: log.filter((x) => /^SD1/.test(x)), leds };
}

test('#5477 the card in the circuit\'s HDL: compiled with no warnings; its answers bit for bit the live one\'s, what it does said, in VHDL and in Verilog', () => {
  const want = live(bench());
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateCircuit(bench(), lang), path = lang === 'vhdl' ? 'dut.vhd' : 'dut.v';
    const lib = compile([{ path, text: g.code }]), e = elaborate(lib, 'sd');
    assert.deepEqual([...lib.errors, ...e.diags, ...designChecks(lib, e, { lint: true })].map((x) => `${x.severity}: ${x.message}`), [], `${lang}: no warnings`);
    const h = hdl(lang);
    assert.deepEqual(h.said, ['SD1 ready', 'SD1 wrote block 5', 'SD1 read block 5'], lang);
    assert.deepEqual(h.said, want.sim.sdLog('SD1').map((l) => `SD1 ${l}`), `${lang}: the live one's`);
    assert.deepEqual(h.leds, want.seen, `${lang}: MISO's levels`);
  }
});

test('#5477 an Arduino\'s SPI (D10..D13) initialising the card, writing block 5 and reading it back (its sum) through a System', async () => {
  const { normalizeSystem } = await import('../core/system-doc.js');
  const { systemInputs, systemFromInputs, systemReport } = await import('../core/system-run.js');
  const { loadAvr8js } = await import('../core/system-sim-avr.js');
  const { avrAssemble, intelHex } = await import('./avr-asm.mjs');
  await loadAvr8js();
  const uno = (name) => { const q = PARTS['arduino-uno'].pins.find((x) => x.name === name); return [q.dx, q.dy]; };
  const at = (k) => [30 + k, 30];
  const circ = normalizeCircuit({ name: 'bench', parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'SD1', type: 'sd-card', x: 30, y: 30 }],
    wires: [{ id: 'g', points: [uno('GND'), at(0)] }, { id: 'v', points: [uno('5V'), at(1)] }, { id: 'mi', points: [uno('D12'), at(2)] }, { id: 'mo', points: [uno('D11'), at(3)] },
      { id: 'sk', points: [uno('D13'), at(4)] }, { id: 'cs', points: [uno('D10'), at(5)] }] });
  // its SPI a master at clk/128 (SPCR 0x53); PB2 (CS), PB3 (MOSI), PB5 (SCK) outputs; a byte sent: SPDR, SPIF waited for
  const x = (v) => [`ldi r16, ${v}`, 'rcall spi'];
  const cmd = (i, arg) => [...frame(i, arg).flatMap(x), ...Array.from({ length: 8 }, () => x(0xff)).flat()];
  const prog = ['ldi r16, 0x2c', 'out 0x04, r16', 'ldi r16, 0x04', 'out 0x05, r16', 'ldi r16, 0x53', 'out 0x2c, r16',
    ...Array.from({ length: 10 }, () => x(0xff)).flat(), 'ldi r16, 0x00', 'out 0x05, r16',
    ...cmd(0, 0), ...cmd(8, 0x1aa), ...cmd(55, 0), ...cmd(41, 0x40000000), ...cmd(55, 0), ...cmd(41, 0x40000000),
    // (block 5: its token, 512 bytes 'A', its CRC, then its data response and busy)
    ...cmd(24, 5), ...x(0xfe), 'ldi r17, 65', 'ldi r19, 0', 'ldi r18, 2', 'wr:', 'out 0x2e, r17', 'w1:', 'in r16, 0x2d', 'sbrs r16, 7', 'rjmp w1', 'inc r19', 'brne wr', 'dec r18', 'brne wr',
    ...Array.from({ length: 14 }, () => x(0xff)).flat(),
    // (block 5 read: its frame, then a byte (Ncr), R1, a byte and its token, then its 512 bytes summed in r25:r24)
    ...frame(17, 5).flatMap(x), ...x(0xff), ...x(0xff), ...x(0xff), ...x(0xff), 'eor r1, r1', 'eor r24, r24', 'eor r25, r25', 'ldi r17, 0', 'ldi r18, 2',
    'rd:', 'ldi r16, 0xff', 'rcall spi', 'in r16, 0x2e', 'add r24, r16', 'adc r25, r1', 'inc r17', 'brne rd', 'dec r18', 'brne rd',
    'sts 0x100, r24', 'sts 0x101, r25', 'ldi r16, 0x04', 'out 0x05, r16',
    'end:', 'rjmp end',
    'spi:', 'out 0x2e, r16', 'sw:', 'in r16, 0x2d', 'sbrs r16, 7', 'rjmp sw', 'ret'];
  const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 's', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/sd.hex', interfaces: [] },
    { id: 'bench', kind: 'circuit', circuit: 'src/bench.circ.json', interfaces: [] }], links: [] });
  const inputs = await systemInputs(sys, { firmware: async () => intelHex(avrAssemble(prog)), circuit: async () => JSON.stringify(circ), netlist: () => null });
  const r = systemFromInputs(sys, inputs);
  r.sim.run(200e9);
  const node = r.sim.nodes.get('bench'), data = r.sim.nodes.get('uno').cpu.data;
  assert.deepEqual(node.sds().SD1, { stage: 'ready', written: [5], last: { block: 5, op: 'read' } });
  assert.ok(node.sdBlock('SD1', 5).every((b) => b === 65));
  // (its sum read back: 512 times 'A')
  assert.equal(data[0x100] | (data[0x101] << 8), 512 * 65);
  const rep = systemReport(r);
  assert.equal(rep.lines.find((l) => l.startsWith('circuit bench: SD1')), 'circuit bench: SD1 ready; block 5: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA…"');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});
