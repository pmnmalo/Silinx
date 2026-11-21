// Silinx - the Gowin's routed design as Silinx's models of its cells take it (#4362): nextpnr-himbaechel-gowin's --write JSON
// names some cells and pins as the chip does, not as synth_gowin wrote them (packages/silinx-hdl/src/gowin-prims.js models
// those):
//   - a vector pin is a pin a bit (a block RAM's AD0 … AD13, a multiplier's A0 … A17): gathered again into the model's
//     vector, an open bit an unknown (an input) or a net of its own (an output), a vector with no bit connected left open
//     (its default);
//   - the block RAMs are SP and DP whatever their width: SPX9 and DPX9B again when their BIT_WIDTH is 9, 18 or 36, DPB the
//     DP of 1 … 16 bits;
//   - pins the chip has and the model has not, all of them tied to a constant or a copy of the model's own: the single-port
//     RAM's port B (its port A's), the distributed RAM's CE (1), an output buffer's BOTTOM_IO_PORT_A / B (0): left out.
//
// Isomorphic ES module (browser + Node), no DOM.
import { GOWIN_VHDL } from './gowin-prims.js';
import { vhdlModels } from './vhdl-models.js';

const text = (v) => (typeof v === 'string' ? v : new TextDecoder().decode(v));

// the models' ports: name -> Map(port -> its width, 0 a scalar), from their VHDL
let PORTS = null;
function ports() {
  if (PORTS) return PORTS;
  PORTS = new Map([...vhdlModels(GOWIN_VHDL)].map(([name, m]) => [name, m.ports]));
  return PORTS;
}

// a parameter as a number (Yosys's JSON: a string of its 32 bits, or a number)
const num = (v) => (typeof v === 'number' ? v : /^[01]+$/.test(String(v)) ? parseInt(v, 2) : Number(v));
const X9 = new Set([9, 18, 36]);
// a block RAM's model: nextpnr's SP and DP by their width
function bsramType(c) {
  if (c.type === 'SP') return X9.has(num(c.parameters?.BIT_WIDTH)) ? 'SPX9' : 'SP';
  if (c.type === 'DP') return X9.has(num(c.parameters?.BIT_WIDTH_0)) ? 'DPX9B' : 'DPB';
  return c.type;
}

/** nextpnr-himbaechel-gowin's routed design (its JSON) with its cells as Silinx's models take them; returns the JSON's text. */
export function gowinRoutedCells(routedJson) {
  const j = JSON.parse(text(routedJson)), models = ports();
  for (const m of Object.values(j.modules || {})) {
    let next = Math.max(1, ...Object.values(m.netnames || {}).flatMap((n) => n.bits.filter((b) => typeof b === 'number'))) + 1;
    for (const c of Object.values(m.cells || {})) {
      const type = bsramType(c), model = models.get(type);
      if (!model) continue;
      c.type = type;
      const conns = {}, dirs = {};
      for (const [p, w] of model) {
        if (p in c.connections) { conns[p] = c.connections[p]; dirs[p] = c.port_directions?.[p] || 'input'; continue; }
        if (!w) continue;
        const bits = Array.from({ length: w }, (_, i) => c.connections[`${p}${i}`]?.[0]);
        if (bits.every((b) => b === undefined)) continue;
        const out = c.port_directions?.[`${p}${bits.findIndex((b) => b !== undefined)}`] === 'output';
        conns[p] = bits.map((b) => (b !== undefined ? b : out ? next++ : 'x'));
        dirs[p] = out ? 'output' : 'input';
      }
      if (globalThis.process?.env?.GW_DEBUG) for (const k of Object.keys(c.connections)) if (!(k in conns) && !Object.keys(conns).some((p) => new RegExp(`^${p}\\d+$`).test(k)) && c.connections[k].length) console.log('DROP', type, k, c.connections[k].join(','));
      c.connections = conns;
      c.port_directions = dirs;
    }
  }
  return JSON.stringify(j);
}
