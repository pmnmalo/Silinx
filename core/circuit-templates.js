// The Digital Electronic Circuit Wizard's assemblies (#4061, New Source ▸ Digital Electronic Circuit ▸ Wizard >, the MCP
// server's new_source template): a circuit to start from, as a bench is set up before the chips go in.
//   - boards: N breadboards (half or full) one under the other, the supply on the first one's top rails, every board's
//     + rails joined and its − rails joined (a full board's halves too), and each board's to the next one's;
//   - io: a half breadboard and its supply, N logic switches in row a (their columns the inputs, sw[0]…) and M LEDs in
//     row h, their cathodes on the − rail (their anodes' columns the outputs, led[0]…), the chips to go between.
// (No empty one, #4161: New Source without the wizard makes a half breadboard and its supply.)
// Its list is the template page's (core/chart-templates.js CIRCUIT_TEMPLATES). Isomorphic module.
import { normalizeCircuit } from './circuit.js';
import { partDef, BB_RAILS } from './circuit-parts.js';

const N = (key, label, def, min, max) => ({ key, label, def, min, max });
export const CIRCUIT_TEMPLATES = [
  { id: 'boards', label: 'Breadboards and a supply', text: 'N breadboards one under the other, the power supply on the first one\'s top rails; on every board the + rails joined and the − rails joined, and each board\'s rails to the next one\'s.',
    params: [N('n', 'Breadboards (N):', 1, 1, 4), { key: 'size', label: 'Size:', def: 'half', options: [['half', 'Half (30 columns)'], ['full', 'Full (63 columns)']] }] },
  { id: 'io', label: 'Switches and LEDs', text: 'A half breadboard and its supply, N logic switches in row a (their columns the inputs sw[0]…) and M LEDs in row h, their cathodes on the − rail (their anodes\' columns the outputs led[0]…): the chips go in between.',
    params: [N('n', 'Switches (N):', 4, 1, 8), N('m', 'LEDs (M):', 4, 1, 8)] },
];

const GAP = 24;   // (a board's rows from its rails tp, -4, to bp, 15, and the room between two boards)

/** The circuit of the template `id` with its parameters (as typed), named `name`, its HDL in `lang`. */
export function circuitTemplate(id, params = {}, { name = 'circuit', lang = 'vhdl' } = {}) {
  const parts = [], wires = [];
  let w = 0;
  const W = (color, ...points) => wires.push({ id: `w${++w}`, points, color });
  if (!CIRCUIT_TEMPLATES.some(t => t.id === id)) throw new Error(`template: one of ${CIRCUIT_TEMPLATES.map(t => t.id).join(', ')}`);
  const n = id === 'boards' ? Math.max(1, Math.min(4, Math.round(Number(params.n) || 1))) : 1;
  const type = id === 'boards' && params.size === 'full' ? 'breadboard-full' : 'breadboard-half';
  const { cols, split } = partDef(type);
  parts.push({ id: 'P1', type: 'supply', x: -4, y: -4 });
  // the supply's terminals to the first board's top rails (+ to tp, − to tn)
  W('red', [-4, -4], [0, -4]); W('black', [-4, -3], [0, -3]);
  for (let k = 0; k < n; k++) {
    const y = k * GAP, r = (rail) => y + BB_RAILS[rail];
    parts.push({ id: `BB${k + 1}`, type, x: 0, y });
    // a full board's rails' two halves joined (a jumper across the split)
    if (split) for (const [rail, c] of [['tp', 'red'], ['tn', 'black'], ['bn', 'black'], ['bp', 'red']]) W(c, [split - 1, r(rail)], [split, r(rail)]);
    // its top and bottom rails joined on its right: + to +, − to −
    W('red', [cols - 1, r('tp')], [cols + 1, r('tp')], [cols + 1, r('bp')], [cols - 1, r('bp')]);
    W('black', [cols - 1, r('tn')], [cols, r('tn')], [cols, r('bn')], [cols - 1, r('bn')]);
    // to the next board: its bottom + to the next one's top +, its bottom − to the next one's top − (on the left)
    if (k + 1 < n) { W('red', [0, r('bp')], [0, r('tp') + GAP]); W('black', [1, r('bn')], [-1, r('bn')], [-1, r('tn') + GAP], [1, r('tn') + GAP]); }
  }
  if (id === 'io') {
    const ns = Math.max(1, Math.min(8, Math.round(Number(params.n) || 4))), nl = Math.max(1, Math.min(8, Math.round(Number(params.m) || 4)));
    // the switches in row a, 3 columns apart (their bodies to the left of their pins); the LEDs in row h, their cathodes to bn
    for (let k = 0; k < ns; k++) parts.push({ id: `S${k + 1}`, type: 'logic-switch', x: 2 + 3 * k, y: 0, label: `sw[${k}]` });
    for (let k = 0; k < nl; k++) {
      parts.push({ id: `D${k + 1}`, type: 'led', x: 2 + 3 * k, y: 9, label: `led[${k}]` });
      W('black', [3 + 3 * k, 11], [3 + 3 * k, BB_RAILS.bn]);
    }
  }
  return normalizeCircuit({ name, lang, parts, wires });
}
