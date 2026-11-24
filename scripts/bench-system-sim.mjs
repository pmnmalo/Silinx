#!/usr/bin/env node
// Silinx - the Systems' scheduler's benchmark (#4696): two FPGA nodes of the `uart` example's modules (core/system-sim.js,
// test/system-sim-lib.mjs) linked by a UART both ways, a at 50 MHz and b at 40 MHz (or 50), simulated together in
// Node; the simulated time per second of the computer's time against the quantum, with the links idle, then busy (a's
// message echoed back and forth: both links always active), adaptive and with a fixed latency (exact), and the nodes
// alone (no scheduler) for reference.
//
//   node scripts/bench-system-sim.mjs [--baud 115200] [--ms 20] [--b compiled|event|avr] [--json]
//
// The node b of kind avr (an AVR program, avr8js) comes with #4698: its adapter goes into NODE_KINDS then.
import { uartNode, uartSystem, uartModel, bytesOf } from '../test/system-sim-lib.mjs';
import { CompiledSim } from '../core/compiled-sim.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const BAUD = Number(opt('baud', 115200));
const MS = Number(opt('ms', 20));
const B_KIND = opt('b', 'compiled');
const JSON_OUT = args.includes('--json');

/** The node kinds b can be (a: always a compiled FPGA node). */
const NODE_KINDS = {
  compiled: () => uartNode('compiled', { hz: 40e6, baud: BAUD }),
  event: () => uartNode('event', { hz: 40e6, baud: BAUD }),
  avr: null,   // #4698: an AVR node (avr8js) running a given .hex that echoes, linked by the same UART
};
if (!(B_KIND in NODE_KINDS)) throw new Error(`--b: one of ${Object.keys(NODE_KINDS).join(', ')}`);
if (!NODE_KINDS[B_KIND]) { console.log(`The node b of kind '${B_KIND}' comes with #4698.`); process.exit(0); }

const BIT = 1e12 / BAUD, END = MS * 1e9;
const now = () => performance.now();
const fmt = (ps) => (ps >= 1e9 ? `${+(ps / 1e9).toFixed(2)} ms` : ps >= 1e6 ? `${+(ps / 1e6).toFixed(2)} µs` : `${+(ps / 1e3).toFixed(1)} ns`);

// one run: the system built, run to END; its rate (simulated ms per second), its windows, the bytes a received back
async function measure({ busy, ...opts }) {
  const a = await uartNode('compiled', { hz: 50e6, baud: BAUD }), b = await NODE_KINDS[B_KIND]();
  const sys = uartSystem({ a, b, baud: BAUD, twoWay: true, press: busy ? 1e9 : null, ...opts });
  const t0 = now();
  sys.run(END);
  const s = (now() - t0) / 1000;
  return {
    rate: END / 1e9 / s, windows: sys.stats.windows, late: sys.stats.late,
    bytes: bytesOf(sys.links.get('ba').sent, BAUD, END).length, warnings: sys.messages('warning').length + sys.messages('error').length,
  };
}

// the nodes alone: the same cycles in one compiled run each
async function alone() {
  const ma = await uartModel({ hz: 50e6, baud: BAUD }), mb = await uartModel({ hz: 40e6, baud: BAUD });
  const sa = new CompiledSim(ma.model), sb = new CompiledSim(mb.model);
  sa.set('rx', 1); sb.set('rx', 1);
  const t0 = now();
  sa.cycle(Math.floor(END / 20000));
  sb.cycle(Math.floor(END / 25000));
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
rows.push({ what: 'the two compiled nodes alone (no scheduler, links idle)', quantum: '—', ...(await alone()) });
for (const wide of [BIT / 16, BIT, 10 * BIT, 100e6, 1e9]) await row('links idle, adaptive', `wide ${fmt(wide)}`, { busy: false, wide });
for (const div of [4, 16, 64]) await row('links busy, adaptive', `fine bit/${div} (${fmt(BIT / div)})`, { busy: true, fine: BIT / div });
for (const lat of [BIT / 16, BIT, 10 * BIT]) {
  await row('links idle, latency', `${fmt(lat)}`, { busy: false, latency: lat });
  await row('links busy, latency', `${fmt(lat)}`, { busy: true, latency: lat });
}

if (JSON_OUT) console.log(JSON.stringify({ baud: BAUD, ms: MS, b: B_KIND, alone: ref.rate, rows }));
else {
  console.log(`Two uart nodes (a: compiled, 50 MHz; b: ${B_KIND}, 40 MHz), a UART both ways at ${BAUD} baud, ${MS} ms simulated:`);
  console.log('| run | quantum | simulated ms / s | windows | bytes back | late |');
  console.log('|---|---|---:|---:|---:|---:|');
  for (const r of rows) console.log(`| ${r.what} | ${r.quantum} | ${r.rate.toFixed(1)} | ${r.windows ?? '—'} | ${r.bytes ?? '—'} | ${r.late ?? '—'} |`);
}
