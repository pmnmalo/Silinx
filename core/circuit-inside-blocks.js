// The functions inside an IC with no gates (#4508, the circuit editor's Show inside; core/circuit-inside.js lays out the
// gate ICs): its datasheet's connection diagram's boxes. A dual or quad flip-flop, latch or decoder (its pins named
// 1D, 1CLK… 2D, 2CLK…) a box a unit, beside its pins, when every pin belongs to one unit and the boxes do not overlap;
// another IC (a counter, a register, a decoder, a multiplexer, an adder) one box over its body. Each pin's line straight
// into its box's edge; in the box, its name, a clock's dynamic indicator ▷ (its bubble on a falling edge), a bubble on an
// active-low input. IEC 60617-12's labels too (1D, 1J, 1K, C1, S, R; the box's general qualifier: CTR, SRG, RG, X/Y,
// MUX, Σ, COMP), as Settings ▸ Schematic Symbols draws them. In pixels, from the part's pins unturned. Isomorphic module.

const BAR = '̅';
const STUB = 12;     // a box's edge from its pins' row
const GAP = 4;       // between a lower and an upper unit's box

/** Is a pin's name a clock's (an edge-triggered input): CLK, 1CLK, CKA, SRCLK, RCLK, UP, DOWN; not CLK INH. */
export const isClock = (name) => !/INH/.test(name) && /^(\d?(CLK|SRCLK|RCLK)|CK[AB]|UP|DOWN)$/.test(name.replace(BAR, ''));
/** Is it active low (its name barred: CLR̅, G2A̅). */
const isLow = (name) => name.includes(BAR);

// a unit's pin's IEC label (a flip-flop's or a latch's: its control dependency notation)
const IEC_PIN = { D: '1D', J: '1J', K: '1K', CLK: 'C1', PRE: 'S', PR: 'S', CLR: 'R', S: 'S', R: 'R', S1: 'S', S2: 'S', C: 'C1', Q: '', 'C,2C': 'C1', 'C,4C': 'C1' };
// a box's IEC general qualifier, by its IC's title
const QUALIFIERS = [[/counter/i, 'CTR'], [/shift register/i, 'SRG'], [/7-segment/i, 'BCD/7SEG'], [/decoder/i, 'X/Y'], [/multiplexer|selector/i, 'MUX'], [/adder/i, 'Σ'],
  [/comparator/i, 'COMP'], [/register|flip-flop|latch/i, 'RG']];
export const qualifierOf = (title) => QUALIFIERS.find(([re]) => re.test(title))?.[1] ?? '';

/**
 * The boxes inside the IC `d` (its pins unturned, in pixels: { n, x, y }): { boxes: [{ x, y, w, h, unit (its number, or
 * null for the whole IC), qualifier (IEC's: a whole IC's, a dual decoder's or counter's unit's), pins: [{ n, name (as the datasheet's inside the box: a unit's
 * without its number), anchor (its name's: start, middle, end), iec (IEC's label), edge: 'top' | 'bottom', x, y (on the box's edge), clock, falling, low, out }] }],
 * wires: [{ pin, box, points }] }; or null for an IC with gates, or with no pins but its supply's.
 */
export function blocksLayout(d, pins) {
  if (d.gates || d.kind !== 'ic') return null;
  const at = new Map(pins.map((q) => [q.n, q]));
  const sig = d.pins.filter((p) => !['vcc', 'gnd', 'nc'].includes(p.dir) && at.has(p.n));
  if (!sig.length) return null;
  const ys = pins.map((q) => q.y), rowB = Math.max(...ys), rowT = Math.min(...ys);
  const s = Math.abs((at.get(2)?.x ?? 20) - (at.get(1)?.x ?? 0)) / 20;
  const falling = /falling edge/i.test(d.title);
  const unitOf = (p) => (/^(\d)\D/.exec(p.name)?.[1] ?? null);
  const units = [...new Set(sig.map(unitOf))];
  const byUnit = units.every((u) => u !== null) && units.length >= 2 && units.length <= 4;
  const groups = units.map((u) => [Number(u), sig.filter((p) => unitOf(p) === u)]);
  const half = (rowB - rowT - 2 * STUB * s - GAP * s) / 2;
  const allX = pins.map((q) => q.x);
  // a box: the whole body's; a unit's over the body's height when its pins are on both rows (`side` null), or in one
  // half, its x along that row's pins (`side` its row: the other row's pins' lines come straight across)
  const boxOf = (ps, side) => {
    const on = side == null ? ps : ps.filter((p) => at.get(p.n).y === side);
    const xs = side === undefined ? allX : on.map((p) => at.get(p.n).x);
    const top = side !== rowB, bottom = side !== rowT;
    return { x: Math.min(...xs) - 7 * s, y: bottom && !top ? rowB - STUB * s - half : rowT + STUB * s, w: Math.max(...xs) - Math.min(...xs) + 14 * s,
      h: top && bottom ? rowB - rowT - 2 * STUB * s : half };
  };
  const rowsOf = (ps) => [rowB, rowT].map((r) => ps.filter((p) => at.get(p.n).y === r).length);
  const meet = (a, b) => a.x < b.x + b.w + 2 * s && b.x < a.x + a.w + 2 * s && a.y < b.y + b.h + 2 * s && b.y < a.y + a.h + 2 * s;
  // (a pin's straight line into its box crossing another box)
  const crosses = (bs) => bs.some((b, i) => b.ps.some((p) => { const q = at.get(p.n), y0 = Math.min(q.y, b.y + b.h / 2), y1 = Math.max(q.y, b.y + b.h / 2);
    return bs.some((o, j) => j !== i && q.x > o.x - s && q.x < o.x + o.w + s && y0 < o.y + o.h && y1 > o.y); }));
  const ok = (bs) => !bs.some((a, i) => bs.some((b, j) => j > i && meet(a, b))) && !crosses(bs);
  const whole = () => [{ unit: null, ps: sig, ...boxOf(sig) }];
  let boxes = whole();
  if (byUnit) {
    // (each unit over the body's height when its pins are on both rows, else in its row's half; or each in the half of
    // most of its pins, the 74107's, 74112's; or one box, a 7475's units sharing their enables)
    const full = groups.map(([u, ps]) => { const [b, t] = rowsOf(ps); return { unit: u, ps, ...boxOf(ps, b && t ? null : b ? rowB : rowT) }; });
    const most = groups.map(([u, ps]) => { const [b, t] = rowsOf(ps); return { unit: u, ps, ...boxOf(ps, b === t ? null : b > t ? rowB : rowT) }; });
    boxes = ok(full) ? full : ok(most) ? most : boxes;
  }
  // (a supply pin under a box, the 7476's VCC between its units, or every one of a whole IC's box: into it, named in it)
  for (const p of d.pins.filter((q) => (q.dir === 'vcc' || q.dir === 'gnd') && at.has(q.n))) {
    const q = at.get(p.n);
    const b = boxes.find((o) => q.x >= o.x && q.x <= o.x + o.w && (q.y === rowT ? o.y === rowT + STUB * s : o.y + o.h === rowB - STUB * s));
    if (b) b.ps = [...b.ps, p];
  }
  const out = { boxes: [], wires: [] };
  boxes.forEach((b, bi) => {
    // (a unit's too, a dual decoder's or counter's; a flip-flop's or a latch's none, its pins' labels say it)
    const qualifier = b.unit === null || !/flip-flop|latch/i.test(d.title) ? qualifierOf(d.title) : '';
    const bp = b.ps.map((p) => {
      const q = at.get(p.n), top = q.y < b.y, name = b.unit !== null && unitOf(p) !== null && !p.name.includes(',') ? p.name.slice(1) : p.name;
      const plain = name.replace(BAR, ''), clock = isClock(p.name), output = p.dir !== 'in';
      // (its name's anchor: a box's first and last pins' names kept inside its edges)
      const xs = b.ps.map((o) => at.get(o.n).x), anchor = q.x === Math.min(...xs) ? 'start' : q.x === Math.max(...xs) ? 'end' : 'middle';
      return { n: p.n, name, anchor, iec: b.unit === null ? name : (IEC_PIN[plain] ?? plain), edge: top ? 'top' : 'bottom', x: q.x, y: top ? b.y : b.y + b.h,
        clock, falling: clock && falling, low: !output && isLow(p.name), out: output };
    });
    out.boxes.push({ x: b.x, y: b.y, w: b.w, h: b.h, unit: b.unit, qualifier, pins: bp });
    for (const p of bp) out.wires.push({ pin: p.n, box: bi, points: [[p.x, at.get(p.n).y], [p.x, p.y]] });
  });
  return out;
}
