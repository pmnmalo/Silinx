// The ICs written once in VHDL (#4397, docs/CIRCUITS.md): KiCad's 74xx and 4xxx flip-flops, latches and registers. Each
// is its datasheet's pinout, its typical delay and its core, a VHDL entity whose ports are its pins' (but its supply's)
// that models the chip: Try it runs it live (core/circuit-sim.js, core/circuit-live-model.js), the circuit's HDL
// instantiates it in its simulation model and in its digital one (core/circuit-hdl-core.js), and its Verilog is Silinx's
// translation of it (core/translate.js), never written by hand. The cores are written by the few generators below, one
// per kind of storage (a J-K or D flip-flop, a D latch, an S̅-R̅ latch), each the clocked form synthesis reads: its
// asynchronous controls first, then its clock's edge. A register starts unknown (X), as the other ICs' do.
// Isomorphic module.
import { dip } from './circuit-ics.js';

const BAR = '̅';
const P = (at) => (n, name, dir, port) => ({ n, name, dir, ...at(n), port: port ?? name.replace(BAR, '_n').toLowerCase() });
const P14 = P(dip(14)), P16 = P(dip(16)), P20 = P(dip(20));
const ic = (type, title, tpd, pins, core, family = 'ttl') => ({ type, title, kind: 'ic', family, chip: family === 'ttl' ? `SN74LS${type.slice(2)}` : `CD${type}B`, tpd, dip: pins.length,
  pins, core: { entity: `ic${type}_core`, vhdl: coreVhdl(`ic${type}_core`, pins, core) } });

// ------------------------------------------------------------------ the cores' VHDL
// a storage element of a core:
//   { ff: { clk, edge: 'rising' | 'falling', jk: [j, k] | jkn: [j, k_n] | d, ce: [port, level]?, pre: [port, level]?,
//     clr: [port, level]? }, q, qn? }: a flip-flop, its preset and clear asynchronous (both active: Q and Q̅ high)
//   { latch: { en: [port, level], d }, q, qn? }: a D latch, transparent while en is at its level
//   { sr: { s: [ports] (active low, any one sets), r (active low) }, q }: an S̅-R̅ latch (both active: Q high)
const is = ([p, v]) => `${p} = '${v}'`;
function storeVhdl(e, k) {
  const r = `st${k}`;
  // (a latch on purpose: the chip's own, its lint's warning silenced)
  if (e.latch) return { body: [`process (${e.latch.en[0]}, ${e.latch.d})`, 'begin', '  -- silinx: ignore latch', `  if ${is(e.latch.en)} then`, `    ${r} <= ${e.latch.d};`, '  end if;', 'end process;'] };
  if (e.sr) return { body: [`process (${[...e.sr.s, e.sr.r].join(', ')})`, 'begin', '  -- silinx: ignore latch', `  if ${e.sr.s.map((s) => `${s} = '0'`).join(' or ')} then`, `    ${r} <= '1';`,
    '  -- silinx: ignore latch', `  elsif ${e.sr.r} = '0' then`, `    ${r} <= '0';`, '  end if;', 'end process;'] };
  const f = e.ff, ctl = [...(f.pre ? [[f.pre, "'1'"]] : []), ...(f.clr ? [[f.clr, "'0'"]] : [])];
  let next;
  if (f.d) next = [`${r} <= ${f.d};`];
  else {
    // (J-K: 11 toggles, 10 sets, 01 clears, 00 holds; a 74109's K̅ read inverted)
    const [j, k] = f.jk ?? f.jkn, kOn = f.jk ? "'1'" : "'0'", kOff = f.jk ? "'0'" : "'1'";
    next = [`if ${j} = '1' and ${k} = ${kOn} then`, `  ${r} <= not ${r};`, `elsif ${j} = '1' and ${k} = ${kOff} then`, `  ${r} <= '1';`, `elsif ${j} = '0' and ${k} = ${kOn} then`, `  ${r} <= '0';`, 'end if;'];
  }
  if (f.ce) next = [`if ${is(f.ce)} then`, ...next.map((l) => `  ${l}`), 'end if;'];
  // (its clock one of the IC's pins, read as the chip reads them in the circuit's HDL: logic before it, on purpose)
  return { body: ['-- silinx: ignore data-as-clock', `process (${[f.clk, ...ctl.map(([c]) => c[0])].join(', ')})`, 'begin',
    ...ctl.map(([c, v], i) => `  ${i ? 'elsif' : 'if'} ${is(c)} then ${r} <= ${v};`),
    `  ${ctl.length ? 'elsif' : 'if'} ${f.edge}_edge(${f.clk}) then`, ...next.map((l) => `    ${l}`), '  end if;', 'end process;'],
  both: f.pre && f.clr ? `${is(f.pre)} and ${is(f.clr)}` : null };
}
/** A core's VHDL: the entity `name`, its ports the pins' (but the supply's and NC), its storage elements `stores`. */
function coreVhdl(name, pins, stores) {
  const ins = pins.filter((p) => p.dir === 'in').map((p) => p.port), outs = pins.filter((p) => p.dir === 'out').map((p) => p.port);
  const L = ['library ieee;', 'use ieee.std_logic_1164.all;', '', `entity ${name} is`, '  port (', `    ${ins.join(', ')} : in std_logic;`, `    ${outs.join(', ')} : out std_logic`, '  );', `end entity ${name};`, '',
    `architecture rtl of ${name} is`, `  signal ${stores.map((_, k) => `st${k}`).join(', ')} : std_logic := 'X';`, 'begin'];
  stores.forEach((e, k) => {
    const { body, both } = storeVhdl(e, k);
    L.push(...body.map((l) => `  ${l}`), `  ${e.q} <= st${k};`);
    if (e.qn) L.push(both ? `  ${e.qn} <= '1' when ${both} else not st${k};` : `  ${e.qn} <= not st${k};`);
  });
  L.push('end architecture rtl;', '');
  return L.join('\n');
}

// ------------------------------------------------------------------ the dual J-K flip-flops: 7473, 7478, 74107, 74109, 74113, 74114
const jkPins = (spec) => spec.map(([n, name, dir, port]) => [n, name, dir, port]);
const JK = (k, { clk, pre, clr, edge = 'falling', kn = false }) => ({ ff: { clk, edge, ...(kn ? { jkn: [`j${k}`, `k${k}_n`] } : { jk: [`j${k}`, `k${k}`] }), ...(pre ? { pre: [pre, '0'] } : {}), ...(clr ? { clr: [clr, '0'] } : {}) }, q: `q${k}`, qn: `q${k}_n` });
const make = (at) => (rows) => rows.map(([n, name, dir, port]) => at(n, name, dir, port));
const M14 = make(P14), M16 = make(P16), M20 = make(P20);
const c7473 = ic('7473', 'Dual J-K flip-flop, clear (falling edge)', 15, M14(jkPins([[1, '1CLK', 'in', 'clk1'], [2, `1CLR${BAR}`, 'in', 'clr1_n'], [3, '1K', 'in', 'k1'], [4, 'VCC', 'vcc'],
  [5, '2CLK', 'in', 'clk2'], [6, `2CLR${BAR}`, 'in', 'clr2_n'], [7, '2J', 'in', 'j2'], [8, `2Q${BAR}`, 'out', 'q2_n'], [9, '2Q', 'out', 'q2'], [10, '2K', 'in', 'k2'], [11, 'GND', 'gnd'],
  [12, '1Q', 'out', 'q1'], [13, `1Q${BAR}`, 'out', 'q1_n'], [14, '1J', 'in', 'j1']])), [JK(1, { clk: 'clk1', clr: 'clr1_n' }), JK(2, { clk: 'clk2', clr: 'clr2_n' })]);
const c7478 = ic('7478', 'Dual J-K flip-flop, preset, common clock and clear (falling edge)', 15, M14([[1, 'CLK', 'in', 'clk'], [2, `1PRE${BAR}`, 'in', 'pre1_n'], [3, '1J', 'in', 'j1'], [4, 'VCC', 'vcc'],
  [5, `CLR${BAR}`, 'in', 'clr_n'], [6, `2PRE${BAR}`, 'in', 'pre2_n'], [7, '2K', 'in', 'k2'], [8, '2Q', 'out', 'q2'], [9, `2Q${BAR}`, 'out', 'q2_n'], [10, '2J', 'in', 'j2'], [11, 'GND', 'gnd'],
  [12, `1Q${BAR}`, 'out', 'q1_n'], [13, '1Q', 'out', 'q1'], [14, '1K', 'in', 'k1']]), [JK(1, { clk: 'clk', pre: 'pre1_n', clr: 'clr_n' }), JK(2, { clk: 'clk', pre: 'pre2_n', clr: 'clr_n' })]);
const c74107 = ic('74107', 'Dual J-K flip-flop, clear (falling edge)', 15, M14([[1, '1J', 'in', 'j1'], [2, `1Q${BAR}`, 'out', 'q1_n'], [3, '1Q', 'out', 'q1'], [4, '1K', 'in', 'k1'],
  [5, '2Q', 'out', 'q2'], [6, `2Q${BAR}`, 'out', 'q2_n'], [7, 'GND', 'gnd'], [8, '2J', 'in', 'j2'], [9, '2CLK', 'in', 'clk2'], [10, `2CLR${BAR}`, 'in', 'clr2_n'], [11, '2K', 'in', 'k2'],
  [12, '1CLK', 'in', 'clk1'], [13, `1CLR${BAR}`, 'in', 'clr1_n'], [14, 'VCC', 'vcc']]), [JK(1, { clk: 'clk1', clr: 'clr1_n' }), JK(2, { clk: 'clk2', clr: 'clr2_n' })]);
const c74109 = ic('74109', `Dual J-K${BAR} flip-flop, preset and clear (rising edge)`, 18, M16([[1, `1CLR${BAR}`, 'in', 'clr1_n'], [2, '1J', 'in', 'j1'], [3, `1K${BAR}`, 'in', 'k1_n'],
  [4, '1CLK', 'in', 'clk1'], [5, `1PRE${BAR}`, 'in', 'pre1_n'], [6, '1Q', 'out', 'q1'], [7, `1Q${BAR}`, 'out', 'q1_n'], [8, 'GND', 'gnd'], [9, `2Q${BAR}`, 'out', 'q2_n'], [10, '2Q', 'out', 'q2'],
  [11, `2PRE${BAR}`, 'in', 'pre2_n'], [12, '2CLK', 'in', 'clk2'], [13, `2K${BAR}`, 'in', 'k2_n'], [14, '2J', 'in', 'j2'], [15, `2CLR${BAR}`, 'in', 'clr2_n'], [16, 'VCC', 'vcc']]),
[JK(1, { clk: 'clk1', pre: 'pre1_n', clr: 'clr1_n', edge: 'rising', kn: true }), JK(2, { clk: 'clk2', pre: 'pre2_n', clr: 'clr2_n', edge: 'rising', kn: true })]);
const c74113 = ic('74113', 'Dual J-K flip-flop, preset (falling edge)', 15, M14([[1, '1CLK', 'in', 'clk1'], [2, '1K', 'in', 'k1'], [3, '1J', 'in', 'j1'], [4, `1PRE${BAR}`, 'in', 'pre1_n'],
  [5, '1Q', 'out', 'q1'], [6, `1Q${BAR}`, 'out', 'q1_n'], [7, 'GND', 'gnd'], [8, `2Q${BAR}`, 'out', 'q2_n'], [9, '2Q', 'out', 'q2'], [10, `2PRE${BAR}`, 'in', 'pre2_n'], [11, '2J', 'in', 'j2'],
  [12, '2K', 'in', 'k2'], [13, '2CLK', 'in', 'clk2'], [14, 'VCC', 'vcc']]), [JK(1, { clk: 'clk1', pre: 'pre1_n' }), JK(2, { clk: 'clk2', pre: 'pre2_n' })]);
const c74114 = ic('74114', 'Dual J-K flip-flop, preset, common clock and clear (falling edge)', 15, M14([[1, `CLR${BAR}`, 'in', 'clr_n'], [2, '1K', 'in', 'k1'], [3, '1J', 'in', 'j1'],
  [4, `1PRE${BAR}`, 'in', 'pre1_n'], [5, '1Q', 'out', 'q1'], [6, `1Q${BAR}`, 'out', 'q1_n'], [7, 'GND', 'gnd'], [8, `2Q${BAR}`, 'out', 'q2_n'], [9, '2Q', 'out', 'q2'], [10, `2PRE${BAR}`, 'in', 'pre2_n'],
  [11, '2J', 'in', 'j2'], [12, '2K', 'in', 'k2'], [13, 'CLK', 'in', 'clk'], [14, 'VCC', 'vcc']]), [JK(1, { clk: 'clk', pre: 'pre1_n', clr: 'clr_n' }), JK(2, { clk: 'clk', pre: 'pre2_n', clr: 'clr_n' })]);

// ------------------------------------------------------------------ the 4000's: 4013 (dual D), 4027 (dual J-K); rising edge, set and reset active high
const SR_HIGH = (k, more) => ({ ff: { clk: `clk${k}`, edge: 'rising', pre: [`s${k}`, '1'], clr: [`r${k}`, '1'], ...more }, q: `q${k}`, qn: `q${k}_n` });
const c4013 = ic('4013', 'Dual D flip-flop, set and reset (rising edge)', 140, M14([[1, '1Q', 'out', 'q1'], [2, `1Q${BAR}`, 'out', 'q1_n'], [3, '1CLK', 'in', 'clk1'], [4, '1R', 'in', 'r1'],
  [5, '1D', 'in', 'd1'], [6, '1S', 'in', 's1'], [7, 'VSS', 'gnd'], [8, '2S', 'in', 's2'], [9, '2D', 'in', 'd2'], [10, '2R', 'in', 'r2'], [11, '2CLK', 'in', 'clk2'], [12, `2Q${BAR}`, 'out', 'q2_n'],
  [13, '2Q', 'out', 'q2'], [14, 'VDD', 'vcc']]), [SR_HIGH(1, { d: 'd1' }), SR_HIGH(2, { d: 'd2' })], 'cmos');
const c4027 = ic('4027', 'Dual J-K flip-flop, set and reset (rising edge)', 130, M16([[1, '1Q', 'out', 'q1'], [2, `1Q${BAR}`, 'out', 'q1_n'], [3, '1CLK', 'in', 'clk1'], [4, '1R', 'in', 'r1'],
  [5, '1K', 'in', 'k1'], [6, '1J', 'in', 'j1'], [7, '1S', 'in', 's1'], [8, 'VSS', 'gnd'], [9, '2S', 'in', 's2'], [10, '2J', 'in', 'j2'], [11, '2K', 'in', 'k2'], [12, '2R', 'in', 'r2'],
  [13, '2CLK', 'in', 'clk2'], [14, `2Q${BAR}`, 'out', 'q2_n'], [15, '2Q', 'out', 'q2'], [16, 'VDD', 'vcc']]), [SR_HIGH(1, { jk: ['j1', 'k1'] }), SR_HIGH(2, { jk: ['j2', 'k2'] })], 'cmos');

// ------------------------------------------------------------------ the D latches: 7475, 7477 (enables high), 74375; the S̅-R̅ latches: 74279
const LATCH = (k, en, qn = true) => ({ latch: { en: [en, '1'], d: `d${k}` }, q: `q${k}`, ...(qn ? { qn: `q${k}_n` } : {}) });
const c7475 = ic('7475', '4-bit bistable latch, Q and Q̅', 15, M16([[1, `1Q${BAR}`, 'out', 'q1_n'], [2, '1D', 'in', 'd1'], [3, '2D', 'in', 'd2'], [4, '3C,4C', 'in', 'c34'], [5, 'VCC', 'vcc'],
  [6, '3D', 'in', 'd3'], [7, '4D', 'in', 'd4'], [8, `4Q${BAR}`, 'out', 'q4_n'], [9, '4Q', 'out', 'q4'], [10, '3Q', 'out', 'q3'], [11, `3Q${BAR}`, 'out', 'q3_n'], [12, 'GND', 'gnd'],
  [13, '1C,2C', 'in', 'c12'], [14, `2Q${BAR}`, 'out', 'q2_n'], [15, '2Q', 'out', 'q2'], [16, '1Q', 'out', 'q1']]), [LATCH(1, 'c12'), LATCH(2, 'c12'), LATCH(3, 'c34'), LATCH(4, 'c34')]);
const c7477 = ic('7477', '4-bit bistable latch', 15, M14([[1, '1D', 'in', 'd1'], [2, '2D', 'in', 'd2'], [3, '3C,4C', 'in', 'c34'], [4, 'VCC', 'vcc'], [5, '3D', 'in', 'd3'], [6, '4D', 'in', 'd4'],
  [7, 'NC', 'nc'], [8, '4Q', 'out', 'q4'], [9, '3Q', 'out', 'q3'], [10, 'NC', 'nc'], [11, 'GND', 'gnd'], [12, '1C,2C', 'in', 'c12'], [13, '2Q', 'out', 'q2'], [14, '1Q', 'out', 'q1']]),
[LATCH(1, 'c12', false), LATCH(2, 'c12', false), LATCH(3, 'c34', false), LATCH(4, 'c34', false)]);
const c74375 = ic('74375', '4-bit bistable latch, Q and Q̅', 15, M16([[1, '1D', 'in', 'd1'], [2, `1Q${BAR}`, 'out', 'q1_n'], [3, '1Q', 'out', 'q1'], [4, '1C,2C', 'in', 'c12'], [5, '2Q', 'out', 'q2'],
  [6, `2Q${BAR}`, 'out', 'q2_n'], [7, '2D', 'in', 'd2'], [8, 'GND', 'gnd'], [9, '3D', 'in', 'd3'], [10, `3Q${BAR}`, 'out', 'q3_n'], [11, '3Q', 'out', 'q3'], [12, '3C,4C', 'in', 'c34'],
  [13, '4Q', 'out', 'q4'], [14, `4Q${BAR}`, 'out', 'q4_n'], [15, '4D', 'in', 'd4'], [16, 'VCC', 'vcc']]), [LATCH(1, 'c12'), LATCH(2, 'c12'), LATCH(3, 'c34'), LATCH(4, 'c34')]);
const c74279 = ic('74279', `Quad S${BAR}-R${BAR} latch`, 15, M16([[1, `1R${BAR}`, 'in', 'r1_n'], [2, `1S1${BAR}`, 'in', 's1a_n'], [3, `1S2${BAR}`, 'in', 's1b_n'], [4, '1Q', 'out', 'q1'],
  [5, `2R${BAR}`, 'in', 'r2_n'], [6, `2S${BAR}`, 'in', 's2_n'], [7, '2Q', 'out', 'q2'], [8, 'GND', 'gnd'], [9, '3Q', 'out', 'q3'], [10, `3R${BAR}`, 'in', 'r3_n'], [11, `3S1${BAR}`, 'in', 's3a_n'],
  [12, `3S2${BAR}`, 'in', 's3b_n'], [13, '4Q', 'out', 'q4'], [14, `4R${BAR}`, 'in', 'r4_n'], [15, `4S${BAR}`, 'in', 's4_n'], [16, 'VCC', 'vcc']]),
[{ sr: { s: ['s1a_n', 's1b_n'], r: 'r1_n' }, q: 'q1' }, { sr: { s: ['s2_n'], r: 'r2_n' }, q: 'q2' }, { sr: { s: ['s3a_n', 's3b_n'], r: 'r3_n' }, q: 'q3' }, { sr: { s: ['s4_n'], r: 'r4_n' }, q: 'q4' }]);

// ------------------------------------------------------------------ the D registers (rising edge): 74174, 74175, 74273 (clear); 74377, 74378, 74379 (enable)
const REG = (k, { clr, ce, qn }) => ({ ff: { clk: 'clk', edge: 'rising', d: `d${k}`, ...(clr ? { clr: ['clr_n', '0'] } : {}), ...(ce ? { ce: ['e_n', '0'] } : {}) }, q: `q${k}`, ...(qn ? { qn: `q${k}_n` } : {}) });
// (the 74174's and 74378's six D and Q, the 74273's and 74377's eight, the 74175's and 74379's four with Q̅)
const HEX_REG = (first, clkPin) => [[1, first[0], 'in', first[1]], [2, '1Q', 'out', 'q1'], [3, '1D', 'in', 'd1'], [4, '2D', 'in', 'd2'], [5, '2Q', 'out', 'q2'], [6, '3D', 'in', 'd3'], [7, '3Q', 'out', 'q3'],
  [8, 'GND', 'gnd'], [clkPin, 'CLK', 'in', 'clk'], [10, '4Q', 'out', 'q4'], [11, '4D', 'in', 'd4'], [12, '5Q', 'out', 'q5'], [13, '5D', 'in', 'd5'], [14, '6D', 'in', 'd6'], [15, '6Q', 'out', 'q6'], [16, 'VCC', 'vcc']];
const OCT_REG = (first) => [[1, first[0], 'in', first[1]], [2, '1Q', 'out', 'q1'], [3, '1D', 'in', 'd1'], [4, '2D', 'in', 'd2'], [5, '2Q', 'out', 'q2'], [6, '3Q', 'out', 'q3'], [7, '3D', 'in', 'd3'],
  [8, '4D', 'in', 'd4'], [9, '4Q', 'out', 'q4'], [10, 'GND', 'gnd'], [11, 'CLK', 'in', 'clk'], [12, '5Q', 'out', 'q5'], [13, '5D', 'in', 'd5'], [14, '6D', 'in', 'd6'], [15, '6Q', 'out', 'q6'],
  [16, '7Q', 'out', 'q7'], [17, '7D', 'in', 'd7'], [18, '8D', 'in', 'd8'], [19, '8Q', 'out', 'q8'], [20, 'VCC', 'vcc']];
const QUAD_REG = (first) => [[1, first[0], 'in', first[1]], [2, '1Q', 'out', 'q1'], [3, `1Q${BAR}`, 'out', 'q1_n'], [4, '1D', 'in', 'd1'], [5, '2D', 'in', 'd2'], [6, `2Q${BAR}`, 'out', 'q2_n'],
  [7, '2Q', 'out', 'q2'], [8, 'GND', 'gnd'], [9, 'CLK', 'in', 'clk'], [10, '3Q', 'out', 'q3'], [11, `3Q${BAR}`, 'out', 'q3_n'], [12, '3D', 'in', 'd3'], [13, '4D', 'in', 'd4'], [14, `4Q${BAR}`, 'out', 'q4_n'],
  [15, '4Q', 'out', 'q4'], [16, 'VCC', 'vcc']];
const regs = (n, o) => Array.from({ length: n }, (_, k) => REG(k + 1, o));
const CLR = [`CLR${BAR}`, 'clr_n'], EN = [`E${BAR}`, 'e_n'];
const c74174 = ic('74174', 'Hex D flip-flop, clear (rising edge)', 20, M16(HEX_REG(CLR, 9)), regs(6, { clr: true }));
const c74175 = ic('74175', 'Quad D flip-flop, clear, Q and Q̅ (rising edge)', 20, M16(QUAD_REG(CLR)), regs(4, { clr: true, qn: true }));
const c74273 = ic('74273', 'Octal D flip-flop, clear (rising edge)', 18, M20(OCT_REG(CLR)), regs(8, { clr: true }));
const c74377 = ic('74377', 'Octal D flip-flop, enable (rising edge)', 18, M20(OCT_REG(EN)), regs(8, { ce: true }));
const c74378 = ic('74378', 'Hex D flip-flop, enable (rising edge)', 18, M16(HEX_REG(EN, 9)), regs(6, { ce: true }));
const c74379 = ic('74379', 'Quad D flip-flop, enable, Q and Q̅ (rising edge)', 18, M16(QUAD_REG(EN)), regs(4, { ce: true, qn: true }));

/** The ICs written once in VHDL (#4397), as the library lists them. */
export const MODEL_ICS = [c7473, c7478, c74107, c74109, c74113, c74114, c4013, c4027, c7475, c7477, c74375, c74279, c74174, c74175, c74273, c74377, c74378, c74379];
