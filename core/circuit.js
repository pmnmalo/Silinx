// A digital circuit (#3897, docs/CIRCUITS.md): the document <name>.circ.json, real ICs, switches, buttons and LEDs on
// breadboards or beside them, wired on a 0.1 inch grid. Its model here (normalized, a new one, its ports); its parts:
// core/circuit-parts.js; its nets: core/circuit-net.js; its checks: core/circuit-check.js; its simulation:
// core/circuit-sim.js; its HDL: core/circuit-hdl.js. Isomorphic module (browser + Node).
import { partDef, LED_COLORS, WIRE_COLORS } from './circuit-parts.js';

export const CIRCUIT_FORMAT = 'silinx-circuit';
export const CIRCUIT_RE = /\.circ\.json$/i;
export const isCircuit = (path) => CIRCUIT_RE.test(String(path || ''));

const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const ident = (s, d) => (/^[A-Za-z][A-Za-z0-9_]*$/.test(String(s ?? '')) ? String(s) : d);

/** The circuit normalized: every field there, its numbers whole grid steps, the unknown fields dropped. */
export function normalizeCircuit(m = {}) {
  const parts = (Array.isArray(m.parts) ? m.parts : []).filter((p) => p && typeof p === 'object').map((p) => {
    const out = { id: String(p.id ?? ''), type: String(p.type ?? ''), x: int(p.x), y: int(p.y) };
    const r = ((int(p.rot) % 4) + 4) % 4;
    if (r) out.rot = r;
    const d = partDef(out.type);
    if (p.label != null && p.label !== '') out.label = String(p.label);
    if (d?.type === 'logic-switch') out.on = !!p.on;
    if (d?.type === 'led') out.color = LED_COLORS.includes(p.color) ? p.color : 'red';
    return out;
  });
  const wires = (Array.isArray(m.wires) ? m.wires : []).filter((w) => w && Array.isArray(w.points)).map((w) => ({
    id: String(w.id ?? ''),
    points: w.points.filter((q) => Array.isArray(q) && q.length >= 2).map(([x, y]) => [int(x), int(y)]),
    color: WIRE_COLORS.includes(w.color) ? w.color : 'blue',
  })).filter((w) => w.points.length >= 2);
  const out = { format: CIRCUIT_FORMAT, version: 1, name: ident(m.name, 'circuit'), lang: m.lang === 'verilog' ? 'verilog' : 'vhdl' };
  if (m.description) out.description = String(m.description);
  out.parts = parts;
  out.wires = wires;
  if (m.generatedFile) out.generatedFile = String(m.generatedFile);
  return out;
}

/** A new circuit: empty, or (`breadboard`) a half breadboard with its supply on the top rails' left. */
export function newCircuit(name = 'circuit', lang = 'vhdl', { breadboard = true } = {}) {
  const parts = breadboard ? [{ id: 'BB1', type: 'breadboard-half', x: 0, y: 0 }, { id: 'P1', type: 'supply', x: -4, y: -4 }] : [];
  // the supply's terminals joined to the top rails (+ to tp, − to tn) by two wires
  const wires = breadboard ? [{ id: 'w1', points: [[-4, -4], [0, -4]], color: 'red' }, { id: 'w2', points: [[-4, -3], [0, -3]], color: 'black' }] : [];
  return normalizeCircuit({ name, lang, parts, wires });
}

/** A new id for a part of this type (U for an IC, S a switch, B a button, D an LED, BB a breadboard, P a supply), or a wire. */
export function newId(m, typeOrWire) {
  const d = partDef(typeOrWire);
  const pfx = typeOrWire === 'wire' ? 'w' : { ic: 'U', input: d?.type === 'button' ? 'B' : 'S', output: 'D', breadboard: 'BB', supply: 'P' }[d?.kind] || 'X';
  const used = new Set([...m.parts.map((p) => p.id.toLowerCase()), ...m.wires.map((w) => w.id.toLowerCase())]);
  let k = 1;
  while (used.has(`${pfx}${k}`.toLowerCase())) k++;
  return `${pfx}${k}`;
}

/** A part's name as the HDL and the messages say it: its label, else its id. */
export const portName = (p) => p.label || p.id;

/** The circuit's ports: its inputs (logic switches, buttons) and outputs (LEDs), in the parts' order. */
export function circuitPorts(m) {
  const ins = [], outs = [];
  for (const p of m.parts) {
    const t = p.type;
    if (t === 'logic-switch' || t === 'button') ins.push({ name: portName(p), part: p.id, type: t });
    else if (t === 'led') outs.push({ name: portName(p), part: p.id, type: t });
  }
  return { inputs: ins, outputs: outs };
}

/** The circuit's counts, as its status line says them: "2 ICs · 3 switches · 2 LEDs · 9 wires". */
export function circuitCounts(m) {
  const n = (f) => m.parts.filter(f).length;
  const ics = n((p) => partDef(p.type)?.kind === 'ic'), sw = n((p) => partDef(p.type)?.kind === 'input'), leds = n((p) => p.type === 'led');
  return `${ics} IC(s) · ${sw} switch(es) · ${leds} LED(s) · ${m.wires.length} wire(s)`;
}
