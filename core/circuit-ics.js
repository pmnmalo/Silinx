// The ICs of a digital circuit (#3897, #3899, docs/CIRCUITS.md): each one's pinout (its datasheet's), its gates and its
// typical delay; the 74LS gates (their open collector ones too) and the 4000 CMOS gates. The other parts (breadboards,
// the supply, switches, LEDs, displays): core/circuit-parts.js, which merges these. Isomorphic module.

// a DIP of n pins: pin 1 at its lower left, its notch on the left; 1 to n/2 left to right along the lower row, the rest
// right to left along the upper row, `rows` steps above (0.3 inch: it straddles a breadboard's channel, rows f and e)
export const dip = (n, rows = 3) => (k) => (k <= n / 2 ? { dx: k - 1, dy: 0 } : { dx: n - k, dy: -rows });
const DIP14 = dip(14);

// the gates' pins, [inputs…, output] each
const QUAD = [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]];   // 7400, 7403, 7408, 7432, 7486
const QUAD_Y1 = [[2, 3, 1], [5, 6, 4], [8, 9, 10], [11, 12, 13]];   // 7402, 7401 (outputs first)
const HEX = [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]];   // 7404, 7405, 7406, 7414, 4069
const TRIPLE3 = [[1, 2, 13, 12], [3, 4, 5, 6], [9, 10, 11, 8]];   // 7410, 7411, 7427
const DUAL4 = [[1, 2, 4, 5, 6], [9, 10, 12, 13, 8]];   // 7420 (3 and 11 not connected)
const OCT8 = [[1, 2, 3, 4, 5, 6, 11, 12, 8]];   // 7430 (9, 10, 13 not connected)
const QUAD_4001 = [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]];   // every 4000 quad 2-input gate: 4001, 4011, 4030, 4070, 4071, 4081

/**
 * A 14-pin gate IC: its gates `fn` on `groups`, its pins named as its datasheet (1A, 1B, 1Y…; a single gate's A–H, Y),
 * VCC 14 and GND 7 (a 4000's VDD and VSS), the pins no gate uses not connected (NC); `oc`: its outputs open collector.
 */
function gateIc(type, chip, title, fn, groups, tpd, { family = 'ttl', oc = false } = {}) {
  const pins = new Map();
  const one = groups.length === 1;
  const gates = groups.map((g, i) => {
    const ins = g.slice(0, -1), out = g[g.length - 1];
    ins.forEach((p, j) => pins.set(p, { n: p, name: `${one ? '' : i + 1}${'ABCDEFGH'[j]}`, dir: 'in' }));
    pins.set(out, { n: out, name: `${one ? '' : i + 1}Y`, dir: oc ? 'oc' : 'out' });
    return { fn, ins, out };
  });
  pins.set(7, { n: 7, name: family === 'ttl' ? 'GND' : 'VSS', dir: 'gnd' });
  pins.set(14, { n: 14, name: family === 'ttl' ? 'VCC' : 'VDD', dir: 'vcc' });
  for (let n = 1; n <= 14; n++) if (!pins.has(n)) pins.set(n, { n, name: 'NC', dir: 'nc' });
  return { type, title, kind: 'ic', family, chip, pins: [...pins.values()].sort((a, b) => a.n - b.n).map((p) => ({ ...p, ...DIP14(p.n) })), gates, tpd, dip: 14, ...(oc ? { oc: true } : {}) };
}
const ttl = (type, title, fn, groups, tpd, oc) => gateIc(type, `SN74LS${type.slice(2)}`, title, fn, groups, tpd, { oc });
const cmos = (type, title, fn, groups, tpd) => gateIc(type, `CD${type}B`, title, fn, groups, tpd, { family: 'cmos' });

// tpd: the datasheets' typical propagation delay (ns; a 4000's at 5 V), one value for both edges
export const ICS = [
  ttl('7400', 'Quad 2-input NAND', 'nand', QUAD, 10),
  ttl('7401', 'Quad 2-input NAND, open collector', 'nand', QUAD_Y1, 17, true),
  ttl('7402', 'Quad 2-input NOR', 'nor', QUAD_Y1, 10),
  ttl('7403', 'Quad 2-input NAND, open collector', 'nand', QUAD, 17, true),
  ttl('7404', 'Hex inverter', 'not', HEX, 10),
  ttl('7405', 'Hex inverter, open collector', 'not', HEX, 17, true),
  ttl('7406', 'Hex inverter buffer, open collector', 'not', HEX, 15, true),
  ttl('7408', 'Quad 2-input AND', 'and', QUAD, 10),
  ttl('7410', 'Triple 3-input NAND', 'nand', TRIPLE3, 10),
  ttl('7411', 'Triple 3-input AND', 'and', TRIPLE3, 10),
  ttl('7414', 'Hex Schmitt-trigger inverter', 'not', HEX, 15),
  ttl('7420', 'Dual 4-input NAND', 'nand', DUAL4, 10),
  ttl('7427', 'Triple 3-input NOR', 'nor', TRIPLE3, 10),
  ttl('7430', '8-input NAND', 'nand', OCT8, 12),
  ttl('7432', 'Quad 2-input OR', 'or', QUAD, 14),
  ttl('7486', 'Quad 2-input XOR', 'xor', QUAD, 12),
  cmos('4001', 'Quad 2-input NOR', 'nor', QUAD_4001, 60),
  cmos('4011', 'Quad 2-input NAND', 'nand', QUAD_4001, 60),
  cmos('4030', 'Quad 2-input XOR', 'xor', QUAD_4001, 100),
  cmos('4069', 'Hex inverter', 'not', HEX, 45),
  cmos('4070', 'Quad 2-input XOR', 'xor', QUAD_4001, 140),
  cmos('4071', 'Quad 2-input OR', 'or', QUAD_4001, 60),
  cmos('4081', 'Quad 2-input AND', 'and', QUAD_4001, 60),
];
