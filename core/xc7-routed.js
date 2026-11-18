// Silinx - the 7-series' routed design as Silinx's UNISIM models take it (#4362): nextpnr-himbaechel-xilinx's --write JSON is
// made of its sites' cells (SLICE_LUTX, SLICE_FFX, IOB33_INBUF_EN, RAMB18E1_RAMB18E1 …), each with the cell synthesis wrote
// (X_ORIG_TYPE: LUT6, FDRE, IBUF, RAMB18E1 …) and the pin of it each site pin is (X_ORIG_PORT_<pin>: I0, DI[2] …), which
// make it that cell again (packages/silinx-hdl/src/unisim.js, unisim-s6.js, unisim-xc7.js model them):
//   - the pins: each site pin named as the cell's (a bit of a vector gathered again into it, two site pins of one bit the same
//     net), the site's pins of no cell pin left out (a LUT's A6 tied high, a block RAM's ADDRATIEHIGH); a vector's bit with no
//     site pin is open (an unknown, and an input of no default whose site pins are all open), but the DSP's tied to a constant (DSP_GND_PINS / DSP_VCC_PINS);
//   - the inversions: nextpnr ties a constant input to the other constant and inverts it (IS_<pin>[<bit>]_INVERTED, the
//     site's), folded back into the constant; on a net, the cell's IS_<pin>_INVERTED generic where its model has it;
//   - a carry chain's head: its CYINIT, a constant, the slice's (X_PRECYINIT C0 or C1), not a pin's;
//   - the parameters: those the model declares (the others nextpnr's: a LUT's INIT is the cell's, on its I pins, in 32 or 64
//     bits: its own 2^k kept);
//   - the cells nextpnr makes: PSEUDO_VCC and PSEUDO_GND (their nets the constants), PAD (its net the port's: left out), the
//     global buffer BUFGCTRL of a BUFG (a BUFG again), a distributed RAM's RAMD32 (a bit of RAM32M: a RAM32X1D, its read
//     address DPRA, its write address A).
//
// Isomorphic ES module (browser + Node), no DOM.
import { UNISIM_VHDL } from './unisim.js';

const text = (v) => (typeof v === 'string' ? v : new TextDecoder().decode(v));

// the text inside the parentheses that open at `i` (its '(')
function inParens(s, i) {
  for (let d = 0, j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')' && --d === 0) return s.slice(i + 1, j);
  }
  return '';
}
// a clause's declarations (split at the semicolons outside parentheses)
const declarations = (clause) => clause.replace(/--[^\n]*/g, '').split(';').map((d) => d.trim()).filter(Boolean);

// the UNISIM models: name -> { generics: Set, ports: Map(port -> its width, 0 a scalar), defaults: Set (the inputs with a
// default) }, from their VHDL
let MODELS = null;
export function unisimModels() {
  if (MODELS) return MODELS;
  MODELS = new Map();
  for (const m of UNISIM_VHDL.matchAll(/^entity\s+(\w+)\s+is\b([\s\S]*?)^end\s+\1\s*;/gim)) {
    const body = m[2], g = /\bgeneric\s*\(/i.exec(body), p = /\bport\s*\(/i.exec(body);
    const generics = new Set(), ports = new Map(), defaults = new Set();
    for (const d of declarations(g ? inParens(body, g.index + g[0].length - 1) : '')) {
      for (const n of d.split(':')[0].split(',')) generics.add(n.trim().toUpperCase());
    }
    for (const d of declarations(p ? inParens(body, p.index + p[0].length - 1) : '')) {
      const x = /^([\w\s,]+?)\s*:\s*(?:in|out|inout)\s+\w+(?:\s*\(\s*(\d+)\s+downto\s+0\s*\))?/i.exec(d);
      if (!x) continue;
      for (const n of x[1].split(',')) {
        ports.set(n.trim(), x[2] !== undefined ? Number(x[2]) + 1 : 0);
        if (/:=/.test(d)) defaults.add(n.trim());
      }
    }
    MODELS.set(m[1].toUpperCase(), { generics, ports, defaults });
  }
  return MODELS;
}

// the cells nextpnr makes of others: their model and its pins
const AS = {
  BUFGCTRL: { type: 'BUFG', pins: { I0: 'I', O: 'O' } },
  RAMD32: { type: 'RAM32X1D', pins: { ...Object.fromEntries([0, 1, 2, 3, 4].flatMap((i) => [[`RADR${i}`, `DPRA${i}`], [`WADR${i}`, `A${i}`]])), I: 'D', O: 'DPO', CLK: 'WCLK', WE: 'WE' } },
};
const LUT = /^LUT([1-6])$/;
const isOne = (v) => /^0*1$/.test(String(v).trim()) || v === 1;
const flip = (b) => (b === '0' ? '1' : b === '1' ? '0' : b);

/** nextpnr-himbaechel-xilinx's routed design (its JSON) with its cells as Silinx's UNISIM models take them; returns the JSON's
 *  text. Throws on a cell it cannot make a model's (its type, and why). */
export function xc7RoutedCells(routedJson) {
  const j = JSON.parse(text(routedJson)), models = unisimModels();
  for (const m of Object.values(j.modules || {})) {
    let next = Math.max(1, ...Object.values(m.netnames || {}).flatMap((n) => n.bits.filter((b) => typeof b === 'number'))) + 1;
    // the constants' nets
    const konst = new Map();
    for (const [n, c] of Object.entries(m.cells || {})) {
      if (c.type !== 'PSEUDO_VCC' && c.type !== 'PSEUDO_GND') continue;
      for (const b of c.connections.Y || []) konst.set(b, c.type === 'PSEUDO_VCC' ? '1' : '0');
      delete m.cells[n];
    }
    const bit = (b) => (konst.has(b) ? konst.get(b) : b);
    for (const nn of Object.values(m.netnames || {})) nn.bits = nn.bits.map(bit);
    for (const [n, c] of Object.entries(m.cells || {})) {
      if (c.type === 'PAD') { delete m.cells[n]; continue; }
      const orig = c.attributes?.X_ORIG_TYPE;
      if (!orig) throw new Error(`the routed design's cell ${n} (${c.type}) has no cell of the synthesis (X_ORIG_TYPE): Silinx has no model of it`);
      const as = AS[orig], type = as ? as.type : orig, model = models.get(type);
      if (!model) throw new Error(`the routed design's cell ${n} is a ${orig}, which Silinx's UNISIM models do not model`);
      // the inverted pins (IS_<pin>[<bit>]_INVERTED, the cell's pins' names)
      const inverted = new Set(Object.entries(c.parameters || {}).filter(([k, v]) => /^IS_.+_INVERTED$/.test(k) && isOne(v)).map(([k]) => k.slice(3, -9)));
      const tied = (list) => new Set(String(c.attributes?.[list] || '').trim().split(/\s+/).filter(Boolean));
      const gnd = tied('DSP_GND_PINS'), vcc = tied('DSP_VCC_PINS');
      const conns = {}, dirs = {}, invGenerics = {}, open = new Set();
      for (const [pin, bits] of Object.entries(c.connections || {})) {
        let o = c.attributes?.[`X_ORIG_PORT_${pin}`];
        if (o === undefined) continue;
        if (as) { o = as.pins[o]; if (!o) continue; }
        const v = /^(\w+)\[(\d+)\]$/.exec(o), port = v ? v[1] : o, i = v ? Number(v[2]) : 0;
        if (!model.ports.has(port)) throw new Error(`the routed design's ${type} ${n} has a pin ${o} its model has not`);
        let b = bits.length ? bit(bits[0]) : gnd.has(pin) ? '0' : vcc.has(pin) ? '1' : undefined;
        if (b === undefined) { if (c.port_directions?.[pin] !== 'output') open.add(port); continue; }
        if (inverted.has(o)) {
          if (b === '0' || b === '1') b = flip(b);
          else if (model.generics.has(`IS_${port}_INVERTED`)) (invGenerics[port] ??= new Set()).add(i);
          else throw new Error(`the routed design's ${type} ${n} has its pin ${o} inverted, which its model does not take`);
        }
        (conns[port] ??= [])[i] = b;
        dirs[port] = c.port_directions?.[pin] || 'input';
      }
      // (the vectors' open bits: an input's an unknown, an output's a net of its own)
      for (const [port, bs] of Object.entries(conns)) {
        const w = model.ports.get(port) || 1;
        conns[port] = Array.from({ length: w }, (_, k) => (bs[k] !== undefined ? bs[k] : dirs[port] === 'output' ? next++ : 'x'));
      }
      const params = {};
      for (const [k, val] of Object.entries(c.parameters || {})) if (!/^IS_.+_INVERTED$/.test(k) && model.generics.has(k.toUpperCase())) params[k] = val;
      for (const [port, bits] of Object.entries(invGenerics)) {
        const w = model.ports.get(port) || 1;
        params[`IS_${port}_INVERTED`] = Array.from({ length: w }, (_, k) => (bits.has(w - 1 - k) ? '1' : '0')).join('');
      }
      // (an input whose site pins are all open, with no default: an unknown, the unused top of a carry chain, a RAM32M's
      // unused bit)
      for (const port of open) if (!conns[port] && !model.defaults.has(port)) { conns[port] = Array(model.ports.get(port) || 1).fill('x'); dirs[port] = 'input'; }
      // (a carry chain's head: its CYINIT a constant of the slice's, X_PRECYINIT C0 or C1)
      const pre = /^C([01])$/.exec(c.attributes?.X_PRECYINIT || '');
      if (type === 'CARRY4' && pre && !conns.CYINIT) conns.CYINIT = [pre[1]];
      const lut = LUT.exec(type);
      if (lut && typeof params.INIT === 'string') params.INIT = params.INIT.slice(-(2 ** Number(lut[1]))).padStart(2 ** Number(lut[1]), '0');
      if (type === 'RAM32X1D' && typeof params.INIT === 'string') params.INIT = params.INIT.slice(-32).padStart(32, '0');
      c.type = type;
      c.parameters = params;
      c.connections = conns;
      c.port_directions = dirs;
    }
  }
  return JSON.stringify(j);
}
