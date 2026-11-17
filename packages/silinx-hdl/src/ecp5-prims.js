// Silinx - the ECP5 primitives (#2299, the ULX3S's LFE5U-85F, #2302): Silinx's own functional models of the cells Yosys's
// synth_ecp5 maps a design onto and a user's HDL may instantiate, so that both simulate (the post-synthesis netlist, Yosys's
// write_verilog, in place of the design). Written from Yosys's techlibs/ecp5/cells_sim.v (with lattice/'s common_sim.vh,
// ccu2c_sim.vh, cells_ff.vh, cells_io.vh: their behavioural models; the block RAM, the multiplier, the PLL and the
// oscillator are black boxes there, cells_bb.v) and Lattice's ECP5 guides (TN1263 clocks, TN1264 memory, TN1267 DSP), as
// gowin-prims.js's from Gowin's. No timing. The names, pins and generics are Lattice's (its VHDL library: `library ecp5u;
// use ecp5u.components.all;`); LUT4 and INV are UNISIM's and Gowin's names too, with other pins (Z, A …): a compilation has
// one library or another (unisim.js primitiveSources, lattice-libs.js).
//   - LUT4 and LUT2 (INIT, Z the bit {D C B A} of it, an unknown input known when it does not change Z), PFUMX (Z = C0 ?
//     ALUT : BLUT), L6MUX21 (Z = SD ? D1 : D0), CCU2C (two LUT4s and their carry: S = LUT4 xor the carry in, the carry out
//     the carry in where the LUT4 is 1, else its LUT2 (INIT's bits 3-0); INJECT1_* "YES" cuts the carry in), INV, VLO, VHI;
//   - TRELLIS_FF: DI on CLK's rising edge (CLKMUX "INV": falling) with CE (CEMUX "1", "0", "INV" or the pin), LSR its
//     set / reset (REGSET "SET" / "RESET"; LSRMODE "PRLD": M's value), synchronous or (SRMODE "ASYNC") at once, before CE; it
//     starts at that value (cells_sim.v's). The Diamond flip-flops FD1P3AX … JX, FD1S3AX … JX and the I/O registers
//     IFS1P3* / OFS1P3* are TRELLIS_FFs (cells_ff.vh's);
//   - the distributed RAMs TRELLIS_DPR16X4 (16 × 4, INITVAL), DPR16X4C (INITVAL a "0x…" string) and TRELLIS_RAM16X2: read
//     at once at RAD, written on WCK's rising edge (WCKMUX "INV": falling) when WRE (WREMUX "1", "0", "INV" or the pin);
//   - the I/O cells TRELLIS_IO (DIR "INPUT", "OUTPUT", "BIDIR"; T = 1 releases B; DATAMUX_ODDR / MDDR "IOLDO" / "IOLTO": the I/O
//     logic's IOLDO / IOLTO in place of I / T), IB, IBPU, IBPD, OB, OBZ, OBZPU, OBZPD, BB,
//     BBPU, BBPD, OBCO, ILVDS, OLVDS (their complement ZN / OC the input's negation), the DDR registers IDDRX1F (Q0 the
//     rising edge's sample, Q1 the falling edge's before it) and ODDRX1F (D0 while SCLK is high, D1 low, both taken at its
//     rising edge), RST clearing them;
//   - the clock cells DCCA (CLKO = CLKI while CE), DCSC (DCSOUT = CLK1 while SEL1, else CLK0 while SEL0, else DCSMODE "POS" 0,
//     "NEG" 1; "CLK0" / "CLK1" that clock; no glitch-free switch), OSCG (310 MHz / DIV) and EHXPLLL: CLKOP, CLKOS, CLKOS2 and
//     CLKOS3 at CLKI × CLKFB_DIV × (FEEDBK_PATH's output's divider) / (CLKI_DIV × the output's divider), each shifted by its
//     CPHASE VCO cycles and FPHASE eighths of one less the fed back output's (as IceStorm's ecppll sets them), re-aligned to
//     CLKI's rising edges, LOCK after 3 of them, RST
//     stopping them (the outputs low), a disabled output (*_ENABLE "DISABLED") low; REFCLK CLKI, CLKINTFB the fed back
//     output. The dynamic phase shift (PHASESEL, PHASESTEP…), STDBY and the trims are not modelled;
//   - GSR, SGSR, PUR, USRMCLK (no effect: the flip-flops start at their value);
//   - the block RAM (DP16KD): ecp5-bram.js; the multiplier (MULT18X18D): ecp5-dsp.js; nextpnr-ecp5's packed cells
//     (TRELLIS_COMB, TRELLIS_RAMW: the Post-Place & Route model's): ecp5-packed.js.
//
// Isomorphic ES module (browser + Node), no DOM.

import { ECP5_BRAM_VHDL } from './ecp5-bram.js';
import { ECP5_DSP_VHDL } from './ecp5-dsp.js';
import { ECP5_PACKED_VHDL } from './ecp5-packed.js';

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';

const entity = (name, ports, body, { gens = '', decls = '' } = {}) => `
${IEEE}
entity ${name} is
${gens ? `  generic (${gens});\n` : ''}  port (${ports});
end ${name};
architecture silinx of ${name} is
${decls}begin
${body}
end silinx;`;

// buffers pass 0 / 1 (and the weak H / L as 1 / 0); anything else (Z, X) gives X (core/unisim.js's)
const BUF_X01 = (o, i) => `  ${o} <= '1' when ${i} = '1' or ${i} = 'H' else '0' when ${i} = '0' or ${i} = 'L' else 'X';`;
// 2:1 multiplexer, an unknown select known only when both inputs agree (core/unisim.js's)
const mux2 = (out, a, b, s) => `  ${out} <= ${b} when ${s} = '1' else ${a} when ${s} = '0' else ${a} when (${a} = '0' and ${b} = '0') or (${a} = '1' and ${b} = '1') else 'X';`;

// a LUT's process (ins its inputs, the first the lowest bit of INIT's index; init its INIT; out its output): cells_sim.v's tree
// of 2:1 multiplexers, an unknown input known when every value it may take gives the same bit
const lutProc = (ins, init, out) => `  process (${ins.join(', ')})
    variable x : std_logic_vector(${ins.length - 1} downto 0);
    variable r : std_ulogic;
    variable fits : boolean;
  begin
    x := ${[...ins].reverse().join(' & ')};
    r := 'Z';
    for k in 0 to ${2 ** ins.length - 1} loop
      fits := true;
      for i in 0 to ${ins.length - 1} loop
        if (x(i) = '1' and (k / 2 ** i) mod 2 = 0) or (x(i) = '0' and (k / 2 ** i) mod 2 = 1) then fits := false; end if;
      end loop;
      if fits then
        if r = 'Z' then r := to_stdulogic(${init}(k)); elsif r /= to_stdulogic(${init}(k)) then r := 'X'; end if;
      end if;
    end loop;
    ${out} <= r;
  end process;`;

const LOGIC = [
  entity('LUT4', "Z : out std_ulogic; A, B, C, D : in std_ulogic := '0'", lutProc(['A', 'B', 'C', 'D'], 'INIT', 'Z'), { gens: 'INIT : bit_vector(15 downto 0) := X"0000"' }),
  entity('LUT2', "Z : out std_ulogic; A, B : in std_ulogic := '0'", lutProc(['A', 'B'], 'INIT', 'Z'), { gens: 'INIT : bit_vector(3 downto 0) := X"0"' }),
  entity('PFUMX', 'Z : out std_ulogic; ALUT, BLUT, C0 : in std_ulogic', mux2('Z', 'BLUT', 'ALUT', 'C0')),
  entity('L6MUX21', 'Z : out std_ulogic; D0, D1, SD : in std_ulogic', mux2('Z', 'D0', 'D1', 'SD')),
  entity('INV', 'Z : out std_ulogic; A : in std_ulogic', '  Z <= not A;'),
  entity('VLO', 'Z : out std_ulogic', "  Z <= '0';"),
  entity('VHI', 'Z : out std_ulogic', "  Z <= '1';"),
  // (two LUT4s and their LUT2s, the carry between them)
  entity('CCU2C', "S0, S1, COUT : out std_ulogic; CIN, A0, B0, C0, D0, A1, B1, C1, D1 : in std_ulogic := '0'", `${lutProc(['A0', 'B0', 'C0', 'D0'], 'INIT0', 'f0')}
${lutProc(['A1', 'B1', 'C1', 'D1'], 'INIT1', 'f1')}
${lutProc(['A0', 'B0'], 'INIT0(3 downto 0)', 'g0')}
${lutProc(['A1', 'B1'], 'INIT1(3 downto 0)', 'g1')}
  ci0 <= '0' when INJECT1_0 = "YES" else CIN;
  ci1 <= '0' when INJECT1_1 = "YES" else cy0;
  S0 <= f0 xor ci0;
  S1 <= f1 xor ci1;
  h0 <= '0' when INJECT1_0 = "YES" else g0;
  h1 <= '0' when INJECT1_1 = "YES" else g1;
${mux2('cy0', 'h0', 'CIN', 'f0')}
${mux2('COUT', 'h1', 'cy0', 'f1')}`, {
    gens: 'INIT0, INIT1 : bit_vector(15 downto 0) := X"0000"; INJECT1_0, INJECT1_1 : string := "YES"',
    decls: '  signal f0, f1, g0, g1, h0, h1, ci0, ci1, cy0 : std_ulogic;\n',
  }),
];

// ---------------------------------------------------------------- the flip-flops
// TRELLIS_FF's body (cells_sim.v's), its pins named in p (clk, lsr, ce, di, m: a pin or a constant), its choices in k (VHDL
// expressions: inv (CLK inverted), linv (LSR inverted), ce (the enable), prld (LSRMODE "PRLD"), set (REGSET "SET"), asyn)
const TRELLIS_K = { inv: 'CLKMUX = "INV"', linv: 'LSRMUX = "INV"', prld: 'LSRMODE = "PRLD"', set: 'REGSET = "SET"', asyn: 'SRMODE = "ASYNC"',
  ce: `ce_of(CEMUX, CE)` };
const ffBody = (p, k) => `  Q <= q_i;
  -- (on the pins' own edges and values, not on signals a delta later: the inputs as at the edge)
  process (${p.clk}${p.lsr.startsWith("'") ? '' : `, ${p.lsr}`})
    variable lsr, ce, sr : std_ulogic;
  begin
    if not started then
      started <= true;
      if not (${k.prld}) and ${k.set} then q_i <= '1'; else q_i <= '0'; end if;
    end if;
    if ${k.linv} then lsr := not ${p.lsr}; else lsr := ${p.lsr}; end if;
    ce := ${k.ce};
    if ${k.prld} then sr := ${p.m}; elsif ${k.set} then sr := '1'; else sr := '0'; end if;
    if ${k.asyn} and lsr = '1' then q_i <= sr;
    elsif ((${k.inv}) and falling_edge(${p.clk})) or (not (${k.inv}) and rising_edge(${p.clk})) then
      if lsr = '1' then q_i <= sr;
      elsif ce = '1' then q_i <= ${p.di};
      end if;
    end if;
  end process;`;
const FF_DECLS = "  signal q_i : std_ulogic := '0';\n  signal started : boolean := false;\n";
// (SD, nextpnr's routed design's: "0" the data M, "1" DI)
const TRELLIS_FF = entity('TRELLIS_FF', "Q : out std_ulogic; CLK : in std_ulogic; DI, LSR, M : in std_ulogic := '0'; CE : in std_ulogic := '1'",
  ffBody({ clk: 'CLK', lsr: 'LSR', di: 'd_of(SD, DI, M)', m: 'M' }, TRELLIS_K), {
    gens: 'GSR : string := "ENABLED"; CEMUX : string := "1"; CLKMUX : string := "CLK"; LSRMUX : string := "LSR"; SRMODE : string := "LSR_OVER_CE"; REGSET : string := "RESET"; LSRMODE : string := "LSR"; SD : string := "1"',
    decls: `  function ce_of(m : string; c : std_ulogic) return std_ulogic is
  begin
    if m = "1" then return '1'; elsif m = "0" then return '0'; elsif m = "INV" then return not c; else return c; end if;
  end function;
  function d_of(sd : string; di, m : std_ulogic) return std_ulogic is
  begin
    if sd = "0" then return m; else return di; end if;
  end function;
${FF_DECLS}`,
  });
// the Diamond flip-flops (cells_ff.vh's TRELLIS_FFs): name, its set / reset pin (PD a set, CD a reset, none: …AY a set), its
// enable SP, asynchronous or not, its clock's pin
const diamond = (name, pin, ce, asyn, clk = 'CK') => {
  const set = pin === 'PD' || /Y$/.test(name);
  const ports = `Q : out std_ulogic; D, ${clk} : in std_ulogic${pin ? `; ${pin} : in std_ulogic := '0'` : ''}${ce ? "; SP : in std_ulogic := '1'" : ''}`;
  return entity(name, ports, ffBody({ clk, lsr: pin || "'0'", di: 'D', m: "'0'" },
    { inv: 'false', linv: 'false', prld: 'false', set: String(set), asyn: String(asyn), ce: ce ? 'SP' : "'1'" }), { gens: 'GSR : string := "ENABLED"', decls: FF_DECLS });
};
const DIAMOND = [
  ...['AX', 'AY', 'BX', 'DX', 'IX', 'JX'].flatMap((k) => ['P', 'S'].map((c) => {
    const pin = { AX: null, AY: null, BX: 'PD', DX: 'CD', IX: 'CD', JX: 'PD' }[k];
    return diamond(`FD1${c}3${k}`, pin, c === 'P', !/[IJ]X/.test(k));
  })),
  ...['IFS1P3', 'OFS1P3'].flatMap((n) => ['BX', 'DX', 'IX', 'JX'].map((k) => diamond(`${n}${k}`, /[BJ]X/.test(k) ? 'PD' : 'CD', true, /[BD]X/.test(k), 'SCLK'))),
];

// ---------------------------------------------------------------- the distributed RAMs
// a 4-bit address of its bits (hi … lo), unknown when one of them is not 0 / 1
const ADDR = `  function adr(a : std_logic_vector(3 downto 0); bad : out boolean) return integer is
    variable r : integer := 0;
  begin
    bad := false;
    for i in 3 downto 0 loop
      r := r * 2;
      if a(i) = '1' then r := r + 1; elsif a(i) /= '0' then bad := true; end if;
    end loop;
    return r;
  end function;
`;
// a RAM of 16 words of w bits: its write (on WCK's rising edge, WCKMUX "INV" its falling one, when WRE as WREMUX says;
// muxes false: neither generic) at wad and its read (at once) at rad, mem's initial value init; di its data in, dout its
// assignment of q (the word read); funcs its functions
const ram16 = (name, w, ports, { wad, rad, di, dout, init, gens, muxes = true, funcs = '' }) => entity(name, ports, `  d <= ${di};
  wre_i <= ${muxes ? `'1' when WREMUX = "1" else '0' when WREMUX = "0" else not WRE when WREMUX = "INV" else ` : ''}WRE;
  -- (on WCK's own edge, not on a signal a delta later: the address and data as at the edge)
  process (WCK, ${rad.split(' & ').join(', ')})
    variable mem : bit_vector(${16 * w - 1} downto 0) := ${init};
    variable a : integer;
    variable bad : boolean;
    variable q : std_logic_vector(${w - 1} downto 0);
  begin
    if ${muxes ? `((WCKMUX = "INV" and falling_edge(WCK)) or (WCKMUX /= "INV" and rising_edge(WCK)))` : 'rising_edge(WCK)'} and wre_i = '1' then
      a := adr(${wad}, bad);
      if not bad then
        for i in 0 to ${w - 1} loop mem(${w} * a + i) := to_bit(d(i)); end loop;
      end if;
    end if;
    a := adr(${rad}, bad);
    for i in 0 to ${w - 1} loop
      if bad then q(i) := 'X'; else q(i) := to_stdulogic(mem(${w} * a + i)); end if;
    end loop;
    ${dout}
  end process;`, { gens, decls: `${ADDR}${funcs}  signal wre_i : std_ulogic;\n  signal d : std_logic_vector(${w - 1} downto 0);\n` });
const MUX_GENS = 'WCKMUX : string := "WCK"; WREMUX : string := "WRE"';
const RAMS = [
  ram16('TRELLIS_DPR16X4', 4, "DO : out std_logic_vector(3 downto 0); DI, WAD, RAD : in std_logic_vector(3 downto 0); WRE, WCK : in std_ulogic := '0'",
    { wad: 'WAD', rad: 'RAD', di: 'DI', dout: 'DO <= q;', init: 'INITVAL', gens: `${MUX_GENS}; INITVAL : bit_vector(63 downto 0) := (others => '0')` }),
  ram16('TRELLIS_RAM16X2', 2, "DO0, DO1 : out std_ulogic; DI0, DI1, WAD0, WAD1, WAD2, WAD3, RAD0, RAD1, RAD2, RAD3, WRE, WCK : in std_ulogic := '0'",
    { wad: 'WAD3 & WAD2 & WAD1 & WAD0', rad: 'RAD3 & RAD2 & RAD1 & RAD0', di: 'DI1 & DI0', dout: 'DO1 <= q(1); DO0 <= q(0);',
      init: 'interleave(INITVAL_1, INITVAL_0)', gens: `${MUX_GENS}; INITVAL_0, INITVAL_1 : bit_vector(15 downto 0) := X"0000"`,
      funcs: `  -- (word i's bits: INITVAL_1(i), INITVAL_0(i))
  function interleave(h, l : bit_vector(15 downto 0)) return bit_vector is
    variable r : bit_vector(31 downto 0);
  begin
    for i in 0 to 15 loop r(2 * i + 1) := h(i); r(2 * i) := l(i); end loop;
    return r;
  end function;
` }),
  ram16('DPR16X4C', 4, "DO : out std_logic_vector(3 downto 0); DI, WAD, RAD : in std_logic_vector(3 downto 0); WRE, WCK : in std_ulogic := '0'",
    { wad: 'WAD', rad: 'RAD', di: 'DI', dout: 'DO <= q;', init: 'hexval(INITVAL)', gens: 'INITVAL : string := "0x0000000000000000"', muxes: false,
      funcs: `  -- ("0x" and 16 hexadecimal digits, the first the highest)
  function hexval(s : string) return bit_vector is
    variable r : bit_vector(63 downto 0) := (others => '0');
    variable n, c : integer;
  begin
    n := 0;
    for i in s'length downto 3 loop
      c := character'pos(s(i));
      if c >= 48 and c <= 57 then c := c - 48; elsif c >= 65 and c <= 70 then c := c - 55; elsif c >= 97 and c <= 102 then c := c - 87; else c := 0; end if;
      for b in 0 to 3 loop
        if n * 4 + b < 64 and (c / 2 ** b) mod 2 = 1 then r(n * 4 + b) := '1'; end if;
      end loop;
      n := n + 1;
    end loop;
    return r;
  end function;
` }),
];

// ---------------------------------------------------------------- the I/O cells
const T_OFF = (t) => `${t} = '1' or ${t} = 'H'`;
const IOS = [
  // (nextpnr's routed design's DATAMUX_ODDR "IOLDO" / DATAMUX_MDDR "IOLTO": the data / the three-state of the I/O logic, its DDR
  // registers, in place of I / T)
  entity('TRELLIS_IO', "B : inout std_logic; O : out std_ulogic; I, T, IOLDO, IOLTO : in std_ulogic := '0'", `  d <= IOLDO when DATAMUX_ODDR = "IOLDO" else I;
  t_i <= IOLTO when DATAMUX_MDDR = "IOLTO" else T;
  B <= 'Z' when DIR = "INPUT" or ${T_OFF('t_i')} else d;
${BUF_X01('o_i', 'B')}
  O <= 'X' when DIR = "OUTPUT" else o_i;`, { gens: 'DIR : string := "INPUT"; DATAMUX_ODDR, DATAMUX_MDDR : string := "PADDO"', decls: '  signal o_i, d, t_i : std_ulogic;\n' }),
  ...['IB', 'IBPU', 'IBPD'].map((n) => entity(n, 'O : out std_ulogic; I : in std_logic', BUF_X01('O', 'I'))),
  entity('OB', 'O : out std_logic; I : in std_ulogic', BUF_X01('O', 'I')),
  ...['OBZ', 'OBZPU', 'OBZPD'].map((n) => entity(n, "O : out std_logic; I : in std_ulogic; T : in std_ulogic := '0'", `  O <= 'Z' when ${T_OFF('T')} else I;`)),
  ...['BB', 'BBPU', 'BBPD'].map((n) => entity(n, "B : inout std_logic; O : out std_ulogic; I : in std_ulogic; T : in std_ulogic := '0'", `  B <= 'Z' when ${T_OFF('T')} else I;\n${BUF_X01('O', 'B')}`)),
  entity('OBCO', 'OT, OC : out std_logic; I : in std_ulogic', `${BUF_X01('OT', 'I')}\n  OC <= not I;`),
  entity('ILVDS', "Z : out std_ulogic; A : in std_logic; AN : in std_logic := '0'", BUF_X01('Z', 'A')),
  entity('OLVDS', 'Z, ZN : out std_logic; A : in std_ulogic', `${BUF_X01('Z', 'A')}\n  ZN <= not A;`),
  entity('IDDRX1F', "Q0, Q1 : out std_ulogic; D, SCLK : in std_ulogic; RST : in std_ulogic := '0'", `  process (SCLK, RST)
  begin
    if RST = '1' then f <= '0'; q0_i <= '0'; q1_i <= '0';
    elsif falling_edge(SCLK) then f <= D;
    elsif rising_edge(SCLK) then q0_i <= D; q1_i <= f;
    end if;
  end process;
  Q0 <= q0_i;
  Q1 <= q1_i;`, { gens: 'GSR : string := "ENABLED"', decls: "  signal f, q0_i, q1_i : std_ulogic := '0';\n" }),
  entity('ODDRX1F', "Q : out std_ulogic; D0, D1, SCLK : in std_ulogic; RST : in std_ulogic := '0'", `  process (SCLK, RST)
  begin
    if RST = '1' then d0_r <= '0'; d1_r <= '0';
    elsif rising_edge(SCLK) then d0_r <= D0; d1_r <= D1;
    end if;
  end process;
${mux2('Q', 'd1_r', 'd0_r', 'SCLK')}`, { gens: 'GSR : string := "ENABLED"', decls: "  signal d0_r, d1_r : std_ulogic := '0';\n" }),
];

// ---------------------------------------------------------------- the clocks
const CLOCKS = [
  entity('DCCA', "CLKO : out std_ulogic; CLKI : in std_ulogic; CE : in std_ulogic := '1'", "  CLKO <= CLKI when CE = '1' else '0';"),
  entity('DCSC', "DCSOUT : out std_ulogic; CLK0, CLK1 : in std_ulogic; SEL0, SEL1, MODESEL : in std_ulogic := '0'", `  DCSOUT <= CLK0 when DCSMODE = "CLK0" else CLK1 when DCSMODE = "CLK1"
            else CLK1 when SEL1 = '1' else CLK0 when SEL0 = '1' else '1' when DCSMODE = "NEG" else '0';`, { gens: 'DCSMODE : string := "POS"' }),
  entity('OSCG', 'OSC : out std_ulogic', `  process
  begin
    o <= '0';
    wait for half;
    o <= '1';
    wait for half;
  end process;
  OSC <= o;`, { gens: 'DIV : integer := 128', decls: "  constant half : time := (1000000 ps * DIV) / 620;\n  signal o : std_ulogic := '0';\n" }),
  ...['GSR', 'PUR'].map((n) => entity(n, `${n} : in std_ulogic := '1'`, '  -- (the global set / reset: the flip-flops start at their value)', n === 'PUR' ? { gens: 'RST_PULSE : integer := 1' } : {})),
  entity('SGSR', "GSR, CLK : in std_ulogic := '1'", '  -- (the global set / reset: the flip-flops start at their value)'),
  entity('USRMCLK', "USRMCLKI, USRMCLKTS : in std_ulogic := '0'", '  -- (the configuration flash\'s clock: nothing to simulate)'),
];

const PLL_LOCK_CYCLES = 3;
const OUTS = ['OP', 'OS', 'OS2', 'OS3'];
// an output of m periods every d of CLKI's (its period p), from the first of them on, shifted by sh eighths of a VCO cycle
// (dv VCO cycles a period) (a process of EHXPLLL's architecture: rst, lk, p its signals)
const pllOut = (sig, m, d, sh, dv) => `
  process (CLKI, rst_i)
    variable k : integer := 0;
    variable t : time;
  begin
    if rst_i then k := 0; ${sig} <= transport '0';
    elsif rising_edge(CLKI) and lk then
      if k = 0 then
        t := (p * (${d})) / (${m});
        for i in 0 to (${m}) - 1 loop
          ${sig} <= transport '1' after (t * (${sh})) / (8 * (${dv})) + t * i;
          ${sig} <= transport '0' after (t * (${sh})) / (8 * (${dv})) + t * i + t / 2;
        end loop;
      end if;
      k := k + 1;
      if k >= ${d} then k := 0; end if;
    end if;
  end process;`;
const EHXPLLL = entity('EHXPLLL', `CLKOP, CLKOS, CLKOS2, CLKOS3, LOCK, INTLOCK, REFCLK, CLKINTFB : out std_ulogic;
        CLKI : in std_ulogic; CLKFB, PHASESEL1, PHASESEL0, PHASEDIR, PHASESTEP, PHASELOADREG, STDBY, PLLWAKESYNC, RST : in std_ulogic := '0';
        ENCLKOP, ENCLKOS, ENCLKOS2, ENCLKOS3 : in std_ulogic := '1'`, `  rst_i <= RST = '1';
  process (CLKI, rst_i)
    variable last : time := 0 ns;
    variable n : integer := 0;
  begin
    if rst_i then n := 0; lk <= false;
    elsif rising_edge(CLKI) then
      if n > 0 then p <= now - last; end if;
      last := now;
      if n < ${PLL_LOCK_CYCLES} then n := n + 1; end if;
      lk <= n >= ${PLL_LOCK_CYCLES};
    end if;
  end process;
${OUTS.map((x) => pllOut(`c${x}`, 'CLKFB_DIV * FBDIV', `CLKI_DIV * CLK${x}_DIV`, `shift(CLK${x}_CPHASE, CLK${x}_FPHASE, CLK${x}_DIV)`, `CLK${x}_DIV`)).join('')}
${OUTS.map((x) => `  CLK${x} <= c${x} when CLK${x}_ENABLE = "ENABLED" else '0';`).join('\n')}
  LOCK <= '1' when lk else '0';
  INTLOCK <= '1' when lk else '0';
  REFCLK <= CLKI;
  CLKINTFB <= cOP when FEEDBK_PATH = "INT_OP" or FEEDBK_PATH = "CLKOP" else cOS when FEEDBK_PATH = "INT_OS" or FEEDBK_PATH = "CLKOS"
              else cOS2 when FEEDBK_PATH = "INT_OS2" or FEEDBK_PATH = "CLKOS2" else cOS3;`, {
  gens: ['CLKI_DIV, CLKFB_DIV : integer := 1', ...OUTS.map((x) => `CLK${x}_DIV : integer := 8`), `CLKOP_ENABLE : string := "ENABLED"`,
    ...OUTS.slice(1).map((x) => `CLK${x}_ENABLE : string := "DISABLED"`), ...OUTS.map((x) => `CLK${x}_CPHASE, CLK${x}_FPHASE : integer := 0`),
    'FEEDBK_PATH : string := "CLKOP"', 'CLKOP_TRIM_POL, CLKOS_TRIM_POL : string := "RISING"', 'CLKOP_TRIM_DELAY, CLKOS_TRIM_DELAY : integer := 0',
    'OUTDIVIDER_MUXA : string := "DIVA"', 'OUTDIVIDER_MUXB : string := "DIVB"', 'OUTDIVIDER_MUXC : string := "DIVC"', 'OUTDIVIDER_MUXD : string := "DIVD"',
    'PLL_LOCK_MODE : integer := 0', 'PLL_LOCK_DELAY : integer := 200', 'STDBY_ENABLE, REFIN_RESET, SYNC_ENABLE : string := "DISABLED"',
    'INT_LOCK_STICKY : string := "ENABLED"', 'DPHASE_SOURCE, PLLRST_ENA, INTFB_WAKE : string := "DISABLED"'].join(';\n           '),
  decls: `  -- (the fed back output's divider: the VCO at CLKI × CLKFB_DIV × it / CLKI_DIV)
  function fbdiv(path : string) return integer is
  begin
    if path = "CLKOS" or path = "INT_OS" then return CLKOS_DIV;
    elsif path = "CLKOS2" or path = "INT_OS2" then return CLKOS2_DIV;
    elsif path = "CLKOS3" or path = "INT_OS3" then return CLKOS3_DIV;
    else return CLKOP_DIV;
    end if;
  end function;
  -- (the fed back output's phase, in eighths of a VCO cycle: CPHASE × 8 + FPHASE)
  function fbphase(path : string) return integer is
  begin
    if path = "CLKOS" or path = "INT_OS" then return CLKOS_CPHASE * 8 + CLKOS_FPHASE;
    elsif path = "CLKOS2" or path = "INT_OS2" then return CLKOS2_CPHASE * 8 + CLKOS2_FPHASE;
    elsif path = "CLKOS3" or path = "INT_OS3" then return CLKOS3_CPHASE * 8 + CLKOS3_FPHASE;
    else return CLKOP_CPHASE * 8 + CLKOP_FPHASE;
    end if;
  end function;
  -- (an output's shift after CLKI, in eighths of a VCO cycle within its period: its phase less the fed back output's, which
  -- the loop aligns with CLKI)
  function shift(c, f, dv : integer) return integer is
  begin
    return ((c * 8 + f - fbphase(FEEDBK_PATH)) mod (8 * dv) + 8 * dv) mod (8 * dv);
  end function;
  constant FBDIV : integer := fbdiv(FEEDBK_PATH);
  signal p : time := 0 ns;               -- CLKI's period
  signal lk, rst_i : boolean := false;
  signal ${OUTS.map((x) => `c${x}`).join(', ')} : std_ulogic := '0';
`,
});

/** VHDL source of the ECP5 primitives (compiled with a design that instantiates them). */
export const ECP5_VHDL = [
  `-- Silinx ECP5 primitives (functional models; see packages/silinx-hdl/src/ecp5-prims.js)
package COMPONENTS is
end COMPONENTS;`,
  ...LOGIC, TRELLIS_FF, ...DIAMOND, ...RAMS, ...IOS, ...CLOCKS, EHXPLLL,
  ECP5_BRAM_VHDL, ECP5_DSP_VHDL, ECP5_PACKED_VHDL,
].join('\n');

/** The source entry to add to a compilation whose sources use the ECP5 primitives. */
export const ECP5_SOURCE = { path: '<silinx>/ecp5.vhd', lang: 'vhdl', text: ECP5_VHDL };

/** The ECP5 primitives Silinx simulates. */
export const ECP5_CELLS = new Set([...ECP5_VHDL.matchAll(/^entity\s+(\w+)\s+is\b/gim)].map((m) => m[1]));

/** True if a VHDL source uses Lattice's ECP5 library (`library ecp5u;`, ecp5um, ecp5um5g). */
export const usesEcp5 = (text) => /\blibrary\s+ecp5u\w*\s*;/i.test(String(text || ''));
