// Circuits for the tests of the digital circuits (#3897): a half adder on a breadboard, and a bench for one IC beside it
// (its supply wired to its VCC and GND, a logic switch on each gate input, an LED on each output).
import { newCircuit, normalizeCircuit } from '../core/circuit.js';
import { partDef, partPins } from '../core/circuit-parts.js';

/** The half adder on a half breadboard: a 7486 (U1, from f5) and a 7408 (U2, from f14), switches a and b, LEDs s and c. */
export function halfAdder(lang = 'vhdl') {
  const m = newCircuit('half_adder', lang);
  m.parts.push({ id: 'U1', type: '7486', x: 4, y: 7 }, { id: 'U2', type: '7408', x: 13, y: 7 },
    { id: 'S1', type: 'logic-switch', x: -6, y: 9, label: 'a' }, { id: 'S2', type: 'logic-switch', x: -6, y: 10, label: 'b' },
    { id: 'D1', type: 'led', x: 24, y: 2, label: 's' }, { id: 'D2', type: 'led', x: 26, y: 2, label: 'c' });
  const W = (id, ...points) => m.wires.push({ id, points, color: 'blue' });
  // the ICs' VCC (pin 14, row e) to the top + rail, their GND (pin 7, row f–j) to the bottom − rail, the two − rails joined
  W('wv1', [4, 3], [4, -4]); W('wg1', [10, 9], [10, 14]); W('wv2', [13, 3], [13, -4]); W('wg2', [19, 9], [19, 14]); W('wgg', [29, -3], [29, 14]);
  // a to both ICs' pin 1, b to their pin 2 (a bend on the way)
  W('wa1', [-6, 9], [4, 9]); W('wa2', [4, 10], [13, 10]); W('wb1', [-6, 10], [-5, 10], [-5, 11], [5, 11]); W('wb2', [5, 8], [14, 8]);
  // the XOR's 1Y (pin 3) to s's anode, the AND's to c's; the cathodes to the top − rail
  W('ws', [6, 9], [6, 12], [24, 12], [24, 4]); W('wc', [15, 10], [26, 3]); W('wk1', [25, 1], [25, -3]); W('wk2', [27, 1], [27, -3]);
  return normalizeCircuit(m);
}

/**
 * One IC beside nothing: its pin 1 at (0, 0), the supply at (-20, -20) wired to its VCC and GND (unless `power` is
 * false), a logic switch per gate input (label g<gate><a|b>), an LED per output (g<gate>y) its cathode on GND.
 */
export function icBench(type, { power = true, name = 'bench' } = {}) {
  const d = partDef(type);
  const m = newCircuit(name, 'vhdl', { breadboard: false });
  const ic = { id: 'U1', type, x: 0, y: 0 };
  m.parts.push(ic, { id: 'P1', type: 'supply', x: -20, y: -20 });
  const pin = new Map(partPins(ic).map((q) => [q.n, [q.x, q.y]]));
  let w = 0;
  const W = (...points) => m.wires.push({ id: `w${++w}`, points, color: 'blue' });
  if (power) { W([-20, -20], pin.get(14)); W([-20, -19], pin.get(7)); }
  d.gates.forEach((g, i) => {
    g.ins.forEach((n, j) => { const id = `S${i + 1}${'ab'[j]}`; m.parts.push({ id, type: 'logic-switch', x: -40, y: 4 * i + j, label: `g${i + 1}${'ab'[j]}` }); W([-40, 4 * i + j], pin.get(n)); });
    m.parts.push({ id: `D${i + 1}`, type: 'led', x: 20 + 3 * i, y: 10, label: `g${i + 1}y` });
    W(pin.get(g.out), [20 + 3 * i, 10]);
    W([21 + 3 * i, 10], [-20, -19]);
  });
  return normalizeCircuit(m);
}

/** A circuit's VHDL or Verilog test bench: each vector's inputs applied, the outputs written `ns` later (one line of bits per vector). */
export function circuitBench(m, vectors, { ins, outs, ns = 100 }) {
  const L = ['`timescale 1ns / 1ps', 'module tb;', `  reg ${ins.join(', ')};`, `  wire ${outs.join(', ')};`,
    `  ${m.name} dut (${[...ins, ...outs].map((n) => `.${n}(${n})`).join(', ')});`, '  initial begin'];
  for (const v of vectors) L.push(`    ${ins.map((n) => `${n} = 1'b${v[n]};`).join(' ')} #${ns} $display("%b", {${outs.join(', ')}});`);
  L.push('    $finish;', '  end', 'endmodule');
  return L.join('\n');
}
