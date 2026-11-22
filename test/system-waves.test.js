// The co-design system's waves (core/system-waves.js, #4699): a scope per node with its linked pins (an output as it
// drove its link, an input as its link reached it), a scope `links` with each link's named signal; unknown levels as x;
// the system's VCD read back (core/vcd.js) with the scheduler's changes; an AVR and the uart example's FPGA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemWaves, systemVcd } from '../core/system-waves.js';
import { readVcd } from '../core/vcd.js';
import { SystemSim } from '../core/system-sim.js';
import { AvrNode, loadAvr8js } from '../core/system-sim-avr.js';
import { echoProgram } from './avr-asm.mjs';
import { uartNode } from './system-sim-lib.mjs';
import * as V from '../core/values.js';

await loadAvr8js();   // (avr8js, before an AvrNode is made: core/system-sim-avr.js, #4701)

// the changes as the waves keep them: a value null for unknown, a change to the same value dropped, the last of a time
function kept(changes) {
  const out = [];
  for (let i = 0; i < changes.length; i += 2) {
    const v = changes[i + 1] == null ? null : changes[i + 1] ? 1 : 0;
    if (out.length && out.at(-1) === v) continue;
    if (out.length && out.at(-2) === changes[i]) { out[out.length - 1] = v; continue; }
    out.push(changes[i], v);
  }
  return out;
}

async function avrFpga() {
  const sys = new SystemSim();
  sys.addNode('uno', new AvrNode({ firmware: { program: echoProgram() } }));
  sys.addNode('fpga', await uartNode('compiled', { hz: 50e6, baud: 9600 }));
  sys.link({ name: 'uart_avr_tx', from: 'uno.D1', to: 'fpga.rx', kind: 'uart', baud: 9600, latency: 1e6 });
  sys.link({ name: 'uart_avr_rx', from: 'fpga.tx', to: 'uno.D0', kind: 'uart', baud: 9600, latency: 1e6 });
  sys.run(3e9);
  return sys;
}

test('the waves: a scope per node and the links\', each pin\'s wave its link\'s changes', async () => {
  const sys = await avrFpga();
  const { design } = systemWaves(sys);
  assert.equal(design.top.name, 'system');
  assert.deepEqual(design.top.children.map((c) => [c.name, c.signals.map((s) => s.name)]), [['uno', ['D1', 'D0']], ['fpga', ['rx', 'tx']], ['links', ['uart_avr_tx', 'uart_avr_rx']]]);
  assert.equal(design.signals.length, 6);
  const tx = sys.links.get('uart_avr_tx');
  const [D1] = design.top.children[0].signals, [rx] = design.top.children[1].signals;
  assert.deepEqual(D1.wave.t, kept(tx.sent).filter((_, i) => i % 2 === 0));
  assert.equal(V.toBin(D1.wave.v[0]), 'x', 'D1 floating before the USART is enabled');
  assert.equal(V.toBin(D1.wave.v[1]), '1');
  assert.equal(rx.wave.t[1], D1.wave.t[1] + 1e6, 'the FPGA\'s rx: its link\'s latency later');
  assert.equal(systemWaves(sys, { name: 'uart_avr' }).design.top.name, 'uart_avr');
});

test('the system\'s VCD read back: every signal with the scheduler\'s changes, no warnings', async () => {
  const sys = await avrFpga();
  const r = readVcd(systemVcd(sys));
  assert.equal(r.timescale, '1ps');
  assert.deepEqual([...r.signals.keys()], ['system.uno.D1', 'system.uno.D0', 'system.fpga.rx', 'system.fpga.tx', 'system.links.uart_avr_tx', 'system.links.uart_avr_rx']);
  const tx = sys.links.get('uart_avr_tx'), back = sys.links.get('uart_avr_rx');
  assert.deepEqual(r.signals.get('system.uno.D1').changes, kept(tx.sent));
  assert.deepEqual(r.signals.get('system.links.uart_avr_tx').changes, kept(tx.sent));
  assert.deepEqual(r.signals.get('system.fpga.rx').changes, kept(tx.trace));
  assert.deepEqual(r.signals.get('system.fpga.tx').changes, kept(back.sent));
  assert.deepEqual(r.signals.get('system.uno.D0').changes, kept(back.trace));
  assert.ok(r.signals.get('system.fpga.tx').changes.length > 20, 'the FPGA\'s echoes');
  assert.deepEqual(sys.messages('warning'), []);
});

test('a link to two nodes, a system with no links', () => {
  const pin = (outputs, inputs) => ({ now: 0, outputs, inputs, advanceTo: () => [], setPin() {}, value: () => 1, nextEventTime: () => Infinity, messages: () => [] });
  const sys = new SystemSim();
  sys.addNode('a', pin(['q'], []));
  sys.addNode('b', pin([], ['d']));
  sys.addNode('c', pin([], ['d']));
  sys.link({ name: 'bus', from: 'a.q', to: ['b.d', 'c.d'] });
  sys.run(1e6);
  const r = readVcd(systemVcd(sys));
  assert.deepEqual([...r.signals].map(([k, s]) => [k, s.changes]), [['system.a.q', [0, 1]], ['system.b.d', [0, 1]], ['system.c.d', [0, 1]], ['system.links.bus', [0, 1]]]);
  const empty = new SystemSim();
  assert.deepEqual([...readVcd(systemVcd(empty)).signals], []);
});
