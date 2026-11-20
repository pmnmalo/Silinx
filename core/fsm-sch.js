// Silinx state machines - the schematic of a state diagram (#4911): its classic implementation, not the synthesis's RTL
// view. A D flip-flop per state bit of its encoding (the state register) and its next-state and output logic in minimal
// gates: the truth tables of Create Boolean Algebra (core/fsm.js truthTablesOf, the unused codes don't cares) drawn as a
// truth table's schematic is (core/logic-sch.js schematicFromTable). The state bits and the next-state bits are named
// nets (labels): the logic's inputs q1, q0 the flip-flops' outputs, its outputs d1, d0 their D inputs.
import { fsmEncoding, normalizeFsm, truthTablesOf } from './fsm.js';
import { schematicFromTable } from './logic-sch.js';
import { joinOnWires, symbolDef, symbolPins } from './schdoc.js';
import { normalizeTable } from './logic.js';

// the flip-flop of a state bit: its reset (asynchronous or synchronous) to the reset state's bit, 0 or 1
const FLOP = { async: ['fdc', 'fdp'], sync: ['fdr', 'fds'] };
const RESET_PIN = { fdc: 'CLR', fdp: 'PRE', fdr: 'R', fds: 'S' };

/**
 * The schematic (core/schdoc.js document) of a state diagram: { doc } or { error } (why it has none: an encoding with
 * no codes, enumerated or one-hot, errors in the diagram, too many bits for its tables: encodedTable's and
 * truthTablesOf's messages). Its inputs and outputs a port per bit (a bus `y` as y_1, y_0), its clock and reset ports
 * those of the diagram (an active-low reset through an inverter).
 */
export function fsmSchematic(model) {
  const m = normalizeFsm(model);
  if (m.encoding === 'enum') return { error: 'The enumerated encoding has no state codes: choose binary or gray to see the schematic' };
  const r = truthTablesOf(m);
  if (r.error) return { error: r.error };
  const next = r.tables.find((t) => t.suffix === 'next').doc, out = r.tables.find((t) => t.suffix === 'out')?.doc;
  const table = normalizeTable({ ...next, name: m.name, outputs: [...next.outputs, ...(out?.outputs || [])],
    table: { ...next.table, ...(out?.table || {}) }, notes: `The state machine ${m.name}` });
  const doc = schematicFromTable(table, { lang: m.lang, name: m.name });
  const w = next.outputs.length;
  const stateBits = table.inputs.slice(0, w), nextBits = next.outputs;
  let lid = doc.labels.length, wid = doc.wires.length, sid = doc.symbols.length, pid = doc.ports.length;
  const label = (x, y, net) => doc.labels.push({ id: `L${++lid}`, x, y, net });
  const wire = (...pts) => doc.wires.push({ id: `W${++wid}`, points: pts.map(([x, y]) => ({ x, y })) });
  // the state bits and the next-state bits: named nets where the table's ports were
  const named = new Set([...stateBits, ...nextBits]);
  for (const p of doc.ports.filter((q) => named.has(q.name))) label(p.x, p.y, p.name);
  doc.ports = doc.ports.filter((q) => !named.has(q.name));
  // ---- the state register, under the logic: the reset and clock ports on the left, their lines, a flip-flop a bit
  const PX = Math.min(...doc.ports.map((p) => p.x), 40);
  const bottom = Math.max(...doc.wires.flatMap((x) => x.points.map((p) => p.y)), ...doc.ports.map((p) => p.y), ...doc.symbols.map((s) => s.y + 80));
  const yRst = Math.ceil((bottom + 60) / 10) * 10, yClk = yRst + 30;
  const XF = PX + 280, xClk = XF - 100, xRst = XF - 80;
  const reset = fsmEncoding(m).find((e) => e.id === m.initial);
  const sym = (type, x, y) => {
    const s = { id: `S${++sid}`, type, x, y, rot: 0, mirror: false, name: `U${sid}`, params: { width: 1 } };
    doc.symbols.push(s);
    return Object.fromEntries(symbolPins(s, {}, symbolDef(s)).map((p) => [p.name, p]));
  };
  doc.ports.unshift({ id: `P${++pid}`, name: m.clock, dir: 'in', width: 1, x: PX, y: yClk },
    { id: `P${++pid}`, name: m.reset.name, dir: 'in', width: 1, x: PX, y: yRst });
  let rstFrom = PX;
  if (m.reset.active === 'low') {   // (the flip-flops' reset active high: an inverter)
    const inv = sym('inv', PX + 60, yRst - 10);
    wire([PX, yRst], [inv.I.x, inv.I.y]);
    rstFrom = inv.O.x;
  }
  const flops = stateBits.map((q, i) => {
    const type = FLOP[m.reset.sync ? 'sync' : 'async'][reset.bits[i] === '1' ? 1 : 0];
    const pins = sym(type, XF, yClk + 40 + 100 * i);
    const D = pins.D, Q = pins.Q;
    wire([D.x - 40, D.y], [D.x, D.y]); label(D.x - 40, D.y, nextBits[i]);
    wire([Q.x, Q.y], [Q.x + 40, Q.y]); label(Q.x + 40, Q.y, q);
    return { C: pins.C, R: pins[RESET_PIN[type]] };
  });
  const last = (k) => Math.max(...flops.map((f) => f[k].y));
  wire([rstFrom, yRst], [xRst, yRst], [xRst, last('R')]);
  wire([PX, yClk], [xClk, yClk], [xClk, last('C')]);
  for (const f of flops) { wire([xRst, f.R.y], [f.R.x, f.R.y]); wire([xClk, f.C.y], [f.C.x, f.C.y]); }
  const yEnd = yClk + 40 + 100 * flops.length;
  doc.sheet = { w: Math.max(doc.sheet.w, Math.ceil((XF + 300) / 100) * 100), h: Math.max(doc.sheet.h, Math.ceil((yEnd + 60) / 100) * 100) };
  delete doc.fallbacks;
  joinOnWires(doc);
  return { doc };
}
