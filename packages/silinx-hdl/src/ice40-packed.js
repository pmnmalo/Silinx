// Silinx - the iCE40's packed cells (#2299): the cells of nextpnr-ice40's routed design (its --write JSON, Yosys's
// write_verilog of it: the Post-Place & Route model), joined to ice40-prims.js's library. Written from Yosys's
// techlibs/ice40/cells_sim.v (ICESTORM_LC, ICESTORM_RAM):
//   - ICESTORM_LC: the logic cell, a LUT (LUT_INIT, LO its output; an unknown input known when it does not change it), its
//     carry (CARRY_ENABLE: COUT = I1·I2 + (I1 + I2)·CI, CI the constant CIN_SET with CIN_CONST) and its flip-flop (DFF_ENABLE:
//     O its Q, else the LUT's output; on CLK's rising edge, NEG_CLK its falling one, with CEN; SR its set (SET_NORESET) or
//     reset, ASYNC_SR at once, else at the edge; starting at 0); an open input pin (Z: the Verilog netlist leaves it
//     unconnected) 0, CEN 1;
//   - ICESTORM_RAM: SB_RAM40_4K with its buses as single pins (RDATA_15 … 0, RADDR_10 … 0, …), NEG_CLK_R / NEG_CLK_W its
//     clocks' falling edges; an open pin 0, RCLKE and WCLKE 1.
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const range = (n) => Array.from({ length: n }, (_, i) => i);
const pins = (pre, n) => range(n).reverse().map((i) => `${pre}_${i}`);
const HEX = '0123456789ABCDEF';

// an open pin (Z, as a Verilog netlist leaves it) read as 0, or as 1 (cells_sim.v's pd and pu)
const PULLS = `  function pd(x : std_ulogic) return std_ulogic is
  begin
    if x = 'Z' then return '0'; else return x; end if;
  end function;
  function pu(x : std_ulogic) return std_ulogic is
  begin
    if x = 'Z' then return '1'; else return x; end if;
  end function;
`;

const LC = `
${IEEE}
entity ICESTORM_LC is
  generic (LUT_INIT : bit_vector(15 downto 0) := X"0000"; NEG_CLK, CARRY_ENABLE, DFF_ENABLE, SET_NORESET, ASYNC_SR, CIN_CONST, CIN_SET : bit := '0');
  port (LO, O, COUT : out std_ulogic; I0, I1, I2, I3, CIN, CLK, SR : in std_ulogic := '0'; CEN : in std_ulogic := '1');
end ICESTORM_LC;
architecture silinx of ICESTORM_LC is
${PULLS}  signal lut : std_ulogic;   -- (computed: not 0 before it is)
  signal q, sr_d : std_ulogic := '0';
  signal cen_d : std_ulogic := '1';
begin
  -- (cells_sim.v's tree of 2:1 multiplexers: an unknown input known when every value it may take gives the same bit)
  process (I0, I1, I2, I3)
    variable x : std_logic_vector(3 downto 0);
    variable r : std_ulogic;
    variable fits : boolean;
  begin
    x := pd(I3) & pd(I2) & pd(I1) & pd(I0);
    r := 'Z';
    for k in 0 to 15 loop
      fits := true;
      for i in 0 to 3 loop
        if (x(i) = '1' and (k / 2 ** i) mod 2 = 0) or (x(i) = '0' and (k / 2 ** i) mod 2 = 1) then fits := false; end if;
      end loop;
      if fits then
        if r = 'Z' then r := to_stdulogic(LUT_INIT(k)); elsif r /= to_stdulogic(LUT_INIT(k)) then r := 'X'; end if;
      end if;
    end loop;
    lut <= r;
  end process;
  process (I1, I2, CIN)
    variable c : std_ulogic;
  begin
    if CIN_CONST = '1' then c := to_stdulogic(CIN_SET); else c := pd(CIN); end if;
    if CARRY_ENABLE = '0' then COUT <= 'X'; else COUT <= (pd(I1) and pd(I2)) or ((pd(I1) or pd(I2)) and c); end if;
  end process;
  -- (on CLK's own edge: the LUT's value, SR and CEN as they were a delta before, as from cells of their own: a signal that
  -- changes with the clock, an input pad's, is the next edge's)
  sr_d <= pd(SR);
  cen_d <= pu(CEN);
  process (CLK, SR)
  begin
    if ASYNC_SR = '1' and pd(SR) = '1' then q <= to_stdulogic(SET_NORESET);
    elsif (NEG_CLK = '0' and rising_edge(CLK)) or (NEG_CLK = '1' and falling_edge(CLK)) then
      if cen_d /= '0' then
        if sr_d = '1' then q <= to_stdulogic(SET_NORESET); else q <= lut; end if;
      end if;
    end if;
  end process;
  LO <= lut;
  O <= q when DFF_ENABLE = '1' else lut;
end silinx;`;

// (its pins as SB_RAM40_4K's buses; the clocks inverted by NEG_CLK_R / NEG_CLK_W: the falling-edge twins' process)
const RAM = `
${IEEE}
entity ICESTORM_RAM is
  generic (WRITE_MODE, READ_MODE : integer := 0; NEG_CLK_R, NEG_CLK_W : bit := '0';
    ${[...HEX].map((h) => `INIT_${h}`).join(', ')} : bit_vector(255 downto 0) := (others => '0'));
  port (${pins('RDATA', 16).join(', ')} : out std_ulogic;
    RCLK, WCLK, RE, WE : in std_ulogic := '0'; RCLKE, WCLKE : in std_ulogic := '1';
    ${[...pins('RADDR', 11), ...pins('WADDR', 11), ...pins('MASK', 16), ...pins('WDATA', 16)].join(', ')} : in std_ulogic := '0');
end ICESTORM_RAM;
architecture silinx of ICESTORM_RAM is
${PULLS}  signal rd, mk, wd : std_logic_vector(15 downto 0);
  signal ra, wa : std_logic_vector(10 downto 0);
  signal rclk_i, wclk_i, re_i, we_i, rce_i, wce_i : std_ulogic;
begin
  -- (the clocks, buses and data as SB_RAM40_4K's, each a delta after its pins: its process reads the inputs at the clocks'
  -- edges as they were at the pins' edges)
  rclk_i <= pd(RCLK) xor to_stdulogic(NEG_CLK_R);
  wclk_i <= pd(WCLK) xor to_stdulogic(NEG_CLK_W);
  re_i <= pd(RE); we_i <= pd(WE); rce_i <= pu(RCLKE); wce_i <= pu(WCLKE);
  ra <= ${pins('RADDR', 11).map((p) => `pd(${p})`).join(' & ')};
  wa <= ${pins('WADDR', 11).map((p) => `pd(${p})`).join(' & ')};
  mk <= ${pins('MASK', 16).map((p) => `pd(${p})`).join(' & ')};
  wd <= ${pins('WDATA', 16).map((p) => `pd(${p})`).join(' & ')};
  ram : entity work.SB_RAM40_4K
    generic map (WRITE_MODE => WRITE_MODE, READ_MODE => READ_MODE, ${[...HEX].map((h) => `INIT_${h} => INIT_${h}`).join(', ')})
    port map (RDATA => rd, RCLK => rclk_i, RCLKE => rce_i, RE => re_i, RADDR => ra, WCLK => wclk_i, WCLKE => wce_i, WE => we_i, WADDR => wa, MASK => mk, WDATA => wd);
${range(16).map((i) => `  RDATA_${i} <= rd(${i});`).join('\n')}
end silinx;`;

/** VHDL source of the iCE40's packed cells (joined to ice40-prims.js's ICE40_VHDL). */
export const ICE40_PACKED_VHDL = [LC, RAM].join('\n');
