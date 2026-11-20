// The compositions of the multiplexers, decoders and demultiplexers (#4809, part of #4806). M2_1: an inverter, two AND
// and an OR (O = D0 when S0 = 0, D1 when S0 = 1); M4_1: three M2_1, a tree (S0 to the first two, S1 to the third);
// M8_1: two M4_1 and an M2_1; M16_1: two M8_1 and an M2_1; an enable, an AND at the output (M4_1E). D1_2E: an inverter
// and two AND (D0 = E and not A0, D1 = E and A0); D2_4E: a D1_2E on A1 enabling two D1_2E on A0; D3_8E: a D1_2E on A2
// enabling two D2_4E. A demultiplexer: a decoder whose enable is the data (and the enable). A bus of w bits: w one-bit
// ones sharing their selects (a gate has no one-bit input for a bus), at most four to a drawing (M4_1E_X16: four
// M4_1E_X4). The selects and the buses' bits joined by their wires' names. Isomorphic (no DOM).
import { canvas, instDef, lanes, stub } from './symlib-draw.js';
import { r10 } from './schdoc.js';

const XM = 100, TOP = 120, ROW = 40;
const range = n => [...Array(n).keys()];
const sideMap = (mod, pick) => Object.fromEntries(mod.ports.map(q => [q.name, pick(q)]));
// the sides of a block: its data on the left, its selects below it, its outputs on the right
const SIDES = q => (/^S\d*$/.test(q.name) ? 'S' : q.dir === 'out' ? 'E' : 'W');

// ------------------------------------------------------------------ multiplexers

/** M2_1: O = D0 when S0 = 0, else D1. */
function mux2(lib) {
  return lib.use('M2_1', () => {
    const c = canvas('M2_1', 'M2_1: a 2-to-1 multiplexer, O = D0 when S0 = 0, D1 when S0 = 1: (D0 and not S0) or (D1 and S0).');
    const G = (type, x, y) => c.sym(type, { width: 1, bits: false }, x, y);
    const a = G('and2', 300, 100), b = G('and2', 300, 180), n = G('inv', 180, 120), o = G('or2', 440, 140);
    c.marker('D0', 'in', 1, XM, 110); c.wire({ x: XM, y: 110 }, a.pin('I0'));
    c.marker('S0', 'in', 1, XM, 160);
    c.wire({ x: XM, y: 160 }, { x: 150, y: 160 }, { x: 150, y: 130 }, n.pin('I'));
    c.wire({ x: 150, y: 160 }, { x: 150, y: 190 }, b.pin('I0'));
    c.wire(n.pin('O'), a.pin('I1'));
    c.marker('D1', 'in', 1, XM, 210); c.wire({ x: XM, y: 210 }, b.pin('I1'));
    c.wire(a.pin('O'), { x: 400, y: a.pin('O').y }, { x: 400, y: o.pin('I0').y }, o.pin('I0'));
    c.wire(b.pin('O'), { x: 410, y: b.pin('O').y }, { x: 410, y: o.pin('I1').y }, o.pin('I1'));
    c.marker('O', 'out', 1, 600, o.pin('O').y); c.wire(o.pin('O'), { x: 600, y: o.pin('O').y });
    return { doc: c.doc, sides: { D0: 'W', D1: 'W', S0: 'S', O: 'E' } };
  });
}

/** M(k)_1, k = 2, 4, 8, 16: two of half its size and an M2_1 choosing between them by its top select. */
function muxTree(lib, k) {
  if (k === 2) return mux2(lib);
  const name = `M${k}_1`, half = muxTree(lib, k / 2), m = Math.log2(k), mix = mux2(lib);
  return lib.use(name, () => {
    const c = canvas(name, `${name}: a ${k}-to-1 multiplexer, two M${k / 2}_1 (D0 … D${k / 2 - 1}, D${k / 2} … D${k - 1}) chosen between by an M2_1 on S${m - 1}.`);
    const X = 260, d = instDef(half), lo = c.inst(half, X, TOP, 'U0'), hi = c.inst(half, X, r10(TOP + d.h + 100), 'U1');
    const yc = r10((lo.pin('O').y + hi.pin('O').y) / 2) - 10, X2 = X + d.w + 120, cm = c.inst(mix, X2, yc - instDef(mix).pins.find(q => q.name === 'D0').y, 'U2');
    // the data: each one's marker on its row; the selects below each block, by their names
    for (const [I, base] of [[lo, 0], [hi, k / 2]]) {
      for (let i = 0; i < k / 2; i++) { const p = I.pin(`D${i}`); c.marker(`D${base + i}`, 'in', 1, XM, p.y); c.wire({ x: XM, y: p.y }, p); }
      for (let j = 0; j < m - 1; j++) stub(c, I.pin(`S${j}`), 'S', `S${j}`);
    }
    stub(c, cm.pin('S0'), 'S', `S${m - 1}`);
    const yS = r10(hi.pin('S0').y + 120);
    for (let j = 0; j < m; j++) { c.marker(`S${j}`, 'in', 1, XM, yS + ROW * j); c.wire({ x: XM, y: yS + ROW * j }, { x: XM + 40, y: yS + ROW * j }); }
    c.wire(lo.pin('O'), { x: X2 - 60, y: lo.pin('O').y }, { x: X2 - 60, y: cm.pin('D0').y }, cm.pin('D0'));
    c.wire(hi.pin('O'), { x: X2 - 50, y: hi.pin('O').y }, { x: X2 - 50, y: cm.pin('D1').y }, cm.pin('D1'));
    const xo = X2 + instDef(mix).w + 120;
    c.marker('O', 'out', 1, xo, cm.pin('O').y); c.wire(cm.pin('O'), { x: xo, y: cm.pin('O').y });
    return { doc: c.doc, sides: sideMap({ ports: [...range(k).map(i => ({ name: `D${i}`, dir: 'in' })), ...range(m).map(j => ({ name: `S${j}`, dir: 'in' })), { name: 'O', dir: 'out' }] }, SIDES) };
  });
}

/** A one-bit multiplexer of k inputs, with an enable (M4_1E: an M4_1 and an AND) or without. */
function muxCell(lib, k, en) {
  if (!en) return muxTree(lib, k);
  const inner = muxTree(lib, k), m = Math.log2(k), name = `M${k}_1E`;
  return lib.use(name, () => {
    const c = canvas(name, `${name}: an M${k}_1 and its enable, O = 0 when E = 0.`);
    const X = 260, I = c.inst(inner, X, TOP, 'U0');
    for (let i = 0; i < k; i++) { const p = I.pin(`D${i}`); c.marker(`D${i}`, 'in', 1, XM, p.y); c.wire({ x: XM, y: p.y }, p); }
    for (let j = 0; j < m; j++) stub(c, I.pin(`S${j}`), 'S', `S${j}`);
    const o = I.pin('O'), g = c.sym('and2', { width: 1, bits: false }, o.x + 100, o.y - 10);
    c.wire(o, g.pin('I0'));
    const yE = r10(I.pin('S0').y + 100);
    c.marker('E', 'in', 1, XM, yE);
    c.wire({ x: XM, y: yE }, { x: o.x + 60, y: yE }, { x: o.x + 60, y: g.pin('I1').y }, g.pin('I1'));
    for (let j = 0; j < m; j++) { c.marker(`S${j}`, 'in', 1, XM, yE + ROW * (j + 1)); c.wire({ x: XM, y: yE + ROW * (j + 1) }, { x: XM + 40, y: yE + ROW * (j + 1) }); }
    c.marker('O', 'out', 1, o.x + 260, g.pin('O').y); c.wire(g.pin('O'), { x: o.x + 260, y: g.pin('O').y });
    return { doc: c.doc, sides: Object.fromEntries([...range(k).map(i => [`D${i}`, 'W']), ['E', 'W'], ...range(m).map(j => [`S${j}`, 'S']), ['O', 'E']]) };
  });
}

// the size of the groups of an array of w bits: the largest power of 4 below w
const chunkOf = w => { let k = 1; while (k * 4 < w) k *= 4; return k; };

/**
 * An array of `w` one-bit blocks (`cell`) sharing their selects and enable, its buses' bits joined by their names:
 * `ins` / `outs` the data's buses (a bit each from every block's pin of that name), `shared` the rest; `selBus`: the
 * selects one bus S. Up to four blocks to a drawing, the rest arrays of their own (name_X16: four name_X4).
 */
function array(lib, cell, w, { ins, outs, selBus = false }) {
  const name = `${cell.name}_X${w}${selBus ? '_SB' : ''}`, sel = cell.ports.filter(q => q.side === 'S').map(q => q.name);
  return lib.use(name, () => {
    const k = chunkOf(w), parts = [];
    for (let lo = 0; lo < w; lo += k) parts.push({ lo, n: Math.min(k, w - lo) });
    const net = (pin, lo, n) => (sel.includes(pin) ? (selBus ? `S(${pin.slice(1)})` : pin)
      : [...ins, ...outs].includes(pin) ? (n === 1 ? `${pin}(${lo})` : `${pin}(${lo + n - 1}:${lo})`) : pin);
    const items = parts.map(({ lo, n }, i) => {
      const mod = n === 1 ? cell : array(lib, cell, n, { ins, outs, selBus });
      const sub = n > 1 && selBus;   // (a sub-array's select a bus too)
      return { mod, label: `U${i}`, net: pin => (sub && pin === 'S' ? 'S' : net(pin, lo, n)) };
    });
    const markers = [...cell.ports.filter(q => q.dir === 'in' && !sel.includes(q.name)).map(q => ({ name: q.name, dir: 'in', width: ins.includes(q.name) ? w : 1 })),
      ...(selBus ? [{ name: 'S', dir: 'in', width: sel.length }] : sel.map(s => ({ name: s, dir: 'in', width: 1 }))),
      ...cell.ports.filter(q => q.dir === 'out').map(q => ({ name: q.name, dir: 'out', width: outs.includes(q.name) ? w : 1 }))];
    return lanes(name, `${name}: ${w} × ${cell.name}, a bit each, sharing ${sel.length > 1 ? 'their selects' : 'their select'}${cell.ports.some(q => q.name === 'E') ? ' and enable' : ''}${parts.length < w ? ` (in groups of ${k})` : ''}.`,
      markers, items, Object.fromEntries(markers.map(m => [m.name, m.name === 'S' || sel.includes(m.name) ? 'S' : m.dir === 'in' ? 'W' : 'E'])));
  });
}

// a symbol's top: `cell` alone when its pins are the symbol's; else the blocks joined to the symbol's pins by their names
function topOf(lib, cell, w, { ins, outs, selBus, bits, bitIn, bitOut, name }) {
  if (w === 1 && !selBus) return cell;
  if (!bits || w === 1) return array(lib, cell, w, { ins, outs, selBus });
  const sel = cell.ports.filter(q => q.side === 'S').map(q => q.name);
  // (a pin per bit: the blocks one per bit, their pins on the symbol's pins by name)
  return lib.use(`${name}_BITS`, () => {
    const net = r => pin => (sel.includes(pin) ? (selBus ? `S(${pin.slice(1)})` : pin) : ins.includes(pin) ? bitIn(pin, r) : outs.includes(pin) ? bitOut(pin, r) : pin);
    const markers = [...range(w).flatMap(r => ins.map(p => ({ name: bitIn(p, r), dir: 'in', width: 1 }))),
      ...cell.ports.filter(q => q.dir === 'in' && !sel.includes(q.name) && !ins.includes(q.name)).map(q => ({ name: q.name, dir: 'in', width: 1 })),
      ...(selBus ? [{ name: 'S', dir: 'in', width: sel.length }] : sel.map(s => ({ name: s, dir: 'in', width: 1 }))),
      ...range(w).flatMap(r => outs.map(p => ({ name: bitOut(p, r), dir: 'out', width: 1 })))];
    return lanes(`${name}_BITS`, `${name}_BITS: ${w} × ${cell.name}, a bit each, each pin a pin of the symbol.`, markers,
      range(w).map(r => ({ mod: cell, label: `U${r}`, net: net(r) })));
  });
}

/** The top of a multiplexer's composition (mux2 … mux16: width, en, selBus, bits). */
export function muxTop(lib, type, p) {
  const k = { mux2: 2, mux4: 4, mux8: 8, mux16: 16 }[type], w = p.width;
  const cell = muxCell(lib, k, !!p.en), ins = range(k).map(i => `D${i}`);
  return topOf(lib, cell, w, { ins, outs: ['O'], selBus: !!p.selBus && k > 2, bits: !!p.bits, name: `${cell.name}_X${w}`,
    bitIn: (pin, r) => `${pin}_${r}`, bitOut: (pin, r) => `O${r}` });
}

// ------------------------------------------------------------------ decoders

/** D1_2E: D0 = E and not A0, D1 = E and A0. */
function dec1(lib) {
  return lib.use('D1_2E', () => {
    const c = canvas('D1_2E', 'D1_2E: a 1-to-2 decoder with enable, D0 = E and not A0, D1 = E and A0.');
    const G = (type, x, y) => c.sym(type, { width: 1, bits: false }, x, y);
    const a = G('and2', 300, 100), b = G('and2', 300, 180), n = G('inv', 180, 120);
    // (A0 between the two AND, as M2_1's select; E to the second by its name)
    c.marker('A0', 'in', 1, XM, 160);
    c.wire({ x: XM, y: 160 }, { x: 150, y: 160 }, { x: 150, y: 130 }, n.pin('I'));
    c.wire({ x: 150, y: 160 }, { x: 150, y: 190 }, b.pin('I0'));
    c.wire(n.pin('O'), a.pin('I1'));
    c.marker('E', 'in', 1, XM, 110);
    c.wire({ x: XM, y: 110 }, a.pin('I0'));
    stub(c, b.pin('I1'), 'W', 'E');
    c.marker('D0', 'out', 1, 500, a.pin('O').y); c.wire(a.pin('O'), { x: 500, y: a.pin('O').y });
    c.marker('D1', 'out', 1, 500, b.pin('O').y); c.wire(b.pin('O'), { x: 500, y: b.pin('O').y });
    return { doc: c.doc, sides: { A0: 'W', E: 'W', D0: 'E', D1: 'E' } };
  });
}

/** D(n)_(2^n)E: a D1_2E on the top address bit enabling two decoders of the bits below it. */
function decTree(lib, n) {
  if (n === 1) return dec1(lib);
  const name = `D${n}_${1 << n}E`, half = decTree(lib, n - 1), one = dec1(lib), h = 1 << (n - 1);
  return lib.use(name, () => {
    const c = canvas(name, `${name}: a ${n}-to-${1 << n} decoder with enable, a D1_2E on A${n - 1} enabling two D${n - 1}_${h}E (D0 … D${h - 1}, D${h} … D${2 * h - 1}).`);
    const d = instDef(half), X2 = 520, lo = c.inst(half, X2, TOP, 'U1'), hi = c.inst(half, X2, r10(TOP + d.h + 80), 'U2');
    const mid = r10((lo.pin('E').y + hi.pin('E').y) / 2), F = c.inst(one, 220, mid - instDef(one).pins.find(q => q.name === 'E').y, 'U0');
    c.marker('E', 'in', 1, XM, F.pin('E').y); c.wire({ x: XM, y: F.pin('E').y }, F.pin('E'));
    c.marker(`A${n - 1}`, 'in', 1, XM, F.pin('A0').y); c.wire({ x: XM, y: F.pin('A0').y }, F.pin('A0'));
    c.wire(F.pin('D0'), { x: X2 - 120, y: F.pin('D0').y }, { x: X2 - 120, y: lo.pin('E').y }, lo.pin('E'));
    c.wire(F.pin('D1'), { x: X2 - 110, y: F.pin('D1').y }, { x: X2 - 110, y: hi.pin('E').y }, hi.pin('E'));
    const xo = X2 + d.w + 160;
    for (const [I, base] of [[lo, 0], [hi, h]]) {
      for (let j = 0; j < n - 1; j++) stub(c, I.pin(`A${j}`), 'W', `A${j}`);
      for (let i = 0; i < h; i++) { const p = I.pin(`D${i}`); c.marker(`D${base + i}`, 'out', 1, xo, p.y); c.wire(p, { x: xo, y: p.y }); }
    }
    const yA = r10(Math.max(hi.pin(`D${h - 1}`).y, F.pin('A0').y) + 80);
    for (let j = 0; j < n - 1; j++) { c.marker(`A${j}`, 'in', 1, XM, yA + ROW * j); c.wire({ x: XM, y: yA + ROW * j }, { x: XM + 40, y: yA + ROW * j }); }
    return { doc: c.doc, sides: Object.fromEntries([...range(n).map(j => [`A${j}`, 'W']), ['E', 'W'], ...range(1 << n).map(i => [`D${i}`, 'E'])]) };
  });
}

/** The top of a decoder's composition (n, en, bus): without an enable, its E at 1; bus pins joined by their bits. */
export function decoderTop(lib, p) {
  const n = p.n, tree = decTree(lib, n), m = 1 << n;
  const cell = p.en ? tree : lib.use(`D${n}_${m}`, () => {
    const c = canvas(`D${n}_${m}`, `D${n}_${m}: a ${n}-to-${m} decoder, the ${tree.name} enabled (E at 1).`);
    const I = c.inst(tree, 300, TOP, 'U0'), e = I.pin('E');
    // (E at 1: a VCC below the decoder, joined to E by its wire's name)
    const v = c.sym('vcc', { width: 1 }, XM, r10(TOP + I.def.h + 60)).pin('P');
    c.wire(v, { x: v.x, y: v.y + 20 }, { x: v.x + 60, y: v.y + 20 });
    c.label('one', v.x + 60, v.y + 20);
    stub(c, e, 'W', 'one');
    for (let j = 0; j < n; j++) { const q = I.pin(`A${j}`); c.marker(`A${j}`, 'in', 1, XM, q.y); c.wire({ x: XM, y: q.y }, q); }
    for (let i = 0; i < m; i++) { const q = I.pin(`D${i}`); c.marker(`D${i}`, 'out', 1, q.x + 160, q.y); c.wire(q, { x: q.x + 160, y: q.y }); }
    return { doc: c.doc, sides: Object.fromEntries([...range(n).map(j => [`A${j}`, 'W']), ...range(m).map(i => [`D${i}`, 'E'])]) };
  });
  if (!p.bus) return cell;
  return lib.use(`${cell.name}_BUS`, () => lanes(`${cell.name}_BUS`, `${cell.name}_BUS: the ${cell.name}, its address A and its outputs D buses.`,
    [{ name: 'A', dir: 'in', width: n }, ...(p.en ? [{ name: 'E', dir: 'in', width: 1 }] : []), { name: 'D', dir: 'out', width: m }],
    [{ mod: cell, label: 'U0', net: pin => (pin === 'E' ? 'E' : `${pin[0]}(${pin.slice(1)})`) }]));
}

// ------------------------------------------------------------------ demultiplexers

/** DMX1_(2^s)(E): O<S> = D (and E), the others 0: a decoder enabled by the data (and the enable). */
function demuxCell(lib, s, en) {
  const m = 1 << s, name = `DMX1_${m}${en ? 'E' : ''}`, dec = decTree(lib, s);
  return lib.use(name, () => {
    const c = canvas(name, `${name}: a 1-to-${m} demultiplexer, the ${dec.name} decoding the select S, enabled by the data D${en ? ' and E' : ''}.`);
    const I = c.inst(dec, 420, TOP, 'U0'), e = I.pin('E');
    for (let j = 0; j < s; j++) stub(c, I.pin(`A${j}`), 'W', `S${j}`);
    if (en) {
      const g = c.sym('and2', { width: 1, bits: false }, e.x - 160, e.y - 20);
      c.wire(g.pin('O'), { x: e.x - 40, y: g.pin('O').y }, { x: e.x - 40, y: e.y }, e);
      c.marker('D', 'in', 1, XM, g.pin('I0').y); c.wire({ x: XM, y: g.pin('I0').y }, g.pin('I0'));
      c.marker('E', 'in', 1, XM, g.pin('I1').y); c.wire({ x: XM, y: g.pin('I1').y }, g.pin('I1'));
    } else { c.marker('D', 'in', 1, XM, e.y); c.wire({ x: XM, y: e.y }, e); }
    const yS = r10(I.pin(`D${m - 1}`).y + 80);
    for (let j = 0; j < s; j++) { c.marker(`S${j}`, 'in', 1, XM, yS + ROW * j); c.wire({ x: XM, y: yS + ROW * j }, { x: XM + 40, y: yS + ROW * j }); }
    for (let i = 0; i < m; i++) { const q = I.pin(`D${i}`); c.marker(`O${i}`, 'out', 1, q.x + 160, q.y); c.wire(q, { x: q.x + 160, y: q.y }); }
    return { doc: c.doc, sides: Object.fromEntries([['D', 'W'], ...(en ? [['E', 'W']] : []), ...range(s).map(j => [`S${j}`, 'S']), ...range(m).map(i => [`O${i}`, 'E'])]) };
  });
}

/** The top of a demultiplexer's composition (width, sel, en, selBus, bits). */
export function demuxTop(lib, p) {
  const s = p.sel, m = 1 << s, w = p.width, cell = demuxCell(lib, s, !!p.en);
  return topOf(lib, cell, w, { ins: ['D'], outs: range(m).map(i => `O${i}`), selBus: !!p.selBus && s > 1, bits: !!p.bits, name: `${cell.name}_X${w}`,
    bitIn: (pin, r) => `D${r}`, bitOut: (pin, r) => `${pin}_${r}` });
}
