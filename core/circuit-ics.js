// The ICs of a digital circuit (#3897, #3899, docs/CIRCUITS.md): each one's pinout (its datasheet's), its gates and its
// typical delay; the 74LS gates (their open collector ones too, buffers, Schmitt triggers, #4397) and the 4000 CMOS gates. The other parts (breadboards,
// the supply, switches, LEDs, displays): core/circuit-parts.js, which merges these. Isomorphic module.

// a DIP of n pins: pin 1 at its lower left, its notch on the left; 1 to n/2 left to right along the lower row, the rest
// right to left along the upper row, `rows` steps above (0.3 inch: it straddles a breadboard's channel, rows f and e)
export const dip = (n, rows = 3) => (k) => (k <= n / 2 ? { dx: k - 1, dy: 0 } : { dx: n - k, dy: -rows });

// the gates' pins, [inputs…, output] each
const QUAD = [[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]];   // 7400, 7403, 7408, 7432, 7486
const QUAD_Y1 = [[2, 3, 1], [5, 6, 4], [8, 9, 10], [11, 12, 13]];   // 7402, 7401 (outputs first)
const HEX = [[1, 2], [3, 4], [5, 6], [9, 8], [11, 10], [13, 12]];   // 7404, 7405, 7406, 7414, 4069
const TRIPLE3 = [[1, 2, 13, 12], [3, 4, 5, 6], [9, 10, 11, 8]];   // 7410, 7411, 7427
const DUAL4 = [[1, 2, 4, 5, 6], [9, 10, 12, 13, 8]];   // 7420 (3 and 11 not connected)
const OCT8 = [[1, 2, 3, 4, 5, 6, 11, 12, 8]];   // 7430 (9, 10, 13 not connected)
const QUAD_4001 = [[1, 2, 3], [5, 6, 4], [8, 9, 10], [12, 13, 11]];   // every 4000 quad 2-input gate: 4001, 4011, 4030, 4070, 4071, 4081 (74386 too)
const DUAL4_4002 = [[2, 3, 4, 5, 1], [9, 10, 11, 12, 13]];   // 4002, 4012, 4072 (6 and 8 not connected)
const TRIPLE3_4023 = [[1, 2, 8, 9], [3, 4, 5, 6], [11, 12, 13, 10]];   // 4023, 4025, 4073, 4075
const HEX_4049 = [[3, 2], [5, 4], [7, 6], [9, 10], [11, 12], [14, 15]];   // 4049, 4050 (16 pins: VDD 1, VSS 8; 13, 16 not connected)
const NAND13 = [[1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15, 9]];   // 74133 (16 pins: GND 8, VCC 16)
// the AND-OR-INVERT gates (#4397): [terms…, output], each term the inputs one AND takes (KiCad's symbols' grouping)
const AOI_7451 = [[[1, 12, 13], [9, 10, 11], 8], [[2, 3], [4, 5], 6]];   // 1Y = /(1A·1B·1C + 1D·1E·1F), 2Y = /(2A·2B + 2C·2D)
const AOI_7454 = [[[1, 2], [3, 4, 5], [9, 10, 11], [12, 13], 6]];   // the 74LS54's Y = /(AB + CDE + FGH + JK) (the 7454's differs)
const AOI_7455 = [[[1, 2, 3, 4], [10, 11, 12, 13], 8]];   // Y = /(ABCD + EFGH)

/**
 * A gate IC: its gates `fn` on `groups`, its pins named as its datasheet (1A, 1B, 1Y…; a single gate's A–H, Y), on a
 * DIP of 14 pins (VCC 14 and GND 7; a 4000's VDD and VSS) or 16 (`supply`: its VCC's and its GND's pins), the pins no
 * gate uses not connected (NC); `oc`: its outputs open collector.
 */
function gateIc(type, chip, title, fn, groups, tpd, { family = 'ttl', oc = false, pins: n = 14, supply = [14, 7] } = {}) {
  const at = dip(n);
  const pins = new Map();
  const one = groups.length === 1;
  const gates = groups.map((g, i) => {
    // (an AND-OR-INVERT's: its terms, each an array of inputs)
    const terms = Array.isArray(g[0]) ? g.slice(0, -1) : null;
    const ins = terms ? terms.flat() : g.slice(0, -1), out = g[g.length - 1];
    ins.forEach((p, j) => pins.set(p, { n: p, name: `${one ? '' : i + 1}${'ABCDEFGHJKLMN'[j]}`, dir: 'in' }));
    pins.set(out, { n: out, name: `${one ? '' : i + 1}Y`, dir: oc ? 'oc' : 'out' });
    return { fn, ins, out, ...(terms ? { terms: terms.map((t) => t.length) } : {}) };
  });
  pins.set(supply[1], { n: supply[1], name: family === 'ttl' ? 'GND' : 'VSS', dir: 'gnd' });
  pins.set(supply[0], { n: supply[0], name: family === 'ttl' ? 'VCC' : 'VDD', dir: 'vcc' });
  for (let k = 1; k <= n; k++) if (!pins.has(k)) pins.set(k, { n: k, name: 'NC', dir: 'nc' });
  return { type, title, kind: 'ic', family, chip, pins: [...pins.values()].sort((a, b) => a.n - b.n).map((p) => ({ ...p, ...at(p.n) })), gates, tpd, dip: n, ...(oc ? { oc: true } : {}) };
}
const ttl = (type, title, fn, groups, tpd, oc, more = {}) => gateIc(type, `SN74LS${type.slice(2)}`, title, fn, groups, tpd, { oc, ...more });
const cmos = (type, title, fn, groups, tpd, more = {}) => gateIc(type, `CD${type}B`, title, fn, groups, tpd, { family: 'cmos', ...more });

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
  // KiCad's other 74 gates (#4397): open collector, buffers, Schmitt triggers (a gate in a circuit's logic), more inputs
  ttl('7407', 'Hex buffer, open collector', 'buf', HEX, 15, true),
  ttl('7409', 'Quad 2-input AND, open collector', 'and', QUAD, 20, true),
  ttl('7412', 'Triple 3-input NAND, open collector', 'nand', TRIPLE3, 15, true),
  ttl('7413', 'Dual 4-input NAND, Schmitt trigger', 'nand', DUAL4, 15),
  ttl('7415', 'Triple 3-input AND, open collector', 'and', TRIPLE3, 20, true),
  ttl('7421', 'Dual 4-input AND', 'and', DUAL4, 12),
  ttl('7422', 'Dual 4-input NAND, open collector', 'nand', DUAL4, 15, true),
  ttl('7426', 'Quad 2-input NAND, open collector, high voltage', 'nand', QUAD, 15, true),
  ttl('7428', 'Quad 2-input NOR buffer', 'nor', QUAD_Y1, 12),
  ttl('7433', 'Quad 2-input NOR buffer, open collector', 'nor', QUAD_Y1, 15, true),
  ttl('7437', 'Quad 2-input NAND buffer', 'nand', QUAD, 12),
  ttl('7438', 'Quad 2-input NAND buffer, open collector', 'nand', QUAD, 15, true),
  ttl('7440', 'Dual 4-input NAND buffer', 'nand', DUAL4, 12),
  ttl('74132', 'Quad 2-input NAND, Schmitt trigger', 'nand', QUAD, 15),
  ttl('74133', '13-input NAND', 'nand', NAND13, 10, false, { pins: 16, supply: [16, 8] }),
  ttl('74136', 'Quad 2-input XOR, open collector', 'xor', QUAD, 20, true),
  ttl('74386', 'Quad 2-input XOR', 'xor', QUAD_4001, 12),
  ttl('7451', 'Dual AND-OR-INVERT (3-3 and 2-2 inputs)', 'aoi', AOI_7451, 13),
  ttl('7454', '4-wide AND-OR-INVERT (2-3-3-2 inputs)', 'aoi', AOI_7454, 13),
  ttl('7455', '2-wide 4-input AND-OR-INVERT', 'aoi', AOI_7455, 13),
  cmos('4001', 'Quad 2-input NOR', 'nor', QUAD_4001, 60),
  cmos('4011', 'Quad 2-input NAND', 'nand', QUAD_4001, 60),
  cmos('4030', 'Quad 2-input XOR', 'xor', QUAD_4001, 100),
  cmos('4069', 'Hex inverter', 'not', HEX, 45),
  cmos('4070', 'Quad 2-input XOR', 'xor', QUAD_4001, 140),
  cmos('4071', 'Quad 2-input OR', 'or', QUAD_4001, 60),
  cmos('4081', 'Quad 2-input AND', 'and', QUAD_4001, 60),
  // KiCad's other 4000 gates (#4397)
  cmos('4002', 'Dual 4-input NOR', 'nor', DUAL4_4002, 60),
  cmos('4012', 'Dual 4-input NAND', 'nand', DUAL4_4002, 60),
  cmos('4023', 'Triple 3-input NAND', 'nand', TRIPLE3_4023, 60),
  cmos('4025', 'Triple 3-input NOR', 'nor', TRIPLE3_4023, 60),
  cmos('4049', 'Hex inverting buffer', 'not', HEX_4049, 30, { pins: 16, supply: [1, 8] }),
  cmos('4050', 'Hex buffer', 'buf', HEX_4049, 50, { pins: 16, supply: [1, 8] }),
  cmos('4072', 'Dual 4-input OR', 'or', DUAL4_4002, 75),
  cmos('4073', 'Triple 3-input AND', 'and', TRIPLE3_4023, 60),
  cmos('4075', 'Triple 3-input OR', 'or', TRIPLE3_4023, 75),
  cmos('4077', 'Quad 2-input XNOR', 'xnor', QUAD_4001, 65),
];
