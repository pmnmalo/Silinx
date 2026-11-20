// A state diagram's schematic: its gate-level implementation, not the RTL (the synthesis' view). The state register a D
// flip-flop per state bit (the diagram's binary or gray encoding), cleared or preset by the reset to the initial state's
// code (FDC / FDP, or FDR / FDS for a synchronous reset; an inverter before them for an active-low one); the next-state
// and the output logic the minimal gates of one truth table (core/logic-sch.js schematicFromTable): inputs the present
// state bits and the inputs, outputs the next-state bits (the flip-flops' D) and the outputs, unused state codes don't
// cares, as the diagram's Create Boolean Algebra writes them (core/fsm.js truthTablesOf). The state and next-state bits
// are net labels (q1, d1…), the clock, the reset, the inputs and the outputs I/O markers (a bus's bits labels of its
// bits, phase(2), #1688). Made when the machine allows it: no errors, an encoding of codes (encodedTable's), at most 16 table inputs;
// else why not. Read-only, shown beside the diagram, and the MCP's related_view. Isomorphic module.
import { normalizeFsm, encodedTable, fsmEncoding } from './fsm.js';
import { schematicFromTable } from './logic-sch.js';
import { joinOnWires, symbolDef, symbolPins } from './schdoc.js';

const MAX_INPUTS = 16;   // (a truth table's, core/logic.js)

/** The state diagram `model`'s schematic: { doc } (a schematic document), or { error } when it cannot be drawn. */
export function fsmSchematic(model) {
  const m = normalizeFsm(model);
  // (the encodings with codes of their own, as Create Boolean Algebra's: encodedTable's)
  const t = encodedTable(m);
  if (t.error) return { error: `No schematic: ${t.error[0].toLowerCase()}${t.error.slice(1)}` };
  const ins = [...t.stateBits, ...t.inputBits], outs = [...t.nextBits, ...t.outputBits];
  if (ins.length > MAX_INPUTS) return { error: `No schematic: a truth table has at most ${MAX_INPUTS} inputs; this machine needs ${ins.length}` };
  const clash = [m.clock, m.reset.name].find((n) => [...ins, ...outs].some((x) => x.toLowerCase() === n.toLowerCase()));
  if (clash) return { error: `No schematic: the signal ${clash} is named as a state bit` };
  const table = {};
  t.nextBits.forEach((n, i) => { table[n] = t.rows.map((r) => r.d[i]).join(''); });
  t.outputBits.forEach((n, i) => { table[n] = t.rows.map((r) => r.out[i]).join(''); });
  const doc = schematicFromTable({ version: 1, name: m.name, inputs: ins, outputs: outs, table, exprs: {}, form: 'sop', lang: m.lang });
  delete doc.fallbacks;
  let lid = doc.labels.length, wid = doc.wires.length, sid = doc.symbols.length, pid = doc.ports.length;
  const label = (x, y, net) => doc.labels.push({ id: `L${++lid}`, x, y, net });
  const wire = (pts) => doc.wires.push({ id: `W${++wid}`, points: pts });
  // the state and next-state bits: labels where their markers were
  const bits = new Set([...t.stateBits, ...t.nextBits]);
  for (const p of doc.ports.filter((q) => bits.has(q.name))) label(p.x, p.y, p.name);
  doc.ports = doc.ports.filter((q) => !bits.has(q.name));
  // a bus's bits (phase_2…): labels of its bits (phase(2)…), the bus a marker of its own
  const buses = [...m.inputs.map((p) => ({ ...p, dir: 'in' })), ...m.outputs.map((p) => ({ ...p, dir: 'out' }))].filter((p) => p.width > 1);
  const bitOf = new Map();
  for (const p of buses) for (let b = 0; b < p.width; b++) bitOf.set(`${p.name}_${b}`, `${p.name}(${b})`);
  for (const p of doc.ports.filter((q) => bitOf.has(q.name))) label(p.x, p.y, bitOf.get(p.name));
  doc.ports = doc.ports.filter((q) => !bitOf.has(q.name));
  // the state register, right of the logic
  const right = Math.max(...doc.ports.map((p) => p.x), ...doc.labels.map((l) => l.x)) + 200;
  const top = 40, x0 = right + 120;
  const used = new Set([...ins, ...outs, m.clock, m.reset.name].map((n) => n.toLowerCase()));
  const fresh = (base) => { let n = base, k = 1; while (used.has(n.toLowerCase())) n = `${base}_${++k}`; used.add(n.toLowerCase()); return n; };
  const port = (name, dir, x, y, width = 1) => doc.ports.push({ id: `P${++pid}`, name, dir, width, x, y });
  // the clock and the reset: markers, a stub and a label (the reset through an inverter when active low)
  port(m.clock, 'in', right, top); wire([{ x: right, y: top }, { x: right + 40, y: top }]); label(right + 40, top, m.clock);
  let rst = m.reset.name;
  port(m.reset.name, 'in', right, top + 40);
  if (m.reset.active === 'low') {
    rst = fresh(`${m.reset.name}_i`);
    const inv = { id: `S${++sid}`, type: 'inv', x: right + 20, y: top + 30, rot: 0, mirror: false, name: `U${sid}`, params: { width: 1 } };
    doc.symbols.push(inv);
    wire([{ x: right, y: top + 40 }, { x: right + 20, y: top + 40 }]);
    wire([{ x: right + 100, y: top + 40 }, { x: right + 120, y: top + 40 }]); label(right + 120, top + 40, rst);
  } else { wire([{ x: right, y: top + 40 }, { x: right + 40, y: top + 40 }]); label(right + 40, top + 40, rst); }
  const init = fsmEncoding(m).find((e) => e.id === m.initial)?.bits || '0'.repeat(t.stateBits.length);
  const pins = { D: (b) => t.nextBits[b], Q: (b) => t.stateBits[b], C: () => m.clock, CLR: () => rst, PRE: () => rst, R: () => rst, S: () => rst };
  t.stateBits.forEach((q, b) => {
    const one = init[b] === '1';
    const type = m.reset.sync ? (one ? 'fds' : 'fdr') : (one ? 'fdp' : 'fdc');
    const s = { id: `S${++sid}`, type, x: x0, y: top + 100 + b * 120, rot: 0, mirror: false, name: `U${sid}`, params: { width: 1, init: one ? '1' : '0' } };
    doc.symbols.push(s);
    for (const p of symbolPins(s, {}, symbolDef(s))) {
      const dx = p.dir === 'out' ? 20 : -20;
      wire([{ x: p.x, y: p.y }, { x: p.x + dx, y: p.y }]);
      label(p.x + dx, p.y, pins[p.name](b));
    }
  });
  // the buses' markers, under the register: a stub to a label of the whole bus
  buses.forEach((p, i) => {
    const y = top + 100 + t.stateBits.length * 120 + 40 * i, dx = p.dir === 'in' ? 40 : -40, x = p.dir === 'in' ? right : x0 + 130;
    port(p.name, p.dir, x, y, p.width);
    wire([{ x, y }, { x: x + dx, y }]);
    label(x + dx, y, `${p.name}(${p.width - 1}:0)`);
  });
  const yEnd = top + 100 + t.stateBits.length * 120 + 40 * buses.length;
  doc.sheet = { w: Math.max(doc.sheet.w, Math.ceil((x0 + 200) / 100) * 100), h: Math.max(doc.sheet.h, Math.ceil((yEnd + 60) / 100) * 100) };
  joinOnWires(doc);
  return { doc };
}
