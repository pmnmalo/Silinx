// Silinx - the compiled simulator's tristate pins (#4709): a top-level inout port, or an output port driven with 'Z',
// as the signals of a pad. Yosys reads `p <= d when oe = '1' else 'Z'` as a $mux whose one side is all 'z' (or a
// $tribuf); on the FPGA it is an output buffer with its enable, and an inout port's input buffer reads the pin back.
// Before the netlist is compiled (compileNetlist) each such port becomes:
//   - its input `p` (an inout port's): the level the outside drives on the pin, set by set('p', v);
//   - its output `p`: the level the design drives, 0 where it does not (get('p'));
//   - its enable `p:en`: which bits it drives (get('p:en'));
// and what the design reads of an inout port is the pin's level: the design's output where it drives the pin, the
// outside's input where it does not. An inout bit no tristate drives is driven always (its enable 1); one nothing
// drives is an input only (its enable 0). A tristate that drives the design's own nets is not a pad's: it stays as
// compileNetlist reads it (its 'Z' as 0, said in a warning), and a $tribuf there a CompileError.
import { CompileError } from './compiled-helpers.js';

const TRI = new Set(['$tribuf', '$_TBUF_']);
const allZ = bits => bits?.length > 0 && bits.every(b => b === 'z');

/** The module with its tristate ports as pads: { mod (a copy, or the module itself when it has none), pads: [{ name,
 *  dir, en: bits }] }. */
export function splitPads(mod, cellName = n => n) {
  const ports = Object.entries(mod.ports || {});
  if (!ports.some(([, p]) => p.direction === 'inout' || p.direction === 'output')) return { mod, pads: [] };
  const cells = mod.cells || {};
  // each bit's tristate driver: { cell, data: the bit it drives, en: its enable bit, low: enabled at 0 }
  const tri = new Map();
  for (const [name, c] of Object.entries(cells)) {
    const C = c.connections || {};
    let data, en, low = false;
    if (c.type === '$mux' && C.S?.length === 1 && (allZ(C.A) || allZ(C.B))) { low = allZ(C.B); data = low ? C.A : C.B; en = C.S[0]; }
    else if (TRI.has(c.type)) { data = C.A; en = (C.EN || C.E)[0]; }
    else continue;
    C.Y.forEach((y, k) => { if (typeof y === 'number') tri.set(y, { cell: name, data: data[k], en, low }); });
  }
  const driven = new Set(Object.values(cells).flatMap(c => Object.entries(c.connections || {})
    .filter(([p]) => (c.port_directions?.[p] ?? (p === 'Y' || p === 'Q' ? 'output' : 'input')) === 'output').flatMap(([, b]) => b)));
  for (const [, p] of ports) if (p.direction === 'input') p.bits.forEach(b => driven.add(b));
  // (an output port that reads an inout port's bits is not a pad of its own)
  const ioBits = new Set(ports.filter(([, p]) => p.direction === 'inout').flatMap(([, p]) => p.bits));
  const pins = ports.filter(([, p]) => p.direction === 'inout' || (p.direction === 'output' && p.bits.some(b => tri.has(b)) && !p.bits.some(b => ioBits.has(b))));
  if (!pins.length) return { mod, pads: [] };

  const numbers = bits => (bits || []).filter(b => typeof b === 'number');
  let top = 1 + Math.max(1, ...[...ports.map(([, p]) => p.bits), ...Object.values(mod.netnames || {}).map(n => n.bits),
    ...Object.values(cells).flatMap(c => Object.values(c.connections || {}))].flatMap(numbers));
  const bit = () => top++;
  const out = { ...mod, ports: { ...mod.ports }, cells: { ...cells } };
  const used = new Set(), pads = [], inverted = new Map();
  const add = (type, C, w = 1) => { out.cells[`$silinx_pad$${Object.keys(out.cells).length}`] = { type, parameters: { WIDTH: w, ...(type === '$not' ? { A_WIDTH: 1, Y_WIDTH: 1, A_SIGNED: 0 } : {}) }, port_directions: {}, connections: C }; };
  const notOf = b => {
    if (b === '0' || b === '1') return b === '0' ? '1' : '0';
    if (!inverted.has(b)) { const y = bit(); add('$not', { A: [b], Y: [y] }); inverted.set(b, y); }
    return inverted.get(b);
  };
  const padBits = new Set(pins.flatMap(([, p]) => p.bits));
  for (const [name, p] of pins) {
    const inout = p.direction === 'inout';
    const input = inout ? p.bits.map(() => bit()) : null;
    const value = [], en = [];
    p.bits.forEach((b, i) => {
      const t = typeof b === 'number' ? tri.get(b) : null;
      let d, e;
      if (t) { d = t.data; e = t.low ? notOf(t.en) : t.en; used.add(t.cell); }
      else if (typeof b === 'number' && driven.has(b)) { d = b; e = '1'; }
      else { d = typeof b === 'number' ? '0' : b; e = inout && typeof b === 'number' ? '0' : '1'; }
      // (its output: the level it drives, 0 where it does not)
      const v = t ? bit() : d;
      if (t) add('$mux', { A: ['0'], B: [d], S: [e], Y: [v] });
      value.push(v);
      en.push(e);
      // (what the design reads: the pin's level)
      if (inout && e !== '1') add('$mux', { A: [input[i]], B: [d], S: [e], Y: [b] });
      else if (!inout && t) add('$mux', { A: ['0'], B: [d], S: [e], Y: [b] });
    });
    if (inout) {
      out.ports[name] = { direction: 'input', bits: input };
      out.ports[`${name}:out`] = { direction: 'output', bits: value };
    }
    out.ports[`${name}:en`] = { direction: 'output', bits: en };
    pads.push({ name, dir: p.direction, en });
  }
  // the tristates the pads read: gone (a tristate that drives a net of the design's too is not a pad's)
  for (const name of used) {
    if (cells[name].connections.Y.some(y => typeof y === 'number' && !padBits.has(y)))
      throw new CompileError(`the tristate '${cellName(name)}' drives a pin and the design's own nets: not compiled`);
    delete out.cells[name];
  }
  return { mod: out, pads };
}
