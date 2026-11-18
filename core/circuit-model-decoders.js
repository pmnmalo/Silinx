// The decoders, display drivers and encoders written once in VHDL (#4397, group F; docs/CIRCUITS.md): KiCad's 74xx and
// 4xxx decoders, BCD to 7-segment drivers and priority encoders, as the flip-flops of core/circuit-model-ics.js are:
// each its datasheet's pinout, its typical delay and its core, a VHDL architecture written here, run live by Try it,
// instantiated by the circuit's HDL, translated to Verilog by Silinx. Their logic is written as sums of products of
// their inputs (an unknown input: an unknown output where it matters). A display driver's segments are the 7447's
// (core/circuit-msi.js SEGMENTS: no tails on 6 and 9; the 4543's, blank above 9), the 74246–74248's with tails (6
// lights a, 9 lights d), as their datasheets draw them. The 74246–74248's BI̅/RBO̅ (a wired AND on the chip) is their
// RBO̅ output, an open collector low while a zero is blanked: driven low, it does not blank them.
// Isomorphic module.
import { ic, BAR } from './circuit-model-ics.js';
import { dip } from './circuit-ics.js';
import { SEGMENTS } from './circuit-msi.js';

// ------------------------------------------------------------------ the pins and the VHDL's pieces
// (a DIP's pins by number: [n, name, dir, port]; a 24-pin DIP 0.6 inch wide, six rows across)
const pinsOf = (n) => (rows) => rows.map(([k, name, dir, port]) => ({ n: k, name, dir, ...dip(n, n >= 24 ? 6 : 3)(k), port: port ?? name.toLowerCase() })).sort((a, b) => a.n - b.n);
const M14 = pinsOf(14), M16 = pinsOf(16), M24 = pinsOf(24);
const NOT = (e) => `(not ${e})`;
const and = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join(' and ')})`);
const or = (xs) => (xs.length === 0 ? "'0'" : xs.length === 1 ? xs[0] : `(${xs.join(' or ')})`);
/** The minterm k of the inputs `ins` (the least significant first): their literals ANDed. */
const minterm = (ins, k) => and(ins.map((x, b) => ((k >> b) & 1 ? x : NOT(x))));
const raw = (body) => ({ decl: [], body });
// (a latch on purpose: the chip's own, its lint's warning silenced)
const latch = (en, level, pairs) => [`process (${[en, ...pairs.map(([, d]) => d)].join(', ')})`, 'begin', '  -- silinx: ignore latch', `  if ${en} = '${level}' then`,
  ...pairs.map(([q, d]) => `    ${q} <= ${d};`), '  end if;', 'end process;'];
const ABCD = ['a', 'b', 'c', 'd'];

// ------------------------------------------------------------------ BCD to decimal: 7442 (active low), 74145 (open collector), 4028 (active high)
// 7442, 74145: Y0̅–Y9̅ low for 0–9, all high for 10–15
const PINS_42 = (dir) => M16([[1, `Y0${BAR}`, dir, 'y0_n'], [2, `Y1${BAR}`, dir, 'y1_n'], [3, `Y2${BAR}`, dir, 'y2_n'], [4, `Y3${BAR}`, dir, 'y3_n'], [5, `Y4${BAR}`, dir, 'y4_n'],
  [6, `Y5${BAR}`, dir, 'y5_n'], [7, `Y6${BAR}`, dir, 'y6_n'], [8, 'GND', 'gnd'], [9, `Y7${BAR}`, dir, 'y7_n'], [10, `Y8${BAR}`, dir, 'y8_n'], [11, `Y9${BAR}`, dir, 'y9_n'], [12, 'D', 'in', 'd'],
  [13, 'C', 'in', 'c'], [14, 'B', 'in', 'b'], [15, 'A', 'in', 'a'], [16, 'VCC', 'vcc']]);
const DECIMAL = raw(Array.from({ length: 10 }, (_, k) => `y${k}_n <= ${NOT(minterm(ABCD, k))};`));
const c7442 = ic('7442', 'BCD to decimal decoder', 17, PINS_42('out'), DECIMAL);
const c74145 = ic('74145', 'BCD to decimal decoder/driver, open collector', 50, PINS_42('oc'), DECIMAL);
// 4028: Q0–Q9 high for 0–9, all low for 10–15
const c4028 = ic('4028', 'BCD to decimal decoder', 175, M16([[1, 'Q4', 'out', 'q4'], [2, 'Q2', 'out', 'q2'], [3, 'Q0', 'out', 'q0'], [4, 'Q7', 'out', 'q7'], [5, 'Q9', 'out', 'q9'], [6, 'Q5', 'out', 'q5'],
  [7, 'Q6', 'out', 'q6'], [8, 'VSS', 'gnd'], [9, 'Q8', 'out', 'q8'], [10, 'A', 'in', 'a'], [11, 'D', 'in', 'd'], [12, 'C', 'in', 'c'], [13, 'B', 'in', 'b'], [14, 'Q1', 'out', 'q1'], [15, 'Q3', 'out', 'q3'],
  [16, 'VDD', 'vcc']]), raw(Array.from({ length: 10 }, (_, k) => `q${k} <= ${minterm(ABCD, k)};`)), 'cmos');

// ------------------------------------------------------------------ binary decoders: 74137, 74237 (address latches), 74238, 74154, 74155, 74156
// 74137 (outputs active low), 74237 (high): A, B, C latched while GL̅ is high, followed while it is low; an output
// active while G1 is high and G2̅ low
const PINS_137 = (low) => M16([[1, 'A', 'in', 'a'], [2, 'B', 'in', 'b'], [3, 'C', 'in', 'c'], [4, `GL${BAR}`, 'in', 'gl_n'], [5, `G2${BAR}`, 'in', 'g2_n'], [6, 'G1', 'in', 'g1'],
  [7, `Y7${low ? BAR : ''}`, 'out', low ? 'y7_n' : 'y7'], [8, 'GND', 'gnd'], ...[6, 5, 4, 3, 2, 1, 0].map((k, i) => [9 + i, `Y${k}${low ? BAR : ''}`, 'out', low ? `y${k}_n` : `y${k}`]), [16, 'VCC', 'vcc']]);
const latched = (low) => ({ decl: ["signal la, lb, lc : std_logic := 'X';"], body: [...latch('gl_n', '0', [['la', 'a'], ['lb', 'b'], ['lc', 'c']]),
  ...Array.from({ length: 8 }, (_, k) => { const e = and(['g1', NOT('g2_n'), minterm(['la', 'lb', 'lc'], k)]); return low ? `y${k}_n <= ${NOT(e)};` : `y${k} <= ${e};`; })] });
const c74137 = ic('74137', '3-to-8 line decoder with address latches, outputs active low', 22, PINS_137(true), latched(true));
const c74237 = ic('74237', '3-to-8 line decoder with address latches, outputs active high', 22, PINS_137(false), latched(false), 'ttl', null, 'SN74HC237');
// 74238: the 74138's with outputs active high
const c74238 = ic('74238', '3-to-8 line decoder, outputs active high', 22, M16([[1, 'A', 'in', 'a'], [2, 'B', 'in', 'b'], [3, 'C', 'in', 'c'], [4, `G2A${BAR}`, 'in', 'g2a_n'], [5, `G2B${BAR}`, 'in', 'g2b_n'],
  [6, 'G1', 'in', 'g1'], [7, 'Y7', 'out', 'y7'], [8, 'GND', 'gnd'], ...[6, 5, 4, 3, 2, 1, 0].map((k, i) => [9 + i, `Y${k}`, 'out', `y${k}`]), [16, 'VCC', 'vcc']]),
raw(Array.from({ length: 8 }, (_, k) => `y${k} <= ${and(['g1', NOT('g2a_n'), NOT('g2b_n'), minterm(['a', 'b', 'c'], k)])};`)), 'ttl', null, 'SN74HC238');
// 74154: 4-to-16, an output low while G1̅ and G2̅ are low
const c74154 = ic('74154', '4-to-16 line decoder', 23, M24([...Array.from({ length: 11 }, (_, k) => [k + 1, `${k}${BAR}`, 'out', `y${k}_n`]), [12, 'GND', 'gnd'],
  ...Array.from({ length: 5 }, (_, k) => [13 + k, `${11 + k}${BAR}`, 'out', `y${11 + k}_n`]), [18, `G1${BAR}`, 'in', 'g1_n'], [19, `G2${BAR}`, 'in', 'g2_n'], [20, 'D', 'in', 'd'], [21, 'C', 'in', 'c'],
  [22, 'B', 'in', 'b'], [23, 'A', 'in', 'a'], [24, 'VCC', 'vcc']]), raw(Array.from({ length: 16 }, (_, k) => `y${k}_n <= ${NOT(and([NOT('g1_n'), NOT('g2_n'), minterm(ABCD, k)]))};`)));
// 74155 (74156: open collector): two 2-to-4 decoders on A and B; the first active while 1C is high and 1G̅ low, the
// second while 2C̅ and 2G̅ are low
const PINS_155 = (dir) => M16([[1, '1C', 'in', 'c1'], [2, `1G${BAR}`, 'in', 'g1_n'], [3, 'B', 'in', 'b'], [4, `1Y3${BAR}`, dir, 'y13_n'], [5, `1Y2${BAR}`, dir, 'y12_n'], [6, `1Y1${BAR}`, dir, 'y11_n'],
  [7, `1Y0${BAR}`, dir, 'y10_n'], [8, 'GND', 'gnd'], [9, `2Y0${BAR}`, dir, 'y20_n'], [10, `2Y1${BAR}`, dir, 'y21_n'], [11, `2Y2${BAR}`, dir, 'y22_n'], [12, `2Y3${BAR}`, dir, 'y23_n'], [13, 'A', 'in', 'a'],
  [14, `2G${BAR}`, 'in', 'g2_n'], [15, `2C${BAR}`, 'in', 'c2_n'], [16, 'VCC', 'vcc']]);
const DUAL24 = raw([0, 1, 2, 3].flatMap((k) => [`y1${k}_n <= ${NOT(and(['c1', NOT('g1_n'), minterm(['a', 'b'], k)]))};`, `y2${k}_n <= ${NOT(and([NOT('c2_n'), NOT('g2_n'), minterm(['a', 'b'], k)]))};`]));
const c74155 = ic('74155', 'Dual 2-to-4 line decoder/demultiplexer', 21, PINS_155('out'), DUAL24);
const c74156 = ic('74156', 'Dual 2-to-4 line decoder/demultiplexer, open collector', 25, PINS_155('oc'), DUAL24);

// ------------------------------------------------------------------ BCD to 7 segments: 7446, 7449, 74246, 74247, 74248, 4543
// (a segment's digits: those of 0–15 whose drawing lights it)
const SEGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const lit = (ins, k, table = SEGMENTS, upto = 16) => or(table.slice(0, upto).flatMap((w, n) => ((w >> k) & 1 ? [minterm(ins, n)] : [])));
// 7446 (the 7447's pinout and function, its outputs rated 30 V): BI̅ low blanks; else LT̅ low lights all; else RBI̅ low
// and 0 blanks; else the digit; open collector, active low
const c7446 = ic('7446', 'BCD to 7-segment decoder/driver, open collector, active low', 50, M16([[1, 'B', 'in', 'b'], [2, 'C', 'in', 'c'], [3, `LT${BAR}`, 'in', 'lt_n'],
  [4, `BI${BAR}/RBO${BAR}`, 'in', 'bi_n'], [5, `RBI${BAR}`, 'in', 'rbi_n'], [6, 'D', 'in', 'd'], [7, 'A', 'in', 'a'], [8, 'GND', 'gnd'], ...['e', 'd', 'c', 'b', 'a', 'g', 'f'].map((x, i) => [9 + i, x, 'oc', `seg_${x}`]),
  [16, 'VCC', 'vcc']]), raw(SEGS.map((x, k) => `seg_${x} <= ${NOT(and(['bi_n', or([NOT('lt_n'), and([NOT(and([NOT('rbi_n'), minterm(ABCD, 0)])), lit(ABCD, k)])])]))};`)));
// 7449: BI̅ low blanks, else the digit; open collector, active high (a lit segment released)
const c7449 = ic('7449', 'BCD to 7-segment decoder/driver, open collector, active high', 50, M14([[1, 'B', 'in', 'b'], [2, 'C', 'in', 'c'], [3, `BI${BAR}`, 'in', 'bi_n'], [4, 'D', 'in', 'd'],
  [5, 'A', 'in', 'a'], [6, 'e', 'oc', 'seg_e'], [7, 'GND', 'gnd'], [8, 'd', 'oc', 'seg_d'], [9, 'c', 'oc', 'seg_c'], [10, 'b', 'oc', 'seg_b'], [11, 'a', 'oc', 'seg_a'], [12, 'g', 'oc', 'seg_g'],
  [13, 'f', 'oc', 'seg_f'], [14, 'VCC', 'vcc']]), raw(SEGS.map((s, k) => `seg_${s} <= ${and(['bi_n', lit(ABCD, k)])};`)));

// 74246, 74247 (open collector, active low), 74248 (active high, pulled up inside): the 7446's function with tails; LT̅
// low lights all; else RBI̅ low and 0 blanks, and its RBO̅ goes low
const TAILS = SEGMENTS.map((w, n) => (n === 6 ? w | 1 : n === 9 ? w | 8 : w));
function tailed(type, title, low) {
  const zero = and(['lt_n', NOT('rbi_n'), minterm(ABCD, 0)]), seg = low ? 'oc' : 'out';
  return ic(type, title, 50, M16([[1, 'B', 'in', 'b'], [2, 'C', 'in', 'c'], [3, `LT${BAR}`, 'in', 'lt_n'], [4, `BI${BAR}/RBO${BAR}`, 'oc', 'rbo_n'], [5, `RBI${BAR}`, 'in', 'rbi_n'], [6, 'D', 'in', 'd'],
    [7, 'A', 'in', 'a'], [8, 'GND', 'gnd'], ...['e', 'd', 'c', 'b', 'a', 'g', 'f'].map((x, i) => [9 + i, x, seg, `seg_${x}`]), [16, 'VCC', 'vcc']])
    // (the 74248's segments pulled up inside the chip: KiCad's 74LS248 says they are open collectors)
    .map((p) => (!low && /^seg_/.test(p.port) ? { ...p, pullup: true } : p)),
  raw([...SEGS.map((x, k) => { const on = or([NOT('lt_n'), and([NOT(zero), lit(ABCD, k, TAILS)])]); return `seg_${x} <= ${low ? NOT(on) : on};`; }), `rbo_n <= ${NOT(zero)};`]));
}
const c74246 = tailed('74246', 'BCD to 7-segment decoder/driver, open collector (30 V), active low, tails', true);
const c74247 = tailed('74247', 'BCD to 7-segment decoder/driver, open collector (15 V), active low, tails', true);
const c74248 = tailed('74248', 'BCD to 7-segment decoder/driver, active high, tails', false);
// 4543: A–D latched while LD is low, followed while it is high; BI high blanks; 10–15 blank; PH high inverts the
// segments (a liquid crystal display's backplane)
const c4543 = ic('4543', 'BCD to 7-segment latch/decoder/driver, phase input', 200, M16([[1, 'LD', 'in', 'ld'], [2, 'C', 'in', 'c'], [3, 'B', 'in', 'b'], [4, 'D', 'in', 'd'], [5, 'A', 'in', 'a'],
  [6, 'PH', 'in', 'ph'], [7, 'BI', 'in', 'bi'], [8, 'VSS', 'gnd'], [9, 'a', 'out', 'seg_a'], [10, 'b', 'out', 'seg_b'], [11, 'c', 'out', 'seg_c'], [12, 'd', 'out', 'seg_d'], [13, 'e', 'out', 'seg_e'],
  [14, 'g', 'out', 'seg_g'], [15, 'f', 'out', 'seg_f'], [16, 'VDD', 'vcc']]), { decl: ["signal la, lb, lc, ld4 : std_logic := 'X';"], body: [
  ...latch('ld', '1', [['la', 'a'], ['lb', 'b'], ['lc', 'c'], ['ld4', 'd']]),
  ...SEGS.map((x, k) => `seg_${x} <= ${and([NOT('bi'), lit(['la', 'lb', 'lc', 'ld4'], k, SEGMENTS, 10)])} xor ph;`)] }, 'cmos');

// ------------------------------------------------------------------ priority encoders: 74147, 74148, 74348
// (the code of the highest input active (low): its bit b the OR of the inputs with that bit set, none above them active)
const top = (inputs, b) => or(inputs.flatMap((x, k) => ((k >> b) & 1 && x ? [and([NOT(x), ...inputs.slice(k + 1).filter(Boolean)])] : [])));
// 74147: 1̅–9̅ to D̅C̅B̅A̅, the highest active input's BCD inverted (none: 1111)
const IN147 = [null, ...Array.from({ length: 9 }, (_, k) => `i${k + 1}_n`)];
const c74147 = ic('74147', '10-line to 4-line priority encoder', 10, M16([[1, `4${BAR}`, 'in', 'i4_n'], [2, `5${BAR}`, 'in', 'i5_n'], [3, `6${BAR}`, 'in', 'i6_n'], [4, `7${BAR}`, 'in', 'i7_n'],
  [5, `8${BAR}`, 'in', 'i8_n'], [6, `C${BAR}`, 'out', 'c_n'], [7, `B${BAR}`, 'out', 'b_n'], [8, 'GND', 'gnd'], [9, `A${BAR}`, 'out', 'a_n'], [10, `9${BAR}`, 'in', 'i9_n'], [11, `1${BAR}`, 'in', 'i1_n'],
  [12, `2${BAR}`, 'in', 'i2_n'], [13, `3${BAR}`, 'in', 'i3_n'], [14, `D${BAR}`, 'out', 'd_n'], [15, 'NC', 'nc'], [16, 'VCC', 'vcc']]),
raw(['a', 'b', 'c', 'd'].map((x, b) => `${x}_n <= ${NOT(top(IN147, b))};`)));
// 74148: EI̅ high: all high; else the highest active input's code
// inverted on A̅, GS̅ low; none active: A̅ 111, GS̅ high, EO̅ low
const PINS_148 = M16([[1, `4${BAR}`, 'in', 'i4_n'], [2, `5${BAR}`, 'in', 'i5_n'], [3, `6${BAR}`, 'in', 'i6_n'], [4, `7${BAR}`, 'in', 'i7_n'], [5, `EI${BAR}`, 'in', 'ei_n'],
  [6, `A2${BAR}`, 'out', 'a2_n'], [7, `A1${BAR}`, 'out', 'a1_n'], [8, 'GND', 'gnd'], [9, `A0${BAR}`, 'out', 'a0_n'], [10, `0${BAR}`, 'in', 'i0_n'], [11, `1${BAR}`, 'in', 'i1_n'], [12, `2${BAR}`, 'in', 'i2_n'],
  [13, `3${BAR}`, 'in', 'i3_n'], [14, `GS${BAR}`, 'out', 'gs_n'], [15, `EO${BAR}`, 'out', 'eo_n'], [16, 'VCC', 'vcc']]);
const IN148 = Array.from({ length: 8 }, (_, k) => `i${k}_n`);
const any = or(IN148.map(NOT));
const ENC8 = raw([...[0, 1, 2].map((b) => `a${b}_n <= ${NOT(and([NOT('ei_n'), top(IN148, b)]))};`), `gs_n <= ${NOT(and([NOT('ei_n'), any]))};`, `eo_n <= ${NOT(and([NOT('ei_n'), NOT(any)]))};`]);
const c74148 = ic('74148', '8-line to 3-line priority encoder', 15, PINS_148, ENC8);
// 74348: the 74148's, its A0̅–A2̅ three-state: off while GS̅ is high (EI̅ high, or no input low)
const c74348 = ic('74348', '8-line to 3-line priority encoder, 3-state outputs', 15, PINS_148, ENC8, 'ttl', { enable: [['gs_n', '0']], outs: ['a0_n', 'a1_n', 'a2_n'] });

/** The decoders, display drivers and encoders written once in VHDL (#4397, group F), as the library lists them (the Parts panel's MSI ICs). */
export const DECODER_ICS = [c7442, c74145, c4028, c74137, c74237, c74238, c74154, c74155, c74156, c7446, c7449, c74246, c74247, c74248, c4543, c74147, c74148,
  c74348]
  .map((d) => ({ ...d, msi: true }));
