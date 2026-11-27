#!/usr/bin/env node
// Silinx - the Systems' scheduler's benchmark (#4696): two FPGA nodes of the `uart` example's modules (core/system-sim.js,
// test/system-sim-lib.mjs) linked by a UART both ways, a at 50 MHz and b at 40 MHz (or 50), simulated together in
// Node; the simulated time per second of the computer's time against the quantum, with the links idle, then busy (a's
// message echoed back and forth: both links always active), adaptive and with a fixed latency (exact), and the nodes
// alone (no scheduler) for reference.
//
//   node scripts/bench-system-sim.mjs [--baud 115200] [--ms 20] [--b compiled|event|avr] [--json]
//
// The node b of kind avr (#5912): an Arduino Uno (avr8js, 16 MHz) running an echo program (test/avr-asm.mjs echoProgram,
// its USART at the UBRR nearest the baud rate: its own rate said), linked by the same UART on its D1 (TX) and D0 (RX).
import { uartNode, uartSystem, uartModel, bytesOf } from '../test/system-sim-lib.mjs';
import { echoProgram } from '../test/avr-asm.mjs';
import { CompiledSim } from '../core/compiled-sim.js';
import { AvrNode, AVR_HZ, loadAvr8js } from '../core/system-sim-avr.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const BAUD = Number(opt('baud', 115200));
const MS = Number(opt('ms', 20));
const B_KIND = opt('b', 'compiled');
const JSON_OUT = args.includes('--json');

// an AVR's USART at `baud`: its UBRR (normal speed) and the rate it gives
const UBRR = Math.round(AVR_HZ / 16 / BAUD - 1), AVR_BAUD = AVR_HZ / 16 / (UBRR + 1);
/** The node kinds b can be (a: always a compiled FPGA node): { make, pins (its UART's), what (said) }. */
const NODE_KINDS = {
  compiled: { make: () => uartNode('compiled', { hz: 40e6, baud: BAUD }), what: 'compiled, 40 MHz' },
  event: { make: () => uartNode('event', { hz: 40e6, baud: BAUD }), what: 'event-driven, 40 MHz' },
  avr: { make: async () => { await loadAvr8js(); return new AvrNode({ firmware: { program: echoProgram({ ubrr: UBRR }) } }); },
    pins: { tx: 'D1', rx: 'D0' }, what: `an Arduino Uno's echo program, avr8js at 16 MHz, UBRR ${UBRR} (${Math.round(AVR_BAUD)} baud)` },
};
if (!(B_KIND in NODE_KINDS)) throw new Error(`--b: one of ${Object.keys(NODE_KINDS).join(', ')}`);
const B = NODE_KINDS[B_KIND];

const BIT = 1e12 / BAUD, END = MS * 1e9;
const now = () => performance.now();
const fmt = (ps) => (ps >= 1e9 ? `${+(ps / 1e9).toFixed(2)} ms` : ps >= 1e6 ? `${+(ps / 1e6).toFixed(2)} µs` : `${+(ps / 1e3).toFixed(1)} ns`);

// one run: the system built, run to END; its rate (simulated ms per second), its windows, the bytes a received back
async function measure({ busy, ...opts }) {
  const a = await uartNode('compiled', { hz: 50e6, baud: BAUD }), b = await B.make();
  const sys = uartSystem({ a, b, baud: BAUD, twoWay: true, press: busy ? 1e9 : null, bPins: B.pins, ...opts });
  const t0 = now();
  sys.run(END);
  const s = (now() - t0) / 1000;
  return {
    rate: END / 1e9 / s, windows: sys.stats.windows, late: sys.stats.late,
    bytes: bytesOf(sys.links.get('ba').sent, BAUD, END).length, warnings: sys.messages('warning').length + sys.messages('error').length,
  };
}

// the nodes alone: the same cycles in one compiled run each (an AVR node: its own run to the end, its RX idle)
async function alone() {
  const ma = await uartModel({ hz: 50e6, baud: BAUD }), sa = new CompiledSim(ma.model);
  sa.set('rx', 1);
  let sb = null, avr = null;
  if (B_KIND === 'avr') { avr = await B.make(); avr.setPin('D0', 1); }
  else { sb = new CompiledSim((await uartModel({ hz: 40e6, baud: BAUD })).model); sb.set('rx', 1); }
  const t0 = now();
  sa.cycle(Math.floor(END / 20000));
  if (avr) avr.advanceTo(END); else sb.cycle(Math.floor(END / 25000));
  return { rate: END / 1e9 / ((now() - t0) / 1000) };
}

const rows = [];
const row = async (what, quantum, o) => {
  await measure(o);   // (a run first: V8 optimizes the code)
  const r = await measure(o);
  rows.push({ what, quantum, ...r });
};
const ref = await alone();
await alone();
rows.push({ what: 'the two nodes alone (no scheduler, links idle)', quantum: '—', ...(await alone()) });
for (const wide of [BIT / 16, BIT, 10 * BIT, 100e6, 1e9]) await row('links idle, adaptive', `wide ${fmt(wide)}`, { busy: false, wide });
for (const div of [4, 16, 64]) await row('links busy, adaptive', `fine bit/${div} (${fmt(BIT / div)})`, { busy: true, fine: BIT / div });
for (const lat of [BIT / 16, BIT, 10 * BIT]) {
  await row('links idle, latency', `${fmt(lat)}`, { busy: false, latency: lat });
  await row('links busy, latency', `${fmt(lat)}`, { busy: true, latency: lat });
}

if (JSON_OUT) console.log(JSON.stringify({ baud: BAUD, ms: MS, b: B_KIND, ...(B_KIND === 'avr' ? { avrBaud: AVR_BAUD } : {}), alone: ref.rate, rows }));
else {
  console.log(`Two nodes (a: the uart example's module compiled, 50 MHz; b: ${B.what}), a UART both ways at ${BAUD} baud, ${MS} ms simulated:`);
  console.log('| run | quantum | simulated ms / s | windows | bytes back | late |');
  console.log('|---|---|---:|---:|---:|---:|');
  for (const r of rows) console.log(`| ${r.what} | ${r.quantum} | ${r.rate.toFixed(1)} | ${r.windows ?? '—'} | ${r.bytes ?? '—'} | ${r.late ?? '—'} |`);
}
