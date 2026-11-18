// The memories and storage ICs written once in VHDL (#4397, group F; docs/CIRCUITS.md): KiCad's 74xx register files,
// addressable latches, a three-state shift register and an 8-bit up/down counter, as the decoders of
// core/circuit-model-decoders.js are: each its datasheet's pinout, its typical delay and its core, a VHDL architecture
// written here, run live by Try it, instantiated by the circuit's HDL, translated to Verilog by Silinx. A register file's
// words are latches, written while its write enable is low, starting unknown (X), as its addressable latches' bits do.
// Isomorphic module.
import { ic, BAR } from './circuit-model-ics.js';
import { dip } from './circuit-ics.js';

// ------------------------------------------------------------------ the pins and the VHDL's pieces
const pinsOf = (n) => (rows) => rows.map(([k, name, dir, port]) => ({ n: k, name, dir, ...dip(n, n >= 24 ? 6 : 3)(k), port: port ?? name.toLowerCase() })).sort((a, b) => a.n - b.n);
const M16 = pinsOf(16);
const NOT = (e) => `(not ${e})`;
const and = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join(' and ')})`);
const or = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join(' or ')})`);
const minterm = (ins, k) => and(ins.map((x, b) => ((k >> b) & 1 ? x : NOT(x))));
const mux = (sel, data) => or(data.map((d, k) => and([minterm(sel, k), d])));
const LATCH = '  -- silinx: ignore latch';
const CLOCKED = '-- silinx: ignore data-as-clock';
const vec = (name, n) => `signal ${name} : std_logic_vector(${n - 1} downto 0) := (others => 'X');`;

// ------------------------------------------------------------------ 4 × 4 register files: 74670 (three-state), 74170 (open collector)
// GW̅ low: the word WB WA follows D1–D4 (a latch); GR̅ low: the word RB RA on Q1–Q4, else the 74670's outputs off, the
// 74170's released
const PINS_670 = (dir) => M16([[1, 'D2', 'in', 'd2'], [2, 'D3', 'in', 'd3'], [3, 'D4', 'in', 'd4'], [4, 'RB', 'in', 'rb'], [5, 'RA', 'in', 'ra'], [6, 'Q4', dir, 'q4'], [7, 'Q3', dir, 'q3'],
  [8, 'GND', 'gnd'], [9, 'Q2', dir, 'q2'], [10, 'Q1', dir, 'q1'], [11, `GR${BAR}`, 'in', 'gr_n'], [12, `GW${BAR}`, 'in', 'gw_n'], [13, 'WB', 'in', 'wb'], [14, 'WA', 'in', 'wa'], [15, 'D1', 'in', 'd1'],
  [16, 'VCC', 'vcc']]);
const registerFile = (oc) => ({ decl: [0, 1, 2, 3].map((w) => vec(`w${w}`, 4)), body: [
  ...[0, 1, 2, 3].flatMap((w) => [`process (gw_n, wa, wb, d1, d2, d3, d4)`, 'begin', LATCH, `  if ${and(["gw_n = '0'", `wb = '${w >> 1}'`, `wa = '${w & 1}'`])} then`, `    w${w} <= d4 & d3 & d2 & d1;`,
    '  end if;', 'end process;']),
  ...[1, 2, 3, 4].map((k) => { const q = mux(['ra', 'rb'], [0, 1, 2, 3].map((w) => `w${w}(${k - 1})`)); return `q${k} <= ${oc ? or([q, 'gr_n']) : q};`; })] });
const c74670 = ic('74670', '4 × 4 register file, 3-state outputs', 30, PINS_670('out'), registerFile(false), 'ttl', [['gr_n', '0']]);
const c74170 = ic('74170', '4 × 4 register file, open-collector outputs', 30, PINS_670('oc'), registerFile(true));

// ------------------------------------------------------------------ addressable latches: 74259 (8-bit), 74256 (dual 4-bit)
// G̅ low: the addressed bit follows D (its others kept; with CLR̅ low, cleared: a demultiplexer); G̅ high and CLR̅ low:
// all cleared; both high: all kept
const addressed = (bits, sel, d, q) => Array.from({ length: bits }, (_, k) => { const at = minterm(sel, k); return [`process (g_n, clr_n, ${sel.join(', ')}, ${d})`, 'begin', LATCH,
  `  if ${and([NOT('g_n'), at])} = '1' then ${q(k)} <= ${d};`, LATCH, `  elsif clr_n = '0' then ${q(k)} <= '0';`, '  end if;', 'end process;']; }).flat();
const c74259 = ic('74259', '8-bit addressable latch', 22, M16([[1, 'S0', 'in', 's0'], [2, 'S1', 'in', 's1'], [3, 'S2', 'in', 's2'], ...[0, 1, 2, 3].map((k) => [4 + k, `Q${k}`, 'out', `q${k}`]),
  [8, 'GND', 'gnd'], ...[4, 5, 6, 7].map((k) => [5 + k, `Q${k}`, 'out', `q${k}`]), [13, 'D', 'in', 'd'], [14, `G${BAR}`, 'in', 'g_n'], [15, `CLR${BAR}`, 'in', 'clr_n'], [16, 'VCC', 'vcc']]),
{ decl: [vec('r', 8)], body: [...addressed(8, ['s0', 's1', 's2'], 'd', (k) => `r(${k})`), ...Array.from({ length: 8 }, (_, k) => `q${k} <= r(${k});`)] });
const c74256 = ic('74256', 'Dual 4-bit addressable latch', 22, M16([[1, 'A', 'in', 'a'], [2, 'B', 'in', 'b'], [3, '1D', 'in', 'd1'], ...[0, 1, 2, 3].map((k) => [4 + k, `1Q${k}`, 'out', `q1${k}`]),
  [8, 'GND', 'gnd'], ...[0, 1, 2, 3].map((k) => [9 + k, `2Q${k}`, 'out', `q2${k}`]), [13, '2D', 'in', 'd2'], [14, `G${BAR}`, 'in', 'g_n'], [15, `CLR${BAR}`, 'in', 'clr_n'], [16, 'VCC', 'vcc']]),
{ decl: [vec('r1', 4), vec('r2', 4)], body: [1, 2].flatMap((u) => [...addressed(4, ['a', 'b'], `d${u}`, (k) => `r${u}(${k})`), ...[0, 1, 2, 3].map((k) => `q${u}${k} <= r${u}(${k});`)]) });

// ------------------------------------------------------------------ 74395: 4-bit shift register, 3-state outputs (falling edge)
// CLR̅ low: 0; on CLK's falling edge LD/SH̅ high loads A–D, low shifts SER into QA; OC̅ high turns QA–QD off, not QD'
const c74395 = ic('74395', '4-bit cascadable shift register, 3-state outputs (falling edge)', 20, M16([[1, `CLR${BAR}`, 'in', 'clr_n'], [2, 'SER', 'in', 'ser'], [3, 'A', 'in', 'a'], [4, 'B', 'in', 'b'],
  [5, 'C', 'in', 'c'], [6, 'D', 'in', 'd'], [7, `LD/SH${BAR}`, 'in', 'ld'], [8, 'GND', 'gnd'], [9, `OC${BAR}`, 'in', 'oc_n'], [10, 'CLK', 'in', 'clk'], [11, "QD'", 'out', 'qd2'], [12, 'QD', 'out', 'qd'],
  [13, 'QC', 'out', 'qc'], [14, 'QB', 'out', 'qb'], [15, 'QA', 'out', 'qa'], [16, 'VCC', 'vcc']]), { decl: [vec('r', 4)], body: [CLOCKED, 'process (clk, clr_n)', 'begin',
  "  if clr_n = '0' then r <= \"0000\";", '  elsif falling_edge(clk) then', "    if ld = '1' then r <= d & c & b & a;", "    elsif ld = '0' then r <= r(2 downto 0) & ser;",
  "    else r <= (others => 'X');", '    end if;', '  end if;', 'end process;', ...['qa', 'qb', 'qc', 'qd'].map((p, b) => `${p} <= r(${b});`), 'qd2 <= r(3);'] },
'ttl', { enable: [['oc_n', '0']], outs: ['qa', 'qb', 'qc', 'qd'] });

/** The memories and storage ICs written once in VHDL (#4397, group F), as the library lists them. */
export const MEMORY_ICS = [c74670, c74170, c74259, c74256, c74395];
