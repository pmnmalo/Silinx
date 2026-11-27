// Test helper (not a test file): Systems of the `uart` example's modules (examples/uart/src) for the
// co-simulation scheduler (core/system-sim.js), its tests (test/system-sim.test.js) and its benchmark
// (scripts/bench-system-sim.mjs). The `uart` design echoes each byte it receives on rx back on tx, and sends
// "Hello from Silinx!" CR LF when its button is pressed.
//
//   const a = await uartNode('compiled', { hz: 50e6, baud: 1e6 });
//   const sys = uartSystem({ a, b, baud: 1e6 });   // a.tx -> b.rx (and b.tx -> a.rx when twoWay)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './examples-lib.mjs';
import { designOf } from './compiled-diff.js';
import { netlistOf } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { UartDecoder } from '../core/uart.js';
import { SystemSim } from '../core/system-sim.js';
import { CompiledNode, compiledNodeModel } from '../core/system-sim-compiled.js';
import { EventNode } from '../core/system-sim-event.js';

export const MESSAGE = [...'Hello from Silinx!\r\n'].map((c) => c.charCodeAt(0));

const SRC = ['uart_rx.vhd', 'uart_tx.vhd', 'debounce.vhd', 'sevenseg.vhd', 'uart.vhd'];
export const uartSources = () => SRC.map((f) => ({ path: `src/${f}`, lang: 'vhdl', role: 'design', text: fs.readFileSync(path.join(ROOT, 'examples/uart/src', f), 'utf8') }));

/** The uart top's generics for a clock of hz and a rate of baud (the button's debounce and the display short). */
export const uartGenerics = ({ hz = 50e6, baud = 9600, stable = 4, refresh = 64 } = {}) => ({ CLK_HZ: hz, BAUD: baud, STABLE: stable, REFRESH: refresh });

/** The elaborated uart design (a new one: the event-driven simulator changes its signals). */
export const uartDesign = (o) => designOf(uartSources(), 'uart', { generics: uartGenerics(o) });

const netlists = new Map();
/** The uart design's word-level netlist, compiled with its pins watched: { model, pins } (Yosys once per generics). */
export async function uartModel(o = {}, pins = ['tx']) {
  const { json, top } = await uartNetlist(o);
  return compiledNodeModel(json, { top, clock: 'clk', pins });
}
/** The uart design's word-level netlist: { json, top } (Yosys once per generics). */
export async function uartNetlist(o = {}) {
  const key = JSON.stringify(uartGenerics(o));
  if (!netlists.has(key)) netlists.set(key, await netlistOf(uartDesign(o), { run: yosysNode }));
  return netlists.get(key);
}

/** A uart node: kind 'compiled' (CompiledNode) or 'event' (EventNode); its clock at hz. */
export async function uartNode(kind, o = {}, pins = ['tx']) {
  const period = Math.round(1e12 / (o.hz ?? 50e6));
  if (kind === 'compiled') return new CompiledNode({ ...(await uartModel(o, pins)), period });
  if (kind === 'event') return new EventNode({ design: uartDesign(o), clocks: [{ port: 'clk', period }], pins });
  throw new Error(`no node of kind '${kind}'`);
}

/**
 * Two uart nodes linked by a UART: a.tx -> b.rx (the link 'ab'), b.tx -> a.rx ('ba') when twoWay, else a's rx idle at 1;
 * a's button pressed at press (ps) for 2 µs: a sends the message; latency: the links' fixed one (exact; null: adaptive).
 * bPins: b's UART pins (an AVR's D1 and D0, #5912). opts: the scheduler's (wide, fine, adaptive).
 */
export function uartSystem({ a, b, baud, twoWay = false, press = 10e6, latency = null, bPins = { tx: 'tx', rx: 'rx' }, ...opts }) {
  const sys = new SystemSim(opts);
  sys.addNode('a', a);
  sys.addNode('b', b);
  sys.link({ name: 'ab', from: 'a.tx', to: `b.${bPins.rx}`, kind: 'uart', baud, latency });
  if (twoWay) sys.link({ name: 'ba', from: `b.${bPins.tx}`, to: 'a.rx', kind: 'uart', baud, latency });
  else a.setPin('rx', 1);
  if (press != null) {
    sys.at(press, () => a.setPin('btn', 1));
    sys.at(press + 2e6, () => a.setPin('btn', 0));
  }
  return sys;
}

/** The bytes of a link's changes ([t, level…], ps) up to `end`, decoded at baud: [{ byte, error }]. */
export function bytesOf(changes, baud, end) {
  const d = new UartDecoder(1e12 / baud);
  d.feed(changes);
  d.flush(end);
  return d.bytes();
}
