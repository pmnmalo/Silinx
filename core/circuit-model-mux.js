// The multiplexers, arithmetic, comparators and parity ICs written once in VHDL (#4397, group F; docs/CIRCUITS.md):
// KiCad's 74xx multiplexers (plain, inverting, three-state, with storage), the 74181 ALU and its 74182 carry generator,
// the 74280 parity generator and the 74688 comparator, as the decoders of core/circuit-model-decoders.js are: each its
// datasheet's pinout, its typical delay and its core, a VHDL architecture written here, run live by Try it,
// instantiated by the circuit's HDL, translated to Verilog by Silinx. Their data are active high (the 74181's table for
// active-high data: Cn and Cn+4 active low, P̅ and G̅ its propagate and generate for the 74182). The 74298 takes its
// selected word on its clock's falling edge, its register starting unknown (X).
// Isomorphic module.
import { ic, BAR } from './circuit-model-ics.js';
import { dip } from './circuit-ics.js';

// ------------------------------------------------------------------ the pins and the VHDL's pieces
const pinsOf = (n) => (rows) => rows.map(([k, name, dir, port]) => ({ n: k, name, dir, ...dip(n, n >= 24 ? 6 : 3)(k), port: port ?? name.toLowerCase() })).sort((a, b) => a.n - b.n);
const M14 = pinsOf(14), M16 = pinsOf(16), M20 = pinsOf(20), M24 = pinsOf(24);
const NOT = (e) => `(not ${e})`;
const and = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join(' and ')})`);
const or = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join(' or ')})`);
const minterm = (ins, k) => and(ins.map((x, b) => ((k >> b) & 1 ? x : NOT(x))));
/** A multiplexer: the data `data[k]` selected by `sel` (the least significant first), as a sum of products. */
const mux = (sel, data) => or(data.map((d, k) => and([minterm(sel, k), d])));
const raw = (body, decl = []) => ({ decl, body });
const CLOCKED = '-- silinx: ignore data-as-clock';

// ------------------------------------------------------------------ quad 2-to-1: 74158 (inverting), 74257, 74258 (three-state)
// A/B̅ low selects A, high B; G̅ high: the 74158's outputs high, the 74257's and 74258's off
const PINS_157 = (inv) => M16([[1, `A/B${BAR}`, 'in', 'sel'], [2, '1A', 'in', 'a1'], [3, '1B', 'in', 'b1'], [4, `1Y${inv ? BAR : ''}`, 'out', 'y1'], [5, '2A', 'in', 'a2'], [6, '2B', 'in', 'b2'],
  [7, `2Y${inv ? BAR : ''}`, 'out', 'y2'], [8, 'GND', 'gnd'], [9, `3Y${inv ? BAR : ''}`, 'out', 'y3'], [10, '3B', 'in', 'b3'], [11, '3A', 'in', 'a3'], [12, `4Y${inv ? BAR : ''}`, 'out', 'y4'],
  [13, '4B', 'in', 'b4'], [14, '4A', 'in', 'a4'], [15, `G${BAR}`, 'in', 'g_n'], [16, 'VCC', 'vcc']]);
const QUAD2 = (inv, gated) => raw([1, 2, 3, 4].map((k) => { const y = mux(['sel'], [`a${k}`, `b${k}`]); return `y${k} <= ${inv ? NOT(gated ? and([NOT('g_n'), y]) : y) : y};`; }));
const c74158 = ic('74158', 'Quad 2-to-1 line multiplexer, inverting', 12, PINS_157(true), QUAD2(true, true));
const c74257 = ic('74257', 'Quad 2-to-1 line multiplexer, 3-state outputs', 12, PINS_157(false), QUAD2(false, false), 'ttl', [['g_n', '0']]);
const c74258 = ic('74258', 'Quad 2-to-1 line multiplexer, inverting, 3-state outputs', 12, PINS_157(true), QUAD2(true, false), 'ttl', [['g_n', '0']]);

// ------------------------------------------------------------------ 8-to-1: 74251 (Y and W three-state)
const c74251 = ic('74251', '8-to-1 line multiplexer, 3-state outputs', 25, M16([[1, 'D3', 'in', 'd3'], [2, 'D2', 'in', 'd2'], [3, 'D1', 'in', 'd1'], [4, 'D0', 'in', 'd0'], [5, 'Y', 'out', 'y'],
  [6, 'W', 'out', 'w'], [7, `G${BAR}`, 'in', 'g_n'], [8, 'GND', 'gnd'], [9, 'C', 'in', 'c'], [10, 'B', 'in', 'b'], [11, 'A', 'in', 'a'], [12, 'D7', 'in', 'd7'], [13, 'D6', 'in', 'd6'], [14, 'D5', 'in', 'd5'],
  [15, 'D4', 'in', 'd4'], [16, 'VCC', 'vcc']]), raw([`y <= ${mux(['a', 'b', 'c'], Array.from({ length: 8 }, (_, k) => `d${k}`))};`, `w <= ${NOT(mux(['a', 'b', 'c'], Array.from({ length: 8 }, (_, k) => `d${k}`)))};`]),
'ttl', [['g_n', '0']]);

// ------------------------------------------------------------------ dual 4-to-1 (the 74153's pinout): 74253 (three-state), 74352 (inverting), 74353 (both)
// a section's 1C0–1C3 selected by B and A; the 74352's G̅ high: its Y̅ high; the 74253's and 74353's: its output off
const PINS_153 = (inv) => M16([[1, `1G${BAR}`, 'in', 'g1_n'], [2, 'B', 'in', 'b'], [3, '1C3', 'in', 'c13'], [4, '1C2', 'in', 'c12'], [5, '1C1', 'in', 'c11'], [6, '1C0', 'in', 'c10'],
  [7, `1Y${inv ? BAR : ''}`, 'out', 'y1'], [8, 'GND', 'gnd'], [9, `2Y${inv ? BAR : ''}`, 'out', 'y2'], [10, '2C0', 'in', 'c20'], [11, '2C1', 'in', 'c21'], [12, '2C2', 'in', 'c22'], [13, '2C3', 'in', 'c23'],
  [14, 'A', 'in', 'a'], [15, `2G${BAR}`, 'in', 'g2_n'], [16, 'VCC', 'vcc']]);
const DUAL4 = (inv, gated) => raw([1, 2].map((k) => { const y = mux(['a', 'b'], [0, 1, 2, 3].map((j) => `c${k}${j}`)); return `y${k} <= ${inv ? NOT(gated ? and([NOT(`g${k}_n`), y]) : y) : y};`; }));
const TWO = { sections: [{ enable: [['g1_n', '0']], outs: ['y1'] }, { enable: [['g2_n', '0']], outs: ['y2'] }] };
const c74253 = ic('74253', 'Dual 4-to-1 line multiplexer, 3-state outputs', 20, PINS_153(false), DUAL4(false, false), 'ttl', TWO);
const c74352 = ic('74352', 'Dual 4-to-1 line multiplexer, inverting', 20, PINS_153(true), DUAL4(true, true));
const c74353 = ic('74353', 'Dual 4-to-1 line multiplexer, inverting, 3-state outputs', 20, PINS_153(true), DUAL4(true, false), 'ttl', TWO);

// ------------------------------------------------------------------ quad 2-to-1 with storage: 74298 (falling edge)
// on CLK's falling edge WS low takes word 1 (A1–D1), high word 2 (A2–D2)
const STORED = raw([CLOCKED, 'process (clk)', 'begin', '  if falling_edge(clk) then', "    if ws = '0' then q <= d1 & c1 & b1 & a1;", "    elsif ws = '1' then q <= d2 & c2 & b2 & a2;",
  "    else q <= (others => 'X');", '    end if;', '  end if;', 'end process;', ...['qa', 'qb', 'qc', 'qd'].map((p, b) => `${p} <= q(${b});`)],
["signal q : std_logic_vector(3 downto 0) := (others => 'X');"]);
const c74298 = ic('74298', 'Quad 2-input multiplexer with storage (falling edge)', 20, M16([[1, 'B2', 'in', 'b2'], [2, 'A2', 'in', 'a2'], [3, 'A1', 'in', 'a1'], [4, 'B1', 'in', 'b1'], [5, 'C2', 'in', 'c2'],
  [6, 'D2', 'in', 'd2'], [7, 'D1', 'in', 'd1'], [8, 'GND', 'gnd'], [9, 'C1', 'in', 'c1'], [10, 'WS', 'in', 'ws'], [11, 'CLK', 'in', 'clk'], [12, 'QD', 'out', 'qd'], [13, 'QC', 'out', 'qc'],
  [14, 'QB', 'out', 'qb'], [15, 'QA', 'out', 'qa'], [16, 'VCC', 'vcc']]), STORED);

// ------------------------------------------------------------------ 74181: 4-bit ALU (active-high data)
// each bit's propagate p = A + B·S0 + B̅·S1 and generate g = A·B·S3 + A·B̅·S2 (g implies p): M high (logic) F = p ⊙ g;
// M low (arithmetic) F = p plus g plus the carry in (Cn low): the datasheet's 16 functions of each; its carries look
// ahead: Cn+4 low on a carry out; P̅ low while all four propagate, G̅ low while the group generates; A=B (open
// collector) high while F is 1111
const BITS = [0, 1, 2, 3];
// (the carry out of bit k: its generate, or a generate below it and the propagates between, or the carry in and all the propagates)
const carry = (k) => or([...Array.from({ length: k + 1 }, (_, i) => k - i).map((j) => and([...Array.from({ length: k - j }, (_, i) => `p${k - i}`), `g${j}`])),
  and([...Array.from({ length: k + 1 }, (_, i) => `p${k - i}`), 'c0'])]);
const c74181 = ic('74181', '4-bit arithmetic logic unit', 24, M24([[1, 'B0', 'in', 'b0'], [2, 'A0', 'in', 'a0'], [3, 'S3', 'in', 's3'], [4, 'S2', 'in', 's2'], [5, 'S1', 'in', 's1'], [6, 'S0', 'in', 's0'],
  [7, 'Cn', 'in', 'cn'], [8, 'M', 'in', 'm'], [9, 'F0', 'out', 'f0'], [10, 'F1', 'out', 'f1'], [11, 'F2', 'out', 'f2'], [12, 'GND', 'gnd'], [13, 'F3', 'out', 'f3'], [14, 'A=B', 'oc', 'aeqb'],
  [15, `P${BAR}`, 'out', 'p_n'], [16, 'Cn+4', 'out', 'cn4'], [17, `G${BAR}`, 'out', 'g_n'], [18, 'B3', 'in', 'b3'], [19, 'A3', 'in', 'a3'], [20, 'B2', 'in', 'b2'], [21, 'A2', 'in', 'a2'], [22, 'B1', 'in', 'b1'],
  [23, 'A1', 'in', 'a1'], [24, 'VCC', 'vcc']]), raw([
  ...BITS.flatMap((k) => [`p${k} <= ${or([`a${k}`, and([`b${k}`, 's0']), and([NOT(`b${k}`), 's1'])])};`, `g${k} <= ${or([and([`a${k}`, `b${k}`, 's3']), and([`a${k}`, NOT(`b${k}`), 's2'])])};`]),
  'c0 <= not cn;', ...BITS.map((k) => `c${k + 1} <= ${carry(k)};`),
  ...BITS.flatMap((k) => [`r${k} <= ${NOT(`(p${k} xor g${k})`)} when m = '1' else (p${k} xor g${k} xor c${k});`, `f${k} <= r${k};`]),
  'aeqb <= r0 and r1 and r2 and r3;', 'cn4 <= not c4;', `p_n <= ${NOT(and(['p0', 'p1', 'p2', 'p3']))};`,
  `g_n <= ${NOT(or(['g3', and(['p3', 'g2']), and(['p3', 'p2', 'g1']), and(['p3', 'p2', 'p1', 'g0'])]))};`],
['signal p0, p1, p2, p3, g0, g1, g2, g3, c0, c1, c2, c3, c4, r0, r1, r2, r3 : std_logic;']));

// ------------------------------------------------------------------ 74182: look-ahead carry generator (its inputs' P̅ and G̅ active low)
// Cn+x, Cn+y, Cn+z the carries into the 2nd, 3rd, 4th ALU; P̅ low while all four propagate, G̅ low while the group generates
const c74182 = ic('74182', 'Look-ahead carry generator', 13, M16([[1, `G1${BAR}`, 'in', 'g1_n'], [2, `P1${BAR}`, 'in', 'p1_n'], [3, `G0${BAR}`, 'in', 'g0_n'], [4, `P0${BAR}`, 'in', 'p0_n'],
  [5, `G3${BAR}`, 'in', 'g3_n'], [6, `P3${BAR}`, 'in', 'p3_n'], [7, `P${BAR}`, 'out', 'p_n'], [8, 'GND', 'gnd'], [9, 'Cn+z', 'out', 'cnz'], [10, `G${BAR}`, 'out', 'g_n'], [11, 'Cn+y', 'out', 'cny'],
  [12, 'Cn+x', 'out', 'cnx'], [13, 'Cn', 'in', 'cn'], [14, `G2${BAR}`, 'in', 'g2_n'], [15, `P2${BAR}`, 'in', 'p2_n'], [16, 'VCC', 'vcc']]), raw([
  ...BITS.flatMap((k) => [`p${k} <= not p${k}_n;`, `g${k} <= not g${k}_n;`]), 'c0 <= cn;', ...[0, 1, 2].map((k) => `${['cnx', 'cny', 'cnz'][k]} <= ${carry(k)};`),
  `p_n <= ${NOT(and(['p0', 'p1', 'p2', 'p3']))};`, `g_n <= ${NOT(or(['g3', and(['p3', 'g2']), and(['p3', 'p2', 'g1']), and(['p3', 'p2', 'p1', 'g0'])]))};`],
['signal p0, p1, p2, p3, g0, g1, g2, g3, c0 : std_logic;']));

// ------------------------------------------------------------------ 74280: 9-bit parity generator/checker; 74688: 8-bit identity comparator
// ΣEVEN high while an even number of A–I are high, ΣODD its complement
const c74280 = ic('74280', '9-bit odd/even parity generator/checker', 33, M14([[1, 'G', 'in', 'g'], [2, 'H', 'in', 'h'], [3, 'NC', 'nc'], [4, 'I', 'in', 'i'], [5, 'ΣEVEN', 'out', 'even'],
  [6, 'ΣODD', 'out', 'odd'], [7, 'GND', 'gnd'], [8, 'A', 'in', 'a'], [9, 'B', 'in', 'b'], [10, 'C', 'in', 'c'], [11, 'D', 'in', 'd'], [12, 'E', 'in', 'e'], [13, 'F', 'in', 'f'], [14, 'VCC', 'vcc']]),
raw(['x <= a xor b xor c xor d xor e xor f xor g xor h xor i;', 'odd <= x;', 'even <= not x;'], ["signal x : std_logic;"]));
// P=Q̅ low while G̅ is low and P0–P7 are Q0–Q7
const c74688 = ic('74688', '8-bit identity comparator', 15, M20([[1, `G${BAR}`, 'in', 'g_n'], ...Array.from({ length: 4 }, (_, k) => [[2 + 2 * k, `P${k}`, 'in', `p${k}`], [3 + 2 * k, `Q${k}`, 'in', `q${k}`]]).flat(),
  [10, 'GND', 'gnd'], ...Array.from({ length: 4 }, (_, k) => [[11 + 2 * k, `P${k + 4}`, 'in', `p${k + 4}`], [12 + 2 * k, `Q${k + 4}`, 'in', `q${k + 4}`]]).flat(), [19, `P=Q${BAR}`, 'out', 'peq_n'],
  [20, 'VCC', 'vcc']]), raw([`peq_n <= ${NOT(and([NOT('g_n'), ...Array.from({ length: 8 }, (_, k) => NOT(`(p${k} xor q${k})`))]))};`]));

/** The multiplexers, arithmetic, comparators and parity ICs written once in VHDL (#4397, group F), as the library lists them. */
export const MUX_ICS = [c74158, c74257, c74258, c74251, c74253, c74352, c74353, c74298, c74181, c74182, c74280, c74688].map((d) => ({ ...d, msi: true }));
