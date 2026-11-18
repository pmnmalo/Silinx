// Silinx - the GateMate primitives (#2431, Cologne Chip's CCGM1A1 and CCGM1A2): Silinx's own functional models of the cells
// Yosys's synth_gatemate maps a design onto and a user's HDL may instantiate, so that both simulate (the post-synthesis netlist,
// Yosys's write_verilog, in place of the design). Written from Yosys's techlibs/gatemate/cells_sim.v (its behavioural models;
// the PLL and the configuration cells are black boxes there, cells_bb.v) and Cologne Chip's GateMate primitives library
// (UG1001), as gowin-prims.js's from Gowin's. No timing. The names, pins and generics are Cologne Chip's, every one CC_…: no
// other library has them (lattice-libs.js picks this one by them). Yosys writes a one-bit parameter as 1'h0, 1'h1 or 1'hx:
// those generics are std_ulogic.
//   - CC_LUT1 … CC_LUT4 (INIT, O the bit {I3 I2 I1 I0} of it), CC_L2T4 (two LUT2s, I0 I1 and I2 I3, into a third: O =
//     INIT_L10's bit {l01 l00}) and CC_L2T5 (L02 of I0 I1, L03 of I2 I3, L11 of them, L20 of I4 and L11: O = INIT_L20's bit
//     {l11 I4}); an unknown input known when every value it may take gives the same bit; CC_MX2, CC_MX4, CC_MX8;
//   - CC_ADDF (a full adder: {CO, S} = A + B + CI); CC_MULT (signed, A_WIDTH × B_WIDTH: P its low P_WIDTH bits, sign-extended
//     when P is wider);
//   - CC_DFF: D on CLK's rising edge (CLK_INV: falling) when EN (EN_INV: when low), SR (SR_INV: low) setting it to SR_VAL at
//     once, before the clock; INIT its value at start (1'hx, none of the design's: 0, the device's). CC_DLT: open while G (G_INV: low), SR the same;
//   - the I/O buffers CC_IBUF, CC_OBUF, CC_TOBUF and CC_IOBUF (T = 1 releases the pad), the LVDS ones (O_N / IO_N the
//     complement), CC_IDDR (Q0 the rising edge's sample, Q1 the falling one's) and CC_ODDR (D0 taken at the rising edge, D1 at
//     the falling one, Q = D0's while DDR is high); CC_BUFG; their pin's settings (PIN_NAME, DRIVE…) have no effect;
//   - CC_PLL: CLK0 at OUT_CLK MHz (CLK90, CLK180, CLK270 a quarter, a half and three quarters of its period later;
//     CLK180_DOUB / CLK270_DOUB those at twice it), after 3 of CLK_REF's rising edges, when USR_PLL_LOCKED rises; CLK_REF_OUT
//     CLK_REF. Not re-aligned to CLK_REF (OUT_CLK need not be a multiple of REF_CLK); the feedback, the filter constants and
//     USR_LOCKED_STDY_RST are not modelled;
//   - CC_USR_RSTN (USR_RSTN high: the configuration done), CC_CFG_CTRL (no effect);
//   - the block RAMs (CC_BRAM_20K, CC_BRAM_40K): gatemate-bram.js.
//
// Isomorphic ES module (browser + Node), no DOM.

import { GATEMATE_BRAM_VHDL } from './gatemate-bram.js';

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

// a LUT's process (ins its inputs, the first the lowest bit of the index; init its INIT, a std_logic_vector; out its output):
// cells_sim.v's tree of 2:1 multiplexers, an unknown input known when every value it may take gives the same bit
const lutProc = (ins, init, out) => `  process (${ins.join(', ')})
    variable x : std_logic_vector(${ins.length - 1} downto 0);
    variable r : std_ulogic;
    variable fits : boolean;
  begin
    x := ${ins.length > 1 ? [...ins].reverse().join(' & ') : `(0 => ${ins[0]})`};
    r := 'Z';
    for k in 0 to ${2 ** ins.length - 1} loop
      fits := true;
      for i in 0 to ${ins.length - 1} loop
        if (x(i) = '1' and (k / 2 ** i) mod 2 = 0) or (x(i) = '0' and (k / 2 ** i) mod 2 = 1) then fits := false; end if;
      end loop;
      if fits then
        if r = 'Z' then r := ${init}(k); elsif r /= ${init}(k) then r := 'X'; end if;
      end if;
    end loop;
    ${out} <= r;
  end process;`;

const lut = (n) => {
  const ins = Array.from({ length: n }, (_, i) => `I${i}`);
  return entity(`CC_LUT${n}`, `O : out std_ulogic; ${ins.join(', ')} : in std_ulogic := '0'`, lutProc(ins, 'INIT', 'O'),
    { gens: `INIT : std_logic_vector(${2 ** n - 1} downto 0) := (others => '0')` });
};
const INIT4 = names => `${names.join(', ')} : std_logic_vector(3 downto 0) := "0000"`;
const LOGIC = [
  ...[1, 2, 3, 4].map(lut),
  entity('CC_L2T4', "O : out std_ulogic; I0, I1, I2, I3 : in std_ulogic := '0'", `${lutProc(['I0', 'I1'], 'INIT_L00', 'l00')}
${lutProc(['I2', 'I3'], 'INIT_L01', 'l01')}
${lutProc(['l00', 'l01'], 'INIT_L10', 'O')}`, { gens: INIT4(['INIT_L00', 'INIT_L01', 'INIT_L10']), decls: '  signal l00, l01 : std_ulogic;\n' }),
  entity('CC_L2T5', "O : out std_ulogic; I0, I1, I2, I3, I4 : in std_ulogic := '0'", `${lutProc(['I0', 'I1'], 'INIT_L02', 'l02')}
${lutProc(['I2', 'I3'], 'INIT_L03', 'l03')}
${lutProc(['l02', 'l03'], 'INIT_L11', 'l11')}
${lutProc(['I4', 'l11'], 'INIT_L20', 'O')}`, { gens: INIT4(['INIT_L02', 'INIT_L03', 'INIT_L11', 'INIT_L20']), decls: '  signal l02, l03, l11 : std_ulogic;\n' }),
  entity('CC_MX2', 'Y : out std_ulogic; D0, D1, S0 : in std_ulogic', mux2('Y', 'D0', 'D1', 'S0')),
  entity('CC_MX4', 'Y : out std_ulogic; D0, D1, D2, D3, S0, S1 : in std_ulogic', `${mux2('a', 'D0', 'D1', 'S0')}\n${mux2('b', 'D2', 'D3', 'S0')}\n${mux2('Y', 'a', 'b', 'S1')}`,
    { decls: '  signal a, b : std_ulogic;\n' }),
  entity('CC_MX8', 'Y : out std_ulogic; D0, D1, D2, D3, D4, D5, D6, D7, S0, S1, S2 : in std_ulogic', [
    mux2('a', 'D0', 'D1', 'S0'), mux2('b', 'D2', 'D3', 'S0'), mux2('c', 'D4', 'D5', 'S0'), mux2('d', 'D6', 'D7', 'S0'),
    mux2('e', 'a', 'b', 'S1'), mux2('f', 'c', 'd', 'S1'), mux2('Y', 'e', 'f', 'S2')].join('\n'), { decls: '  signal a, b, c, d, e, f : std_ulogic;\n' }),
  entity('CC_ADDF', "CO, S : out std_ulogic; A, B, CI : in std_ulogic := '0'", '  S <= A xor B xor CI;\n  CO <= (A and B) or (CI and (A xor B));'),
  entity('CC_MULT', 'P : out std_logic_vector(P_WIDTH - 1 downto 0); A : in std_logic_vector(A_WIDTH - 1 downto 0); B : in std_logic_vector(B_WIDTH - 1 downto 0)', `  -- (Verilog's product: the low P_WIDTH bits of the whole one, sign-extended when P is wider; numeric_std's resize of a signed
  -- number would keep its sign bit)
  process (A, B)
    variable bad : boolean;
    variable prod : signed(A_WIDTH + B_WIDTH - 1 downto 0);
    variable r : std_logic_vector(P_WIDTH - 1 downto 0);
  begin
    bad := false;
    for i in A'range loop if A(i) /= '0' and A(i) /= '1' then bad := true; end if; end loop;
    for i in B'range loop if B(i) /= '0' and B(i) /= '1' then bad := true; end if; end loop;
    if bad then P <= (others => 'X');
    else
      prod := signed(A) * signed(B);
      for i in 0 to P_WIDTH - 1 loop
        if i < A_WIDTH + B_WIDTH then r(i) := prod(i); else r(i) := prod(A_WIDTH + B_WIDTH - 1); end if;
      end loop;
      P <= r;
    end if;
  end process;`, { gens: 'A_WIDTH, B_WIDTH, P_WIDTH : integer := 1' }),
];

// ---------------------------------------------------------------- the flip-flop and the latch
const SEQ_GENS = "SR_INV, SR_VAL, INIT : std_ulogic := '0'";
// (INIT 1'hx, no initial value of the design's: 0, as the device starts it and the other families' models do, gowin-prims.js,
// ecp5-prims.js; cells_sim.v starts it unknown, which a design whose registers the RTL starts at 0, a VHDL integer's, would not pass)
const START = `  function start(i : std_ulogic) return std_ulogic is
  begin
    if i = '1' then return '1'; else return '0'; end if;
  end function;
  signal q_i : std_ulogic := start(INIT);
`;
const SEQ = [
  entity('CC_DFF', "Q : out std_ulogic; D, CLK : in std_ulogic; EN : in std_ulogic := '1'; SR : in std_ulogic := '0'", `  Q <= q_i;
  -- (on the pins' own edges and values, not on signals a delta later: the inputs as at the edge)
  process (CLK, SR)
    variable sr_v, en_v : std_ulogic;
  begin
    if SR_INV = '1' then sr_v := not SR; else sr_v := SR; end if;
    if EN_INV = '1' then en_v := not EN; else en_v := EN; end if;
    if sr_v = '1' then q_i <= SR_VAL;
    elsif (CLK_INV = '1' and falling_edge(CLK)) or (CLK_INV /= '1' and rising_edge(CLK)) then
      if en_v = '1' then q_i <= D; elsif en_v /= '0' then q_i <= 'X'; end if;
    end if;
  end process;`, { gens: `CLK_INV, EN_INV, ${SEQ_GENS}`, decls: START }),
  entity('CC_DLT', "Q : out std_ulogic; D, G : in std_ulogic; SR : in std_ulogic := '0'", `  Q <= q_i;
  process (D, G, SR)
    variable sr_v, g_v : std_ulogic;
  begin
    if SR_INV = '1' then sr_v := not SR; else sr_v := SR; end if;
    if G_INV = '1' then g_v := not G; else g_v := G; end if;
    if sr_v = '1' then q_i <= SR_VAL;
    elsif g_v = '1' then q_i <= D;
    end if;
  end process;`, { gens: `G_INV, ${SEQ_GENS}`, decls: START }),
];

// ---------------------------------------------------------------- the I/O
// a pin's settings (none of them modelled): its name and voltage, an input's, an output's
const PIN = 'PIN_NAME : string := "UNPLACED"; V_IO : string := "UNDEFINED"';
const PIN2 = 'PIN_NAME_P, PIN_NAME_N : string := "UNPLACED"; V_IO : string := "UNDEFINED"';
const IN_SET = "PULLUP, PULLDOWN, KEEPER, SCHMITT_TRIGGER, FF_IBF : std_ulogic := 'X'; DELAY_IBF : std_logic_vector(3 downto 0) := \"XXXX\"";
const OUT_SET = "DRIVE, SLEW : string := \"UNDEFINED\"; FF_OBF : std_ulogic := 'X'; DELAY_OBF : std_logic_vector(3 downto 0) := \"XXXX\"";
const PULLS = "PULLUP, PULLDOWN, KEEPER : std_ulogic := 'X'";
const LVDS = "LVDS_RTERM, LVDS_BOOST, FF_IBF, FF_OBF : std_ulogic := 'X'; DELAY_IBF, DELAY_OBF : std_logic_vector(3 downto 0) := \"XXXX\"";
const drive = (o, a, t) => `  ${o} <= 'Z' when ${t} = '1' else ${a} when ${t} = '0' else 'X';`;
const IO = [
  entity('CC_IBUF', 'Y : out std_ulogic; I : in std_ulogic', BUF_X01('Y', 'I'), { gens: `${PIN}; ${IN_SET}` }),
  entity('CC_OBUF', 'O : out std_ulogic; A : in std_ulogic', BUF_X01('O', 'A'), { gens: `${PIN}; ${OUT_SET}` }),
  entity('CC_TOBUF', "O : out std_logic; A : in std_ulogic; T : in std_ulogic := '0'", drive('O', 'A', 'T'), { gens: `${PIN}; ${OUT_SET}; ${PULLS}` }),
  entity('CC_IOBUF', "Y : out std_ulogic; IO : inout std_logic; A : in std_ulogic; T : in std_ulogic := '0'", `${drive('IO', 'A', 'T')}\n${BUF_X01('Y', 'IO')}`,
    { gens: `${PIN}; ${OUT_SET}; ${IN_SET}` }),
  entity('CC_LVDS_IBUF', 'Y : out std_ulogic; I_P, I_N : in std_ulogic', BUF_X01('Y', 'I_P'), { gens: `${PIN2}; ${LVDS}` }),
  entity('CC_LVDS_OBUF', 'O_P, O_N : out std_ulogic; A : in std_ulogic', `${BUF_X01('O_P', 'A')}\n  O_N <= not A;`, { gens: `${PIN2}; ${LVDS}` }),
  entity('CC_LVDS_TOBUF', "O_P, O_N : out std_logic; A : in std_ulogic; T : in std_ulogic := '0'", `${drive('O_P', 'A', 'T')}\n${drive('O_N', 'not A', 'T')}`, { gens: `${PIN2}; ${LVDS}` }),
  entity('CC_LVDS_IOBUF', "Y : out std_ulogic; IO_P, IO_N : inout std_logic; A : in std_ulogic; T : in std_ulogic := '0'",
    `${drive('IO_P', 'A', 'T')}\n${drive('IO_N', 'not A', 'T')}\n${BUF_X01('Y', 'IO_P')}`, { gens: `${PIN2}; ${LVDS}` }),
  entity('CC_IDDR', 'Q0, Q1 : out std_ulogic; D, CLK : in std_ulogic', `  process (CLK)
  begin
    if (CLK_INV = '1' and falling_edge(CLK)) or (CLK_INV /= '1' and rising_edge(CLK)) then Q0 <= D;
    elsif (CLK_INV = '1' and rising_edge(CLK)) or (CLK_INV /= '1' and falling_edge(CLK)) then Q1 <= D;
    end if;
  end process;`, { gens: "CLK_INV : std_ulogic := '0'" }),
  entity('CC_ODDR', "Q : out std_ulogic; D0, D1, CLK : in std_ulogic; DDR : in std_ulogic := '0'", `  process (CLK)
  begin
    if (CLK_INV = '1' and falling_edge(CLK)) or (CLK_INV /= '1' and rising_edge(CLK)) then q0 <= D0;
    elsif (CLK_INV = '1' and rising_edge(CLK)) or (CLK_INV /= '1' and falling_edge(CLK)) then q1 <= D1;
    end if;
  end process;
${mux2('Q', 'q1', 'q0', 'DDR')}`, { gens: "CLK_INV : std_ulogic := '0'", decls: "  signal q0, q1 : std_ulogic := 'X';\n" }),
  entity('CC_BUFG', 'O : out std_ulogic; I : in std_ulogic', BUF_X01('O', 'I')),
  entity('CC_USR_RSTN', 'USR_RSTN : out std_ulogic', "  USR_RSTN <= '1';"),
  entity('CC_CFG_CTRL', "DATA : in std_logic_vector(7 downto 0) := (others => '0'); CLK, EN, RECFG, VALID : in std_ulogic := '0'", '  -- (the reconfiguration: no effect)'),
];

// ---------------------------------------------------------------- the PLL
const PLL_LOCK_CYCLES = 3;
// a frequency in MHz written as a decimal ("50.0", "12.5") in kHz
const KHZ = `  function khz(s : string) return integer is
    variable r, f : integer := 0;
    variable frac : boolean := false;
  begin
    for i in 1 to s'length loop
      if s(i) = '.' then frac := true;
      elsif s(i) >= '0' and s(i) <= '9' and (not frac or f < 3) then
        r := r * 10 + character'pos(s(i)) - character'pos('0');
        if frac then f := f + 1; end if;
      end if;
    end loop;
    for i in f to 2 loop r := r * 10; end loop;
    return r;
  end function;
`;
// an output: a clock of period t, its first rising edge `sh` after the lock, while locked
const pllOut = (sig, t, sh) => `  process
  begin
    ${sig} <= '0';
    wait until lk;
    wait for ${sh};
    while lk loop
      ${sig} <= '1'; wait for ${t} / 2;
      ${sig} <= '0'; wait for ${t} - ${t} / 2;
    end loop;
  end process;`;
const PLL = entity('CC_PLL', `CLK0, CLK90, CLK180, CLK270, CLK_REF_OUT, USR_PLL_LOCKED, USR_PLL_LOCKED_STDY : out std_ulogic;
        CLK_REF : in std_ulogic := '0'; CLK_FEEDBACK, USR_CLK_REF, USR_LOCKED_STDY_RST : in std_ulogic := '0'`, `  process
  begin
    if khz(OUT_CLK) <= 0 then report "CC_PLL: OUT_CLK '" & OUT_CLK & "' is no frequency in MHz: no output" severity warning; end if;
    wait;
  end process;
  process (CLK_REF)
    variable n : integer := 0;
  begin
    if rising_edge(CLK_REF) then
      if n < ${PLL_LOCK_CYCLES} then n := n + 1; end if;
      lk <= n >= ${PLL_LOCK_CYCLES} and khz(OUT_CLK) > 0;
    end if;
  end process;
${pllOut('c0', 't', '0 ps')}
${pllOut('c90', 't', 't / 4')}
${pllOut('c180', 't2', 'ph180')}
${pllOut('c270', 't3', 'ph270')}
  CLK0 <= c0; CLK90 <= c90; CLK180 <= c180; CLK270 <= c270;
  CLK_REF_OUT <= CLK_REF;
  USR_PLL_LOCKED <= '1' when lk else '0';
  USR_PLL_LOCKED_STDY <= '1' when lk else '0';`, {
  gens: 'REF_CLK, OUT_CLK, PERF_MD : string := ""; LOCK_REQ, CLK270_DOUB, CLK180_DOUB, LOW_JITTER, CI_FILTER_CONST, CP_FILTER_CONST : integer := 0',
  decls: `${KHZ}  function period return time is
  begin
    if khz(OUT_CLK) > 0 then return 1000000000 ps / khz(OUT_CLK); else return 1000 ps; end if;
  end function;
  constant t : time := period;   -- (OUT_CLK's)
  -- (CLK180 and CLK270 at twice it when doubled: their first edges a half and three quarters of t after CLK0's, of their own period)
  constant t2 : time := t / (1 + CLK180_DOUB);
  constant t3 : time := t / (1 + CLK270_DOUB);
  constant ph180 : time := (t / 2) - t2 * ((t / 2) / t2);
  constant ph270 : time := (3 * t / 4) - t3 * ((3 * t / 4) / t3);
  signal lk : boolean := false;
  signal c0, c90, c180, c270 : std_ulogic := '0';
`,
});

/** VHDL source of the GateMate primitives (compiled with a design that instantiates them). */
export const GATEMATE_VHDL = [
  `-- Silinx GateMate primitives (functional models; see packages/silinx-hdl/src/gatemate-prims.js)
package COMPONENTS is
end COMPONENTS;`,
  ...LOGIC, ...SEQ, ...IO, PLL, GATEMATE_BRAM_VHDL,
].join('\n');

/** The source entry to add to a compilation whose sources use the GateMate primitives. */
export const GATEMATE_SOURCE = { path: '<silinx>/gatemate.vhd', lang: 'vhdl', text: GATEMATE_VHDL };

/** The GateMate primitives Silinx simulates. */
export const GATEMATE_CELLS = new Set([...GATEMATE_VHDL.matchAll(/^entity\s+(\w+)\s+is\b/gim)].map((m) => m[1]));

/** True if a VHDL source uses Cologne Chip's primitives' library (`library cc_lib;`, `library gatemate;`). */
export const usesGatemate = (text) => /\blibrary\s+(cc_lib|gatemate)\s*;/i.test(String(text || ''));
