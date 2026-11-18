// The shift registers written once in VHDL (#4397, group E; docs/CIRCUITS.md): KiCad's 74xx and 4xxx shift registers,
// as the flip-flops of core/circuit-model-ics.js are: each its datasheet's pinout, its typical delay and its core, a VHDL
// architecture written here (its register a std_logic_vector, bit 0 its first stage), run live by Try it, instantiated
// by the circuit's HDL, translated to Verilog by Silinx. A register starts unknown (X), until a clear or a load. A clock
// the chip gates (the 7495's two clocks by its mode, the 74166's by its clock inhibit) is gated as the chip's logic
// does. An asynchronous load (the 4021's) takes its inputs when it starts, as the 74191's (core/circuit-seq.js). The
// 74596's outputs are open collectors: low for a 0, released for a 1 and while OE̅ is high.
// Isomorphic module.
import { ic, BAR, M14, M16 } from './circuit-model-ics.js';

// ------------------------------------------------------------------ the VHDL's pieces
const R = (n, name = 'r') => `signal ${name} : std_logic_vector(${n - 1} downto 0) := (others => 'X');`;
const outs = (v, ports) => ports.map((p, b) => `${p} <= ${v}(${b});`);
// (a shift into bit 0, its first stage; a load, its data's bits listed from the first stage)
const shift = (v, n, sin) => `${v} <= ${v}(${n - 2} downto 0) & ${sin};`;
const load = (v, data) => `${v} <= ${[...data].reverse().join(' & ')};`;
// (a clocked process's clock one of the IC's pins, read as the chip reads them in the circuit's HDL: logic before it)
const CLOCKED = '-- silinx: ignore data-as-clock';
const ASYNC_LOAD = "-- silinx: ignore sensitivity (an asynchronous load takes the inputs when it starts, as a flip-flop's in synthesis)";
// a clocked process: its clock, its edge, its asynchronous clear [condition, value] (or none), its statements on the edge
const clocked = (clk, edge, clr, next) => [CLOCKED, `process (${[clk, ...(clr ? [clr[0].split(' ')[0]] : [])].join(', ')})`, 'begin',
  ...(clr ? [`  if ${clr[0]} then ${clr[1]}`] : []), `  ${clr ? 'elsif' : 'if'} ${edge}_edge(${clk}) then`, ...next.map((l) => `    ${l}`), '  end if;', 'end process;'];
const ABCD = ['a', 'b', 'c', 'd'], A_H = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], QA_QD = ['qa', 'qb', 'qc', 'qd'], QA_QH = ['qa', 'qb', 'qc', 'qd', 'qe', 'qf', 'qg', 'qh'];

// ------------------------------------------------------------------ 7491: 8-bit serial in, serial out
// on CLK's rising edge A and B ANDed into the first stage; QH and QH̅ the last
const c7491 = ic('7491', '8-bit serial in, serial out shift register', 25, M14([[1, 'NC', 'nc'], [2, 'NC', 'nc'], [3, 'NC', 'nc'], [4, 'NC', 'nc'], [5, 'VCC', 'vcc'], [6, 'NC', 'nc'],
  [7, 'NC', 'nc'], [8, 'NC', 'nc'], [9, 'CLK', 'in', 'clk'], [10, 'GND', 'gnd'], [11, 'B', 'in', 'b'], [12, 'A', 'in', 'a'], [13, 'QH', 'out', 'qh'], [14, `QH${BAR}`, 'out', 'qh_n']]),
{ decl: [R(8)], body: [...clocked('clk', 'rising', null, [shift('r', 8, '(a and b)')]), 'qh <= r(7);', 'qh_n <= not r(7);'] });

// ------------------------------------------------------------------ 7495: 4-bit shift right, parallel load
// MODE low: on CLK1's falling edge SER into QA, QA into QB…; MODE high: on CLK2's falling edge DCBA loaded (a shift left
// when each Q is wired to the input before it); the chip's clock the two gated by MODE
const GATED = "-- silinx: ignore clock-as-data (its clock gated by its inputs: the chip's)";
const c7495 = ic('7495', '4-bit shift register, parallel load (falling edges)', 18, M14([[1, 'SER', 'in', 'ser'], [2, 'A', 'in', 'a'], [3, 'B', 'in', 'b'], [4, 'C', 'in', 'c'], [5, 'D', 'in', 'd'],
  [6, 'MODE', 'in', 'mode'], [7, 'GND', 'gnd'], [8, 'CLK2', 'in', 'clk2'], [9, 'CLK1', 'in', 'clk1'], [10, 'QD', 'out', 'qd'], [11, 'QC', 'out', 'qc'], [12, 'QB', 'out', 'qb'], [13, 'QA', 'out', 'qa'],
  [14, 'VCC', 'vcc']]), { decl: [R(4), "signal ck : std_logic := 'X';"], body: [GATED, 'ck <= (clk1 and not mode) or (clk2 and mode);',
  ...clocked('ck', 'falling', null, ["if mode = '1' then", `  ${load('r', ABCD)}`, "elsif mode = '0' then", `  ${shift('r', 4, 'ser')}`, 'else', "  r <= (others => 'X');", 'end if;']),
  ...outs('r', QA_QD)] });

// ------------------------------------------------------------------ 74166: 8-bit parallel in, serial out
// CLR̅ low: 0; on the rising edge of CLK or CLK INH (either high inhibits the other) SH/LD̅ low loads A–H, high shifts SER in
const c74166 = ic('74166', '8-bit parallel in, serial out shift register, clear', 20, M16([[1, 'SER', 'in', 'ser'], [2, 'A', 'in', 'a'], [3, 'B', 'in', 'b'], [4, 'C', 'in', 'c'], [5, 'D', 'in', 'd'],
  [6, 'CLK INH', 'in', 'clk_inh'], [7, 'CLK', 'in', 'clk'], [8, 'GND', 'gnd'], [9, `CLR${BAR}`, 'in', 'clr_n'], [10, 'E', 'in', 'e'], [11, 'F', 'in', 'f'], [12, 'G', 'in', 'g'], [13, 'QH', 'out', 'qh'],
  [14, 'H', 'in', 'h'], [15, `SH/LD${BAR}`, 'in', 'shld_n'], [16, 'VCC', 'vcc']]), { decl: [R(8), "signal ck : std_logic := 'X';"], body: [GATED, 'ck <= clk or clk_inh;',
  ...clocked('ck', 'rising', ["clr_n = '0'", "r <= (others => '0');"], ["if shld_n = '0' then", `  ${load('r', A_H)}`, 'else', `  ${shift('r', 8, 'ser')}`, 'end if;']), 'qh <= r(7);'] });

// ------------------------------------------------------------------ 74195: 4-bit parallel access, J-K̅ serial input
// CLR̅ low: 0; on CLK's rising edge SH/LD̅ low loads DCBA, high shifts: QA by J and K̅ (00: 0, 11: 1, 01: kept, 10: toggled)
const c74195 = ic('74195', '4-bit parallel-access shift register, J-K̅ serial input', 14, M16([[1, `CLR${BAR}`, 'in', 'clr_n'], [2, 'J', 'in', 'j'], [3, `K${BAR}`, 'in', 'k_n'], [4, 'A', 'in', 'a'],
  [5, 'B', 'in', 'b'], [6, 'C', 'in', 'c'], [7, 'D', 'in', 'd'], [8, 'GND', 'gnd'], [9, `SH/LD${BAR}`, 'in', 'shld_n'], [10, 'CLK', 'in', 'clk'], [11, `QD${BAR}`, 'out', 'qd_n'], [12, 'QD', 'out', 'qd'],
  [13, 'QC', 'out', 'qc'], [14, 'QB', 'out', 'qb'], [15, 'QA', 'out', 'qa'], [16, 'VCC', 'vcc']]), { decl: [R(4)], body: [
  ...clocked('clk', 'rising', ["clr_n = '0'", 'r <= "0000";'], ["if shld_n = '0' then", `  ${load('r', ABCD)}`, 'else', `  ${shift('r', 4, '((j and not r(0)) or (k_n and r(0)))')}`, 'end if;']),
  ...outs('r', QA_QD), 'qd_n <= not r(3);'] });

// ------------------------------------------------------------------ 74295: 4-bit shift right, parallel load, 3-state outputs
// on CLK's falling edge LD/SH̅ high loads DCBA, low shifts SER in; OC high puts the register on QA–QD, low turns them off
const c74295 = ic('74295', '4-bit shift register, parallel load, 3-state outputs (falling edge)', 20, M14([[1, 'SER', 'in', 'ser'], [2, 'A', 'in', 'a'], [3, 'B', 'in', 'b'], [4, 'C', 'in', 'c'],
  [5, 'D', 'in', 'd'], [6, `LD/SH${BAR}`, 'in', 'ld'], [7, 'GND', 'gnd'], [8, 'OC', 'in', 'oe'], [9, 'CLK', 'in', 'clk'], [10, 'QD', 'out', 'qd'], [11, 'QC', 'out', 'qc'], [12, 'QB', 'out', 'qb'],
  [13, 'QA', 'out', 'qa'], [14, 'VCC', 'vcc']]), { decl: [R(4)], body: [
  ...clocked('clk', 'falling', null, ["if ld = '1' then", `  ${load('r', ABCD)}`, "elsif ld = '0' then", `  ${shift('r', 4, 'ser')}`, 'else', "  r <= (others => 'X');", 'end if;']),
  ...outs('r', QA_QD)] }, 'ttl', [['oe', '1']]);

// ------------------------------------------------------------------ 74594, 74596: 8-bit shift registers and their output registers
// SRCLR̅ low clears the shift register; on SRCLK's rising edge SER into its first stage; on RCLK's rising edge the output
// register takes it (one clock behind when the two clocks are joined); QH' its last stage
// 74594: RCLR̅ low clears the output register, QA–QH its bits; 74596 (the 74595's, open collectors): QA–QH its bits
// while OE̅ is low, released (high) while it is high
const SR_PINS = (oe) => [[1, 'QB', oe ? 'oc' : 'out', 'qb'], [2, 'QC', oe ? 'oc' : 'out', 'qc'], [3, 'QD', oe ? 'oc' : 'out', 'qd'], [4, 'QE', oe ? 'oc' : 'out', 'qe'], [5, 'QF', oe ? 'oc' : 'out', 'qf'],
  [6, 'QG', oe ? 'oc' : 'out', 'qg'], [7, 'QH', oe ? 'oc' : 'out', 'qh'], [8, 'GND', 'gnd'], [9, "QH'", 'out', 'qh2'], [10, `SRCLR${BAR}`, 'in', 'srclr_n'], [11, 'SRCLK', 'in', 'srclk'],
  [12, 'RCLK', 'in', 'rclk'], oe ? [13, `OE${BAR}`, 'in', 'oe_n'] : [13, `RCLR${BAR}`, 'in', 'rclr_n'], [14, 'SER', 'in', 'ser'], [15, 'QA', oe ? 'oc' : 'out', 'qa'], [16, 'VCC', 'vcc']];
const srBody = (oe) => [...clocked('srclk', 'rising', ["srclr_n = '0'", "r <= (others => '0');"], [shift('r', 8, 'ser')]),
  ...clocked('rclk', 'rising', oe ? null : ["rclr_n = '0'", "t <= (others => '0');"], ['t <= r;']),
  ...(oe ? QA_QH.map((p, b) => `${p} <= t(${b}) or oe_n;`) : outs('t', QA_QH)), 'qh2 <= r(7);'];
const c74594 = ic('74594', '8-bit shift register, output register with clear', 15, M16(SR_PINS(false)), { decl: [R(8), R(8, 't')], body: srBody(false) }, 'ttl', null, 'SN74HC594');
const c74596 = ic('74596', '8-bit shift register, output latches, open-collector outputs', 20, M16(SR_PINS(true)), { decl: [R(8), R(8, 't')], body: srBody(true) });

// ------------------------------------------------------------------ 4021: 8-stage static shift register with asynchronous parallel load
// P/S high: PI-1–PI-8 loaded at once; low: on CLK's rising edge SER into stage 1; Q6–Q8 its last three stages
const c4021 = ic('4021', '8-stage static shift register with asynchronous parallel load', 160, M16([[1, 'PI-8', 'in', 'pi8'], [2, 'Q6', 'out', 'q6'], [3, 'Q8', 'out', 'q8'], [4, 'PI-4', 'in', 'pi4'],
  [5, 'PI-3', 'in', 'pi3'], [6, 'PI-2', 'in', 'pi2'], [7, 'PI-1', 'in', 'pi1'], [8, 'VSS', 'gnd'], [9, 'P/S', 'in', 'ps'], [10, 'CLK', 'in', 'clk'], [11, 'SER', 'in', 'ser'], [12, 'Q7', 'out', 'q7'],
  [13, 'PI-5', 'in', 'pi5'], [14, 'PI-6', 'in', 'pi6'], [15, 'PI-7', 'in', 'pi7'], [16, 'VDD', 'vcc']]), { decl: [R(8)], body: [CLOCKED, 'process (clk, ps)', 'begin', `  ${ASYNC_LOAD}`,
  `  if ps = '1' then ${load('r', [1, 2, 3, 4, 5, 6, 7, 8].map((k) => `pi${k}`))}`, '  elsif rising_edge(clk) then', `    ${shift('r', 8, 'ser')}`, '  end if;', 'end process;',
  'q6 <= r(5);', 'q7 <= r(6);', 'q8 <= r(7);'] }, 'cmos');

/** The shift registers written once in VHDL (#4397, group E), as the library lists them. */
export const SHIFT_ICS = [c7491, c7495, c74166, c74195, c74295, c74594, c74596, c4021];
