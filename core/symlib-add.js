// The compositions of the adders and subtractors (#4807, part of #4806): FA1, a full adder of gates; ADD n, a chain
// of at most four blocks, each one's carry out the carry in of the next (ADD4: four FA1; ADD8: two ADD4; ADD16: four
// ADD4; ADD32: two ADD16; the rest a smaller block, ADD10: two ADD4 and an ADD2); SUB n, A − B − BI = A + not B +
// not BI: the adder with B inverted, its carry in the borrow in inverted, its carry out the borrow out inverted. The
// carries run upwards: a block's carry in below it, its carry out above it. Isomorphic (no DOM).
import { sheet, drawFullAdder } from './sch-templates.js';
import { canvas, instDef, bitsName } from './symlib-draw.js';
import { r10 } from './schdoc.js';

const CARRY_SIDES = { A: 'W', B: 'W', CI: 'S', S: 'E', CO: 'N', BI: 'S', D: 'E', BO: 'N' };
const XM = 100, GAP = 60, ROW = 40, TOP = 120;   // (TOP: below the sheet's description)

/** FA1: a full adder, two half adders (XOR, AND) and an OR (the Schematic Wizard's, core/sch-templates.js). */
function fullAdder(lib) {
  return lib.use('FA1', () => {
    const c = canvas('FA1', 'FA1: a full adder. S = A xor B xor CI; CO = 1 when two or three of A, B, CI are 1. Two half adders (XOR, AND) and an OR.');
    const ins = ['A', 'B', 'CI'].map(name => ({ name, dir: 'in', width: 1 }));
    drawFullAdder(sheet(c.doc, role => ({ name: role.toUpperCase() }), ins), 160);
    return { doc: c.doc, sides: CARRY_SIDES };
  });
}

// the size of the blocks of an adder of n bits: the largest power of 4 below n (ADD4: FA1; ADD5 … ADD16: ADD4)
const chunkOf = n => { let k = 1; while (k * 4 < n) k *= 4; return k; };

/** The blocks of an adder of n bits, its least significant first: [{ w, lsb }]. */
export function addBlocks(n) {
  const k = chunkOf(n), out = [];
  for (let lsb = 0; lsb < n; lsb += k) out.push({ w: Math.min(k, n - lsb), lsb });
  return out;
}

/** ADD n with its carries (CI, CO) and buses: ADD1 is FA1. */
function adder(lib, n) {
  if (n === 1) return fullAdder(lib);
  return lib.use(`ADD${n}`, () => chain(lib, `ADD${n}`, n, { ci: 'pin', co: 'pin' }));
}

const blockName = w => (w === 1 ? 'FA1' : `ADD${w}`);
function describeChain(name, n, blocks) {
  const counts = new Map();
  for (const b of blocks) counts.set(blockName(b.w), (counts.get(blockName(b.w)) || 0) + 1);
  const parts = [...counts].map(([m, k]) => (k > 1 ? `${k} × ${m}` : m)).join(' and ');
  return `${name}: an adder of ${n} bits, ${parts}, each one's carry out the carry in of the next (a ripple-carry adder).`;
}

// an adder of n bits drawn as its blocks, the most significant on top: each block's operands and sum by their bits'
// names (A(7:4)), its carry from the block below; CI a marker, GND or VCC, CO a marker or open. `kind`: another chain of
// the same shape (an incrementer of half adders, #4811): { block(w), ops, describe(name, n, blocks) }
export function chain(lib, name, n, { ci, co }, kind = { block: w => adder(lib, w), ops: ['A', 'B'], describe: describeChain }) {
  const blocks = addBlocks(n), mods = blocks.map(b => kind.block(b.w));
  const c = canvas(name, kind.describe(name, n, blocks) + (ci === 'gnd' ? ' No carry in: CI is 0.' : ci === 'vcc' ? ' Its carry in 1.' : '') + (co === 'open' ? ' No carry out: CO open.' : ''));
  const X = 260, wMax = Math.max(...mods.map(m => instDef(m).w)), xOut = r10(X + wMax + 180);
  // (the buses' markers, below the description, their wires named by the blocks' bits)
  kind.ops.forEach((g, i) => { c.marker(g, 'in', n, XM, TOP + ROW * i); c.wire({ x: XM, y: TOP + ROW * i }, { x: XM + 60, y: TOP + ROW * i }); });
  c.marker('S', 'out', n, xOut, TOP);
  c.wire({ x: xOut - 60, y: TOP }, { x: xOut, y: TOP });
  let y = TOP + 160, below = null;
  const placed = [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i], I = c.inst(mods[i], X, y, `U${i}`);
    placed[i] = I;
    const bits = g => bitsName(g, n, b.lsb + b.w - 1, b.lsb);
    for (const g of kind.ops) { const p = I.pin(g); c.wire({ x: p.x - 60, y: p.y }, p); c.label(bits(g), p.x - 60, p.y); }
    const s = I.pin('S');
    c.wire(s, { x: s.x + 60, y: s.y });
    c.label(bits('S'), s.x + 60, s.y);
    y = r10(y + I.def.h + GAP);
    below = I;
  }
  // the carries: each block's carry out up to the carry in of the one above
  for (let i = 0; i + 1 < blocks.length; i++) {
    const o = placed[i].pin('CO'), t = placed[i + 1].pin('CI'), mid = r10((o.y + t.y) / 2);
    c.wire(o, { x: o.x, y: mid }, { x: t.x, y: mid }, t);
  }
  const cin = below.pin('CI');
  if (ci === 'pin') {
    c.marker('CI', 'in', 1, XM, cin.y + ROW);
    c.wire(cin, { x: cin.x, y: cin.y + ROW }, { x: XM, y: cin.y + ROW });
  } else if (ci === 'vcc') {
    c.sym('vcc', { width: 1 }, cin.x - 70, cin.y + ROW - 30);
    c.wire(cin, { x: cin.x, y: cin.y + ROW }, { x: cin.x - 60, y: cin.y + ROW });
  } else {
    c.sym('gnd', { width: 1 }, cin.x - 10, cin.y + ROW);
    c.wire(cin, { x: cin.x, y: cin.y + ROW });
  }
  if (co === 'pin') {
    const o = placed[blocks.length - 1].pin('CO');
    c.marker('CO', 'out', 1, xOut, o.y - ROW);
    c.wire(o, { x: o.x, y: o.y - ROW }, { x: xOut, y: o.y - ROW });
  }
  return { doc: c.doc, sides: CARRY_SIDES };
}

/** SUB n: A − B − BI on an adder of n bits: B inverted, the borrow in inverted as its carry in (1 with no BI), the
 *  carry out inverted as the borrow out. */
function subtractor(lib, n, bin, bout) {
  const name = `SUB${n}${bin ? '' : '_NOBI'}${bout ? '' : '_NOBO'}`;
  return lib.use(name, () => {
    const add = adder(lib, n);
    const c = canvas(name, `${name}: A − B${bin ? ' − BI' : ''} = A + not B + ${bin ? 'not BI' : '1'}, the two's complement: an ${add.name} with B inverted and ${bin ? 'the borrow in inverted' : '1'} as its carry in${bout ? '; the borrow out is its carry out inverted' : ''}.`);
    const X = 400, I = c.inst(add, X, 220, 'U0');
    const a = I.pin('A'), b = I.pin('B'), s = I.pin('S'), cin = I.pin('CI'), co = I.pin('CO');
    const xOut = r10(X + I.def.w + 220);
    c.marker('A', 'in', n, XM, a.y);
    c.wire({ x: XM, y: a.y }, a);
    // B, inverted
    const yb = b.y + ROW, nb = c.sym('inv', { width: n, bits: false }, 200, yb - 10);
    c.marker('B', 'in', n, XM, yb);
    c.wire({ x: XM, y: yb }, nb.pin('I'));
    c.wire(nb.pin('O'), { x: b.x - 20, y: yb }, { x: b.x - 20, y: b.y }, b);
    // the carry in: the borrow in inverted, or 1
    const yc = cin.y + ROW;
    if (bin) {
      const ni = c.sym('inv', { width: 1, bits: false }, 200, yc - 10);
      c.marker('BI', 'in', 1, XM, yc);
      c.wire({ x: XM, y: yc }, ni.pin('I'));
      c.wire(ni.pin('O'), { x: cin.x, y: yc }, cin);
    } else {
      c.sym('vcc', { width: 1 }, cin.x - 70, yc - 30);
      c.wire(cin, { x: cin.x, y: yc }, { x: cin.x - 60, y: yc });
    }
    // the difference, and the borrow out: the carry out inverted
    c.marker('D', 'out', n, xOut, s.y);
    c.wire(s, { x: xOut, y: s.y });
    if (bout) {
      const yo = co.y - ROW, no = c.sym('inv', { width: 1, bits: false }, X + I.def.w + 40, yo - 10);
      c.wire(co, { x: co.x, y: yo }, no.pin('I'));
      c.marker('BO', 'out', 1, xOut, yo);
      c.wire(no.pin('O'), { x: xOut, y: yo });
    }
    return { doc: c.doc, sides: CARRY_SIDES };
  });
}

// a symbol with a pin per bit (A0 …, B0 …, S0 …): its bus form between bus joins and bus taps
function perBit(lib, name, inner, n, outName) {
  return lib.use(name, () => {
    const c = canvas(name, `${name}: ${inner.name} with a pin per bit: the operands' bits joined into buses, the result's taken from its bus.`);
    const jx = r10(XM + 80 + 20 * n), J = 60;
    // the operands' bits: markers ROW apart, fanned into a bus join (its I0 the most significant bit)
    const join = (g, y0) => {
      const j = c.sym('busjoin', { widths: Array(n).fill(1).join(',') }, jx, y0 - 10);
      for (let i = 0; i < n; i++) {
        const ym = y0 + ROW * i, pin = j.pin(`I${i}`), xc = jx - 20 * (n - i);
        c.marker(`${g}${n - 1 - i}`, 'in', 1, XM, ym);
        c.wire({ x: XM, y: ym }, { x: xc, y: ym }, { x: xc, y: pin.y }, pin);
      }
      return j;
    };
    const yA = 120, ja = join('A', yA), yB = yA + ROW * n + GAP, jb = join('B', yB);
    const ao = ja.pin('O'), X = jx + J + 60;
    const def = instDef(inner), pa = def.pins.find(q => q.name === 'A');
    const I = c.inst(inner, X, ao.y - pa.y, 'U0');
    c.wire(ao, I.pin('A'));
    const bo = jb.pin('O'), b = I.pin('B');
    c.wire(bo, { x: jx + J + 20, y: bo.y }, { x: jx + J + 20, y: b.y }, b);
    // the result: its bus down a trunk, a bus tap per bit to its marker
    const s = I.pin(outName), tx = X + def.w + 40, xOut = tx + 160;
    let prev = { x: tx, y: s.y };
    c.wire(s, prev);
    for (let i = 0; i < n; i++) {
      const y = s.y + ROW * (i + 1), t = c.sym('slice', { msb: i, lsb: i }, tx, y);
      c.wire(prev, { x: tx, y });
      prev = { x: tx, y };
      c.marker(`${outName}${i}`, 'out', 1, xOut, y + 10);
      c.wire(t.pin('O'), { x: xOut, y: y + 10 });
    }
    // the carry (borrow) in, from below everything; the carry (borrow) out, above
    const ci = inner.ports.find(q => q.side === 'S'), co = inner.ports.find(q => q.side === 'N');
    if (ci) {
      const p = I.pin(ci.name), yc = Math.max(p.y, yB + ROW * n) + ROW;
      c.marker(ci.name, 'in', 1, XM, yc);
      c.wire(p, { x: p.x, y: yc }, { x: XM, y: yc });
    }
    if (co) {
      const p = I.pin(co.name);
      c.marker(co.name, 'out', 1, xOut, p.y - ROW);
      c.wire(p, { x: p.x, y: p.y - ROW }, { x: xOut, y: p.y - ROW });
    }
    return { doc: c.doc, sides: {} };
  });
}

/** The top of an ADD symbol's composition (its parameters: width, cin, cout, bits). */
export function addTop(lib, p) {
  const n = p.width, cin = !!p.cin, cout = !!p.cout;
  const bus = cin && cout ? adder(lib, n)
    : lib.use(`ADD${n}${cin ? '' : '_NOCI'}${cout ? '' : '_NOCO'}`, () => chain(lib, `ADD${n}${cin ? '' : '_NOCI'}${cout ? '' : '_NOCO'}`, n, { ci: cin ? 'pin' : 'gnd', co: cout ? 'pin' : 'open' }));
  return p.bits && n > 1 ? perBit(lib, `${bus.name}_BITS`, bus, n, 'S') : bus;
}

/** The top of a SUB symbol's composition (its parameters: width, bin, bout, bits). */
export function subTop(lib, p) {
  const n = p.width, bus = subtractor(lib, n, !!p.bin, !!p.bout);
  return p.bits && n > 1 ? perBit(lib, `${bus.name}_BITS`, bus, n, 'D') : bus;
}
