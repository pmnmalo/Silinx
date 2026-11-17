// Silinx - the ECP5's packed cells (#2299): the cells of nextpnr-ecp5's routed design (its --write JSON, Yosys's
// write_verilog of it: the Post-Place & Route model) that synth_ecp5's netlist has not, joined to ecp5-prims.js's library
// (its TRELLIS_FF, TRELLIS_IO, DCCA, DP16KD, MULT18X18D are the routed design's too; TRELLIS_FF's SD there: "0" its data
// M, "1" DI). Written from Yosys's techlibs/ecp5/cells_sim.v (TRELLIS_COMB) and Project Trellis's slice (TRELLIS_RAMW):
//   - TRELLIS_COMB: half a slice, MODE "LOGIC" (F the LUT4 INITVAL of A … D), "CCU2" (F = the LUT4 xor FCI, FCO the carry:
//     FCI where the LUT4 is 1, else its LUT2, INITVAL's bits 3-0; CCU2_INJECT1 "YES" cuts FCI) or "DPRAM" (F the bit of a
//     16-bit RAM, INITVAL its contents, at {A, C, B, D}, written on WCK's rising edge (WCKMUX "INV": falling) with WRE, WREMUX, at WAD3 … 0 with
//     WD); an open A … D (nextpnr leaves those tied to 1 unconnected, as the ECP5's unrouted LUT inputs read) 1; OFX its wide multiplexer, F1 or F (IS_Z1, or F1 open and FXA or FXB connected: nextpnr gives no IS_Z1, the slice's
//     slot says it: FXB or FXA) by M; an unknown LUT input known when it does not change F;
//   - TRELLIS_RAMW: the distributed RAM's write port, its inputs onto the DPRAM halves' pins: WADO3 … 0 = A0, C0, B0, D0;
//     WDO3 … 0 = B1, D1, A1, C1.
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';

// a LUT's value (cells_sim.v's tree of 2:1 multiplexers: an unknown input known when every value it may take gives the
// same bit), x its inputs (the first the lowest of INIT's index), n of them
const LUT_FN = `  function lut(init : bit_vector; x : std_logic_vector; n : integer) return std_ulogic is
    variable r : std_ulogic := 'Z';
    variable fits : boolean;
  begin
    for k in 0 to 2 ** n - 1 loop
      fits := true;
      for i in 0 to n - 1 loop
        if (x(i) = '1' and (k / 2 ** i) mod 2 = 0) or (x(i) = '0' and (k / 2 ** i) mod 2 = 1) then fits := false; end if;
      end loop;
      if fits then
        if r = 'Z' then r := to_stdulogic(init(k)); elsif r /= to_stdulogic(init(k)) then r := 'X'; end if;
      end if;
    end loop;
    return r;
  end function;
`;

const COMB = `
${IEEE}
entity TRELLIS_COMB is
  generic (MODE : string := "LOGIC"; INITVAL : bit_vector(15 downto 0) := X"0000"; CCU2_INJECT1 : string := "NO"; WREMUX : string := "WRE"; WCKMUX : string := "WCK"; IS_Z1 : bit := '0');
  -- (A … D open: 1, nextpnr leaves those tied to 1 unconnected, as the ECP5's unrouted LUT inputs read; F1, FXA, FXB open: Z,
  -- the wide multiplexer's inputs told by which are connected)
  port (F, FCO, OFX : out std_ulogic; A, B, C, D : in std_ulogic := '1'; F1, FXA, FXB : in std_ulogic := 'Z';
    M, FCI, WD, WAD0, WAD1, WAD2, WAD3, WRE, WCK, DI0, DI1 : in std_ulogic := '0');
end TRELLIS_COMB;
architecture silinx of TRELLIS_COMB is
${LUT_FN}  signal f_i : std_ulogic;
begin
  process (A, B, C, D, FCI, WCK)
    variable mem : bit_vector(15 downto 0) := INITVAL;
    variable l4, l2, we : std_ulogic;
    variable wa, ra : integer;
    variable bad : boolean;
    variable x : std_logic_vector(3 downto 0);
  begin
    if MODE = "DPRAM" then
      if WREMUX = "1" then we := '1'; elsif WREMUX = "0" then we := '0'; elsif WREMUX = "INV" then we := not WRE; else we := WRE; end if;
      -- (written on WCK's own edge, its pins as at the edge)
      if ((WCKMUX = "INV" and falling_edge(WCK)) or (WCKMUX /= "INV" and rising_edge(WCK))) and we = '1' then
        x := WAD3 & WAD2 & WAD1 & WAD0;
        wa := 0; bad := false;
        for i in 3 downto 0 loop
          wa := wa * 2;
          if x(i) = '1' then wa := wa + 1; elsif x(i) /= '0' then bad := true; end if;
        end loop;
        if not bad then mem(wa) := to_bit(WD); end if;
      end if;
      x := A & C & B & D;
      ra := 0; bad := false;
      for i in 3 downto 0 loop
        ra := ra * 2;
        if x(i) = '1' then ra := ra + 1; elsif x(i) /= '0' then bad := true; end if;
      end loop;
      if bad then f_i <= 'X'; else f_i <= to_stdulogic(mem(ra)); end if;
      FCO <= 'X';
    else
      l4 := lut(INITVAL, D & C & B & A, 4);
      if MODE = "CCU2" then
        l2 := lut(INITVAL(3 downto 0), B & A, 2);
        if CCU2_INJECT1 = "YES" then f_i <= l4; l2 := '0'; else f_i <= l4 xor FCI; end if;
        if l4 = '1' then FCO <= FCI; elsif l4 = '0' then FCO <= l2; elsif FCI = l2 then FCO <= l2; else FCO <= 'X'; end if;
      else
        f_i <= l4;
        FCO <= 'X';
      end if;
    end if;
  end process;
  F <= f_i;
  -- (a 2:1 multiplexer: an unknown select known when both inputs agree)
  process (M, FXA, FXB, F1, f_i)
    variable a0, a1 : std_ulogic;
  begin
    -- (IS_Z1, or, as nextpnr's routed design gives none, F1 open and FXA or FXB connected)
    if IS_Z1 = '1' or (F1 = 'Z' and (FXA /= 'Z' or FXB /= 'Z')) then a0 := FXA; a1 := FXB; else a0 := f_i; a1 := F1; end if;
    if M = '1' then OFX <= a1; elsif M = '0' then OFX <= a0; elsif a0 = a1 then OFX <= a0; else OFX <= 'X'; end if;
  end process;
end silinx;`;

const RAMW = `
${IEEE}
entity TRELLIS_RAMW is
  port (WADO0, WADO1, WADO2, WADO3, WDO0, WDO1, WDO2, WDO3 : out std_ulogic; A0, B0, C0, D0, A1, B1, C1, D1 : in std_ulogic := '0');
end TRELLIS_RAMW;
architecture silinx of TRELLIS_RAMW is
begin
  WADO3 <= A0; WADO2 <= C0; WADO1 <= B0; WADO0 <= D0;
  WDO3 <= B1; WDO2 <= D1; WDO1 <= A1; WDO0 <= C1;
end silinx;`;

/** VHDL source of the ECP5's packed cells (joined to ecp5-prims.js's ECP5_VHDL). */
export const ECP5_PACKED_VHDL = [COMB, RAMW].join('\n');
