// The System Emulator's core (#5212, core/system-emu.js): a System's boards emulated through the scheduler. The uart
// example's FPGA on its Basys2 (its UCF's pins: BTN0, LD7..LD0, the display) linked to a terminal, an Arduino Uno
// lighting its LED L: the boards found (an FPGA board's inputs its button, no link drives it; its outputs its LEDs and
// display; the Uno's pins and LED); the terminal's 'A' received, the LEDs its bits, the display its hexadecimal (each
// against the byte, independently); BTN0 pressed through the board: the FPGA's message in the terminal; the Uno's LED
// on; the host's messages (init emulate, set, run's boards). No warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { emulationBoards, withBoards, watchBoards, boardStates, setBoardInput } from '../core/system-emu.js';
import { systemPlan } from '../core/system-build.js';
import { systemFromInputs, systemReport } from '../core/system-run.js';
import { hostSystemRun } from '../core/system-host.js';
import { normalizeSystem } from '../core/system-doc.js';
import { loadAvr8js } from '../core/system-sim-avr.js';
import { uartNetlist } from './system-sim-lib.mjs';
import { avrAssemble, intelHex } from './avr-asm.mjs';
import { ROOT } from './examples-lib.mjs';

await loadAvr8js();

// the uart example's pins on the Basys2 (its UCF): "NET \\"led<0>\\" LOC = \\"M5\\""
const UCF = fs.readFileSync(path.join(ROOT, 'examples/uart/constraints/top.ucf'), 'utf8');
const PINS = Object.fromEntries([...UCF.matchAll(/^NET "([^"]+)"\s+LOC = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const FPGA = { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: PINS, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }] };
const TERM = { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] };
const BLINK = ['ldi r16, 0x20', 'out 0x04, r16', 'out 0x05, r16', 'loop:', 'rjmp loop'];   // D13 (PB5) an output, high
const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'fw/l.hex', interfaces: [] };
const sys = normalizeSystem({ format: 'silinx-system', version: 1, name: 'emu', nodes: [FPGA, TERM, UNO], links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'fpga.uart' }] });
const PORTS = { uart: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rx', dir: 'in', width: 1 }, { name: 'tx', dir: 'out', width: 1 }] };
async function inputs() {
  return { plan: systemPlan(sys, { ports: PORTS }), netlists: { fpga: await uartNetlist() }, firmware: { uno: { name: 'fw/l.hex', data: intelHex(avrAssemble(BLINK)) } } };
}
// the Basys2's display: segments a..g of each hexadecimal digit (an independent table)
const HEX = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011', '1110111', '0011111', '1001110', '0111101', '1001111', '1000111'];
const segsOf = (d) => [...HEX[d]].map(Number);

test('#5212 the boards: the FPGA\'s button its input (no link drives it), its LEDs and display its outputs; the Uno\'s pins and LED', async () => {
  const boards = emulationBoards(sys, await inputs());
  assert.deepEqual(boards.map((b) => [b.id, b.kind]), [['fpga', 'fpga'], ['uno', 'mcu']]);
  const [f, u] = boards;
  assert.deepEqual(f.inputs, [{ pin: 'btn', kind: 'btn', res: 'btn', idx: 0, activeLow: false }]);
  // (each port's bits from its left, the wiring's order)
  const down = (p, n) => Array.from({ length: n }, (_, i) => `${p}[${n - 1 - i}]`);
  assert.deepEqual(f.outputs, [...down('led', 8), ...down('seg', 7), 'dp', ...down('an', 4)]);
  assert.deepEqual([u.led, u.outputs.length, u.outputs[0], u.outputs.at(-1)], ['D13', 20, 'D0', 'A5']);
  assert.deepEqual(withBoards(await inputs(), boards).plan.fpga[0].pins, ['tx', ...f.outputs]);
});

test('#5212 emulated: the terminal\'s A on the LEDs and the display, BTN0 sends the FPGA\'s message, the Uno\'s LED L on', async () => {
  const ins = await inputs(), boards = emulationBoards(sys, ins);
  const r = systemFromInputs(sys, withBoards(ins, boards));
  assert.equal(r.error, undefined);
  watchBoards(r.sim, boards);
  r.terminals.get('term').send([0x41]);
  r.sim.run(5e9);
  let shown = boardStates(r.sim, boards, 0, 5e9);
  r.sim.run(10e9);
  shown = boardStates(r.sim, boards, 5e9, 10e9, shown);
  // the LEDs: 0x41's bits, on the whole window; the display: its hexadecimal at the right (an<1>, an<0>)
  assert.deepEqual(shown.fpga.leds, [1, 0, 0, 0, 0, 0, 1, 0]);
  const segs = shown.fpga.digits.map((d) => d && d.seg.map((x) => (x > 0.5 ? 1 : 0)));
  assert.deepEqual([segs[1], segs[0]], [segsOf(4), segsOf(1)]);
  assert.deepEqual(shown.uno, { pins: { ...Object.fromEntries(boards[1].outputs.map((p) => [p, shown.uno.pins[p]])), D13: 1 }, led: 1 });
  assert.equal(shown.uno.pins.D12, null, 'an input no one drives: floating');
  // BTN0 pressed (held 2 ms), then released: the message
  setBoardInput(r.sim, boards[0], 'btn', 1);
  r.sim.run(12e9);
  setBoardInput(r.sim, boards[0], 'btn', 0);
  r.sim.run(40e9);
  assert.equal(String.fromCharCode(...r.terminals.get('term').received.map((b) => b.byte ?? b)).replace(/^A/, ''), 'Hello from Silinx!\r\n');
  assert.throws(() => setBoardInput(r.sim, boards[0], 'led[0]', 1), /^Error: 'led\[0\]' is not a switch or a button of fpga's board$/);
  const rep = systemReport(r);
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
});

test('#5212 the host: init emulate (its boards), set (BTN0), run (what each board shows since the last)', async () => {
  const { port1, port2 } = new MessageChannel();
  hostSystemRun(port2);
  const got = [];
  port1.onmessage = (e) => got.push(e.data);
  const next = () => new Promise((ok) => { const t = setInterval(() => { if (got.length) { clearInterval(t); ok(got.shift()); } }, 5); });
  port1.postMessage({ type: 'init', system: sys, inputs: await inputs(), emulate: true });
  const ready = await next();
  if (ready.type !== 'ready') port1.close();
  assert.equal(ready.type, 'ready', JSON.stringify(ready));
  assert.deepEqual(ready.boards.map((b) => [b.id, b.kind, b.board, b.variant, b.inputs.length]), [['fpga', 'fpga', 'basys2', '250', 1], ['uno', 'mcu', 'arduino-uno', null, 0]]);
  port1.postMessage({ type: 'run', id: 1, until: 2e9 });
  try {
    const s = await next();
    // (the LED L on from the program's third instruction: almost the whole window)
    assert.deepEqual([s.type, s.id, s.boards.uno.led > 0.999, s.boards.fpga.leds], ['state', 1, true, [0, 0, 0, 0, 0, 0, 0, 0]]);
    port1.postMessage({ type: 'set', node: 'term', pin: 'btn', value: 1 });
    assert.deepEqual(await next(), { type: 'error', id: undefined, message: 'no board of an FPGA node \'term\'' });
  } finally { port1.close(); }
});
