// The compositions of the counters (#4811, part of #4806): a counter is a register and an incrementer, Q ← Q + 1 at
// the clock edge (CB8CE: an FDCE of 8 bits and an INC8). INC4 is four half adders, HA: S = A xor CI, CO = A and CI,
// their carries chained as an adder's (#4807, its carry in 1); a down counter's DEC4 four half subtractors, HS: S = A
// xor CI, CO = (not A) and CI, the borrow. The register's CE, CLR (asynchronous) or R (synchronous) the counter's.
// Isomorphic (no DOM).
import { canvas, lanes, stub } from './symlib-draw.js';
import { chain } from './symlib-add.js';
import { ffVariant } from './schdoc.js';

const XM = 100;
const range = n => [...Array(n).keys()];
const CARRY_SIDES = { A: 'W', CI: 'S', S: 'E', CO: 'N' };

/** HA (up) or HS (down): S = A xor CI; CO = A and CI, or (not A) and CI. */
function half(lib, down) {
  const name = down ? 'HS' : 'HA';
  return lib.use(name, () => {
    const c = canvas(name, down ? 'HS: a half subtractor, S = A xor CI (A − CI), CO = (not A) and CI (its borrow).' : 'HA: a half adder, S = A xor CI (A + CI), CO = A and CI (its carry).');
    const G = (type, x, y) => c.sym(type, { width: 1, bits: false }, x, y);
    const x = G('xor2', 300, 100), a = G('and2', 300, 180);
    c.marker('A', 'in', 1, XM, 110);
    c.wire({ x: XM, y: 110 }, x.pin('I0'));
    if (down) {
      const n = G('inv', 170, 180);
      c.wire({ x: 150, y: 110 }, { x: 150, y: 190 }, n.pin('I'));
      c.wire(n.pin('O'), a.pin('I0'));
    } else c.wire({ x: 150, y: 110 }, { x: 150, y: 190 }, a.pin('I0'));
    // (CI to the AND, and to the XOR by its name)
    c.marker('CI', 'in', 1, XM, 210);
    c.wire({ x: XM, y: 210 }, a.pin('I1'));
    stub(c, x.pin('I1'), 'W', 'CI');
    c.marker('S', 'out', 1, 500, x.pin('O').y); c.wire(x.pin('O'), { x: 500, y: x.pin('O').y });
    c.marker('CO', 'out', 1, 500, a.pin('O').y); c.wire(a.pin('O'), { x: 500, y: a.pin('O').y });
    return { doc: c.doc, sides: CARRY_SIDES };
  });
}

/** INC n (DEC n): A + CI (A − CI), a chain of HA (HS) as an adder's of FA1, at most four blocks to a level. */
function incdec(lib, n, down) {
  if (n === 1) return half(lib, down);
  const name = `${down ? 'DEC' : 'INC'}${n}`;
  return lib.use(name, () => chain(lib, name, n, { ci: 'pin', co: 'pin' }, {
    block: w => incdec(lib, w, down), ops: ['A'],
    describe: (nm, k, blocks) => {
      const counts = new Map();
      for (const b of blocks) { const m = b.w === 1 ? (down ? 'HS' : 'HA') : `${down ? 'DEC' : 'INC'}${b.w}`; counts.set(m, (counts.get(m) || 0) + 1); }
      return `${nm}: A ${down ? '−' : '+'} CI on ${k} bits, ${[...counts].map(([m, c]) => (c > 1 ? `${c} × ${m}` : m)).join(' and ')}, each one's ${down ? 'borrow' : 'carry'} out the ${down ? 'borrow' : 'carry'} in of the next.`;
    },
  }));
}

/** The top of a counter's composition (width, en, reset, dir, bits): its register and its incrementer (decrementer). */
export function counterTop(lib, p) {
  const n = p.width, down = p.dir === 'down', en = !!p.en, reset = p.reset === 'sync' ? 'sync' : p.reset === 'none' ? 'none' : 'async';
  const bits = !!p.bits && n > 1, step = incdec(lib, n, down);
  const ff = ffVariant('fd', { ce: en, clr: reset === 'async', r: reset === 'sync' });
  const name = `CB${n}${down ? 'D' : ''}${reset === 'async' ? 'C' : reset === 'sync' ? 'R' : ''}${en ? 'E' : ''}${bits ? '_BITS' : ''}`;
  return lib.use(name, () => {
    const q = bits ? 'n_q' : 'Q';
    const items = [
      // (the count's next value: Q ± 1, the step's carry in 1)
      { mod: step, label: 'U0', net: pin => ({ A: q, CI: 'one', S: 'n_next', CO: null })[pin] },
      { type: 'vcc', params: { width: 1 }, net: () => 'one' },
      { type: ff, params: { width: n }, net: pin => ({ D: 'n_next', Q: q })[pin] ?? pin },
      ...(bits ? range(n).map(i => ({ type: 'slice', params: { msb: i, lsb: i }, net: pin => (pin === 'I' ? q : `Q${i}`) })) : []),
    ];
    const ctl = [...(en ? ['CE'] : []), 'C', ...(reset === 'async' ? ['CLR'] : reset === 'sync' ? ['R'] : [])];
    const markers = [...ctl.map(c => ({ name: c, dir: 'in', width: 1 })), ...(bits ? range(n).map(i => ({ name: `Q${i}`, dir: 'out', width: 1 })) : [{ name: 'Q', dir: 'out', width: n }])];
    return lanes(name, `${name}: a ${down ? 'down ' : ''}counter of ${n} bits, an ${ff.toUpperCase()} of ${n} bits (Q) and an ${step.name} (Q ${down ? '−' : '+'} 1, its next value)${en ? ', counting while CE = 1' : ''}${reset === 'async' ? ', cleared by CLR at once' : reset === 'sync' ? ', reset by R at the clock edge' : ''}.`, markers, items);
  });
}

