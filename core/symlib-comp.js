// The compositions of the comparators (#4810, part of #4806). Equal: COMP4, four XNOR2 (each bit's A = B) and an AND4;
// COMP n, blocks of COMP4 (COMP16 of four, COMP64 of four COMP16) and an AND of their EQ. Less than: the borrow of
// A − B, an SUB n's borrow out (#4807: an adder with B inverted); signed, the sign bits inverted first (the order of
// two's complement numbers is the unsigned order of their sign bits flipped). The others from these two: NE = not EQ,
// GE = not LT, LE = LT or EQ, GT = not LE. Isomorphic (no DOM).
import { lanes } from './symlib-draw.js';
import { subTop } from './symlib-add.js';
import { compareOps, comparePin } from './schdoc.js';

const range = n => [...Array(n).keys()];
const G = (type, net, width = 1) => ({ type, params: { width, bits: false }, net });
const bus = (g, w, hi, lo) => (hi === w - 1 && lo === 0 ? g : hi === lo ? `${g}(${hi})` : `${g}(${hi}:${lo})`);
// the size of the blocks of a comparator of n bits: the largest power of 4 below n
const chunkOf = n => { let k = 1; while (k * 4 < n) k *= 4; return k; };
const EQ_SIDES = { A: 'W', B: 'W', EQ: 'E' };

/** COMP n: EQ = 1 when A = B. */
function equal(lib, n) {
  const name = `COMP${n}`;
  return lib.use(name, () => {
    const markers = [{ name: 'A', dir: 'in', width: n }, { name: 'B', dir: 'in', width: n }, { name: 'EQ', dir: 'out', width: 1 }];
    if (n <= 4) {
      // (each bit's A = B, an XNOR2; all of them, an AND)
      const items = range(n).map(i => G('xnor2', { I0: bus('A', n, i, i), I1: bus('B', n, i, i), O: n === 1 ? 'EQ' : `e${i}` }));
      if (n > 1) items.push(G(`and${n}`, Object.fromEntries([...range(n).map(i => [`I${i}`, `e${i}`]), ['O', 'EQ']])));
      return lanes(name, `${name}: A = B, ${n === 1 ? 'an XNOR2' : `each bit's A = B an XNOR2, all of them an AND${n}`}.`, markers, items.map(g => ({ ...g, net: pin => g.net[pin] })), EQ_SIDES);
    }
    const k = chunkOf(n), parts = [];
    for (let lo = 0; lo < n; lo += k) parts.push({ lo, w: Math.min(k, n - lo) });
    const items = parts.map(({ lo, w }, i) => ({ mod: equal(lib, w), label: `U${i}`, net: pin => (pin === 'EQ' ? `e${i}` : bus(pin, n, lo + w - 1, lo)) }));
    items.push(G(`and${parts.length}`, Object.fromEntries([...parts.map((_, i) => [`I${i}`, `e${i}`]), ['O', 'EQ']])));
    return lanes(name, `${name}: A = B, ${parts.length} blocks of ${k} bits${parts[parts.length - 1].w < k ? ' (the last one smaller)' : ''}, all of them equal: an AND${parts.length}.`,
      markers, items.map(it => (typeof it.net === 'function' ? it : { ...it, net: pin => it.net[pin] })), EQ_SIDES);
  });
}

/** The top of a comparator's composition (width, op, signed, bits). */
export function compareTop(lib, p) {
  const n = p.width, ops = compareOps(p), signed = !!p.signed, bits = !!p.bits && n > 1;
  const name = `COMP${n}_${ops.map(o => o.toUpperCase()).join('_')}${signed ? '_S' : ''}${bits ? '_BITS' : ''}`;
  return lib.use(name, () => {
    const need = o => ops.includes(o);
    const eq = need('eq') || need('ne') || need('le') || need('gt'), lt = need('lt') || need('ge') || need('le') || need('gt');
    const items = [];
    // the operands as buses: their pins per bit joined (I0 the most significant); signed, for LT, their sign bits
    // inverted (a bus join of the sign bit inverted and the rest)
    const bit = (g, i) => (bits ? `${g}${i}` : bus(g, n, i, i));
    const join = (g, j, flip) => {
      if (flip) items.push(G('inv', { I: bit(g, n - 1), O: n === 1 ? j : `n_${j}` }));
      if (n === 1 && flip) return;
      const widths = bits ? Array(n).fill(1) : flip ? [1, n - 1] : null;
      if (widths) items.push({ type: 'busjoin', params: { widths: widths.join(',') }, net: pin => (pin === 'O' ? j : pin === 'I0' && flip ? `n_${j}` : bits ? `${g}${n - 1 - +pin.slice(1)}` : bus(g, n, n - 2, 0)) });
    };
    const a = bits ? 'AJ' : 'A', b = bits ? 'BJ' : 'B', flip = signed && lt;
    if (bits && (eq || !flip)) { join('A', 'AJ', false); join('B', 'BJ', false); }
    if (flip) { join('A', 'AS', true); join('B', 'BS', true); }
    const la = flip ? 'AS' : a, lb = flip ? 'BS' : b;
    if (eq) items.push({ mod: equal(lib, n), label: 'U0', net: pin => ({ A: a, B: b, EQ: 'n_eq' })[pin] });
    if (lt) items.push({ mod: subTop(lib, { width: n, bin: false, bout: true, bits: false }), label: 'U1', net: pin => ({ A: la, B: lb, BO: 'n_lt', D: null })[pin] });
    // the results: EQ and LT as they are, the others from them
    const out = o => comparePin(p, o);
    if (need('eq')) items.push(G('buf', { I: 'n_eq', O: out('eq') }));
    if (need('lt')) items.push(G('buf', { I: 'n_lt', O: out('lt') }));
    if (need('ne')) items.push(G('inv', { I: 'n_eq', O: out('ne') }));
    if (need('ge')) items.push(G('inv', { I: 'n_lt', O: out('ge') }));
    if (need('le') || need('gt')) items.push(G('or2', { I0: 'n_lt', I1: 'n_eq', O: need('le') ? out('le') : 'n_le' }));
    if (need('gt')) items.push(G('inv', { I: need('le') ? out('le') : 'n_le', O: out('gt') }));
    const ins = bits ? ['A', 'B'].flatMap(g => range(n).map(i => ({ name: `${g}${i}`, dir: 'in', width: 1 }))) : [{ name: 'A', dir: 'in', width: n }, { name: 'B', dir: 'in', width: n }];
    const what = [eq && 'EQ: a COMP' + n, lt && `LT: the borrow of A − B, an SUB${n}'s${signed ? ', the sign bits inverted first' : ''}`].filter(Boolean).join('; ');
    return lanes(name, `${name}: ${what}; ${ops.map(o => o.toUpperCase()).join(', ')} from them.`,
      [...ins, ...ops.map(o => ({ name: out(o), dir: 'out', width: 1 }))], items.map(it => (typeof it.net === 'function' ? it : { ...it, net: pin => it.net[pin] })));
  });
}
