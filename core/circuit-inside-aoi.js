// The AND-OR-INVERT gates inside their ICs (#4498, core/circuit-inside.js lays out the other gate ICs): the 7451, the
// 74LS54 (the library's 7454) and the 7455 as their datasheets' connection diagrams draw them. Each term's AND standing
// beside its pins' row, facing the body's middle (up from the lower row, down from the upper one), its inputs straight
// from its pins (a pin of the other row, the 7451's pin 1, coming round past its input side); the terms' outputs into
// the NOR, which faces its output pin. Horizontal and vertical lines only, none crossing another. In pixels, from the
// part's pins unturned: each layout is written for a DIP-14 (pin 1 at (0, 0), its rows 20 pixels a step, 60 apart).
// Isomorphic module.

const DEPTH = 8;     // a term's AND: its body's depth, from its input side to its tip
const EDGE = 14;     // its input side, from its pins' row
const JOGS = [11, 8];   // an input's horizontal step, from its row: the pin farthest from its slot the deepest
const NOR_W = 14, R = 2;
const heightOf = (k) => Math.max(12, 3 * (k + 1));

// the layouts, by the gates' pins: each gate's terms ({ face, cx, edge? (its input side's y, if not the row's EDGE),
// slot: the NOR's input it feeds, via: the bends of its output's line to it }) and its NOR (its body's left x, its
// middle's y)
const LAYOUTS = {
  // 1Y = /(1A·1B·1C + 1D·1E·1F) above, its first term's 1A from pin 1 below; 2Y = /(2A·2B + 2C·2D) below
  '1,12,13,9,10,11>8;2,3,4,5>6': [
    { terms: [{ face: 'down', cx: 24, edge: -40, slot: 1 }, { face: 'down', cx: 80, slot: 0 }], nor: { x: 98, cy: -34 } },
    { terms: [{ face: 'up', cx: 30, slot: 0, via: [[30, -26], [78, -26], [78, -22]] }, { face: 'up', cx: 66, slot: 1, via: [[66, -24], [76, -24], [76, -18]] }], nor: { x: 80, cy: -20 } }],
  // Y = /(AB + CDE + FGH + JK): two terms on each row, the NOR between them above Y
  '1,2,3,4,5,9,10,11,12,13>6': [
    { terms: [{ face: 'up', cx: 10, slot: 2 }, { face: 'up', cx: 60, slot: 3 }, { face: 'down', cx: 70, slot: 0 }, { face: 'down', cx: 30, slot: 1 }], nor: { x: 82, cy: -30 } }],
  // Y = /(ABCD + EFGH)
  '1,2,3,4,10,11,12,13>8': [
    { terms: [{ face: 'up', cx: 30, slot: 1 }, { face: 'down', cx: 50, slot: 0 }], nor: { x: 92, cy: -30 } }],
};
const keyOf = (d) => d.gates.map((g) => `${g.ins.join(',')}>${g.out}`).join(';');

/** The layout of an AND-OR-INVERT IC's inside, as core/circuit-inside.js insideLayout's ({ gates, wires }: each term's
 *  AND a gate facing up or down, `rot` -90 or 90, its box as drawn; a line from a term to its NOR of kind 'term', no
 *  pin), or null when its pins are not those of a layout here (a KiCad part's other pinout). */
export function aoiLayout(d, pins) {
  const L = LAYOUTS[keyOf(d)];
  if (!L) return null;
  const p1 = pins.find((q) => q.n === 1), p2 = pins.find((q) => q.n === 2);
  if (!p1 || !p2) return null;
  const s = (p2.x - p1.x) / 20;
  const T = ([x, y]) => [p1.x + x * s, p1.y + y * s];
  // (a pin in the layout's frame)
  const at = new Map(pins.map((q) => [q.n, [(q.x - p1.x) / s, (q.y - p1.y) / s]]));
  const out = { gates: [], wires: [] };
  const line = (pts) => pts.filter((q, i) => !i || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]).map(T);
  d.gates.forEach((g, gi) => {
    const lay = L[gi];
    const k = g.terms.length, h = heightOf(k), { x: nx, cy } = lay.nor;
    const slotY = (i) => cy - h / 2 + ((i + 1) * h) / (k + 1);
    const tips = [];
    let from = 0;
    g.terms.forEach((n, ti) => {
      const ins = g.ins.slice(from, (from += n)), t = lay.terms[ti];
      const up = t.face === 'up', row = up ? 0 : -60, dir = up ? -1 : 1;
      const side = t.edge ?? row + dir * EDGE, th = heightOf(n), tip = side + dir * DEPTH;
      const sorted = [...ins].sort((a, b) => at.get(a)[0] - at.get(b)[0]);
      const sx = new Map(sorted.map((p, i) => [p, t.cx - th / 2 + ((i + 1) * th) / (n + 1)]));
      // (each side's pins, the farthest from its slot jogging deepest)
      const jog = new Map();
      for (const left of [true, false]) {
        sorted.filter((p) => at.get(p)[1] === row && (left ? at.get(p)[0] < sx.get(p) : at.get(p)[0] > sx.get(p)))
          .sort((a, b) => Math.abs(at.get(b)[0] - sx.get(b)) - Math.abs(at.get(a)[0] - sx.get(a)))
          .forEach((p, i) => jog.set(p, row + dir * JOGS[i]));
      }
      const ai = out.gates.length;
      out.gates.push({ fn: 'and', x: T([t.cx - th / 2, 0])[0], y: T([0, Math.min(side, tip)])[1], w: th * s, h: DEPTH * s, flip: false,
        rot: up ? -90 : 90, tip: T([t.cx, tip]), ins: ins.map((p) => T([sx.get(p), side])), bubble: null, of: gi });
      for (const p of ins) {
        const [px, py] = at.get(p), x = sx.get(p);
        // (a pin of the other row: round, past the input side)
        const pts = py !== row ? [[px, py], [px, side - dir * 3], [x, side - dir * 3], [x, side]]
          : px === x ? [[px, py], [x, side]] : [[px, py], [px, jog.get(p)], [x, jog.get(p)], [x, side]];
        out.wires.push({ gate: ai, pin: p, kind: 'in', points: line(pts) });
      }
      tips.push({ ai, tip: [t.cx, tip], slot: t.slot, via: t.via });
    });
    const ni = out.gates.length;
    const ins = tips.map((q) => [nx, slotY(q.slot)]);
    for (const [i, q] of tips.entries()) {
      out.wires.push({ gate: q.ai, pin: null, kind: 'term', to: ni, points: line([q.tip, ...(q.via ?? [[q.tip[0], ins[i][1]]]), ins[i]]) });
    }
    const o = at.get(g.out), tipX = nx + NOR_W + 2 * R;
    out.gates.push({ fn: 'nor', x: T([nx, 0])[0], y: T([0, cy - h / 2])[1], w: NOR_W * s, h: h * s, flip: false, tip: T([tipX, cy]),
      ins: ins.map(T), bubble: T([nx + NOR_W + R, cy]), of: gi });
    out.wires.push({ gate: ni, pin: g.out, kind: 'out', points: line([[tipX, cy], [o[0], cy], o]) });
  });
  return out;
}
