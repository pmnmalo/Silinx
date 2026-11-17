// Silinx - the ECP5's block RAM (#2299): ecp5-prims.js's DP16KD, written from Lattice's memory usage guide (TN1264) and how
// Yosys's synth_ecp5 uses it (techlibs/lattice/brams_map_16kd.v, brams_16kd.txt; cells_sim.v has it as a black box):
//   - 18 Kbit, INITVAL_00 … 3F (320 bits each: 16 rows of 18 bits, each in 20, the lowest first), rows of 18 bits;
//   - a port of DATA_WIDTH w (1, 2, 4, 9, 18) addresses its word with AD(13 downto 0, 1, 2, 3, 4), the words of 1, 2 and 4
//     bits within a row's two 9-bit bytes (bits 0-7 and 9-16), its data on DI / DO(w - 1 downto 0); 18 bits write the bytes
//     AD(0) and AD(1) enable; DATA_WIDTH 36 (the pseudo dual port Yosys maps a 36-bit memory onto): port A writes rows 2k and
//     2k + 1 at AD(13 downto 5) = k from DIA and DIB, the 9-bit bytes AD(3 downto 0) enable, port B reads them onto DOA and DOB;
//   - on its clock's rising edge (CLK*MUX "INV": falling) with CE and its CS pins = CSDECODE: a write (WE) and a read into
//     the output latch as WRITEMODE says ("NORMAL": a write keeps the latch, "WRITETHROUGH": the word written,
//     "READBEFOREWRITE": the word before); REGMODE "OUTREG": the output register, loaded from the latch when OCE; the latch
//     and the register start at 0;
//   - RST clears the latch and the register: on the clock's edge whatever CE (RESETMODE "SYNC"), or at once ("ASYNC");
//   - the ports' reads of an edge before its writes; collisions are not checked. The pins' other *MUX generics are accepted
//     and not modelled.
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const range = (n) => Array.from({ length: n }, (_, i) => i);
const vec = (pre, n) => range(n).reverse().map((i) => `${pre}${i}`).join(' & ');

// a port's pins and its generics, x its letter
const PORT_PINS = (x) => [...range(18).map((i) => `DI${x}${i}`), ...range(14).map((i) => `AD${x}${i}`), `CE${x}`, `OCE${x}`, `CLK${x}`, `WE${x}`, `RST${x}`,
  ...range(3).map((i) => `CS${x}${i}`), ...range(18).map((i) => `DO${x}${i}`)];

// a port's work on its clock's edge (x its letter, c the other's: DATA_WIDTH 36 writes with A's data and B's)
const edge = (x) => `    if (CLK${x}MUX = "INV" and falling_edge(CLK${x})) or (CLK${x}MUX /= "INV" and rising_edge(CLK${x})) then
      if REGMODE_${x} = "OUTREG" and oce${x}_i = '1' then r${x} := l${x}; end if;
      if cs${x} = cscode(CSDECODE_${x}) then
        if RESETMODE = "SYNC" and RST${x} = '1' then l${x} := (others => '0'); r${x} := (others => '0');
        elsif ce${x}_i = '1' then
          w := DATA_WIDTH_${x};
          k := word(ad${x}, w, bad);
          wr${x} := we${x}_i = '1' and not bad;
          -- the word before (the latch, unless a write keeps it)
          if bad then q := (others => 'X'); else q := (others => '0'); end if;
          for i in 0 to 35 loop
            if i < w and not bad then q(i) := to_stdulogic(mem(pos(k, i, w))); end if;
          end loop;
          if not wr${x} or WRITEMODE_${x} = "READBEFOREWRITE" then l${x} := q;
          elsif WRITEMODE_${x} = "WRITETHROUGH" then
            l${x} := (others => '0');
            for i in 0 to 35 loop
              if i < w then l${x}(i) := di${x}(i); end if;
            end loop;
          end if;
          a${x} := k;
        end if;
      end if;
    end if;`;
// a port's write, after both ports' reads: its bits (the bytes its AD(3 downto 0) enable at 18 and 36 bits)
const write = (x) => `    if wr${x} then
      w := DATA_WIDTH_${x};
      for i in 0 to 35 loop
        if i < w and (w < 18 or ad${x}(i / 9) = '1') then mem(pos(a${x}, i, w)) := to_bit(di${x}(i)); end if;
      end loop;
      wr${x} := false;
    end if;`;

/** VHDL source of the ECP5's block RAM (joined to ecp5-prims.js's ECP5_VHDL). */
export const ECP5_BRAM_VHDL = `
${IEEE}
entity DP16KD is
  generic (DATA_WIDTH_A, DATA_WIDTH_B : integer := 18;
    REGMODE_A, REGMODE_B : string := "NOREG"; RESETMODE, ASYNC_RESET_RELEASE : string := "SYNC";
    CSDECODE_A, CSDECODE_B : string := "0b000"; WRITEMODE_A, WRITEMODE_B : string := "NORMAL";
    ${['A', 'B'].map((x) => PORT_PINS(x).map((p) => `${p}MUX`).join(', ')).join(',\n    ')} : string := "";
    WID : integer := 0; GSR : string := "ENABLED"; INIT_DATA : string := "STATIC";
    ${range(64).map((j) => `INITVAL_${hex2(j)}`).join(', ')} : bit_vector(319 downto 0) := (others => '0'));
  port (${['A', 'B'].map((x) => `DO${x}17${range(17).reverse().map((i) => `, DO${x}${i}`).join('')} : out std_ulogic;
    ${range(18).map((i) => `DI${x}${i}`).join(', ')}, ${range(14).map((i) => `AD${x}${i}`).join(', ')},
    WE${x}, RST${x}, CS${x}0, CS${x}1, CS${x}2, CLK${x} : in std_ulogic := '0'; CE${x}, OCE${x} : in std_ulogic := '1'`).join(';\n    ')});
end DP16KD;
architecture silinx of DP16KD is
  -- (an INITVAL's 16 rows of 18 bits, out of their 20)
  function rows(v : bit_vector(319 downto 0)) return bit_vector is
    variable r : bit_vector(287 downto 0);
  begin
    for j in 0 to 15 loop r(18 * j + 17 downto 18 * j) := v(20 * j + 17 downto 20 * j); end loop;
    return r;
  end function;
  -- the word a port of w bits addresses (bad: an address bit unknown)
  function word(a : std_logic_vector(13 downto 0); w : integer; bad : out boolean) return integer is
    variable lo, r : integer := 0;
  begin
    if w = 36 then lo := 5; elsif w = 18 then lo := 4; elsif w = 9 then lo := 3; elsif w = 4 then lo := 2; elsif w = 2 then lo := 1; end if;
    bad := false;
    for i in 13 downto lo loop
      r := r * 2;
      if a(i) = '1' then r := r + 1; elsif a(i) /= '0' then bad := true; end if;
    end loop;
    return r;
  end function;
  -- the bit of the memory that bit i of word k of w bits is (the words of 1, 2 and 4 bits in the bytes' 8 low bits)
  function pos(k, i, w : integer) return integer is
  begin
    if w >= 9 then return k * w + i;
    else return (k / (8 / w)) * 9 + (k mod (8 / w)) * w + i;
    end if;
  end function;
  -- CSDECODE ("0b" and 3 bits) as the CS pins' value
  function cscode(s : string) return std_logic_vector is
    variable r : std_logic_vector(2 downto 0) := "000";
  begin
    for i in 0 to 2 loop
      if s'length >= 3 + i and s(s'length - i) = '1' then r(i) := '1'; end if;
    end loop;
    return r;
  end function;
  signal diA, diB, doA_i, doB_i : std_logic_vector(35 downto 0) := (others => '0');
  signal adA, adB : std_logic_vector(13 downto 0);
  signal csA, csB : std_logic_vector(2 downto 0);
  signal ceA_i, ceB_i, oceA_i, oceB_i, weA_i, weB_i : std_ulogic;
begin
  -- (36 bits: port A's data in on DIA and DIB, port B's out on DOA and DOB)
  diA <= ${vec('DIB', 18)} & ${vec('DIA', 18)};
  diB <= "000000000000000000" & ${vec('DIB', 18)};
  adA <= ${vec('ADA', 14)};
  adB <= ${vec('ADB', 14)};
  csA <= CSA2 & CSA1 & CSA0;
  csB <= CSB2 & CSB1 & CSB0;
${['A', 'B'].map((x) => ['CE', 'OCE', 'WE'].map((p) => `  ${p.toLowerCase()}${x}_i <= not ${p}${x} when ${p}${x}MUX = "INV" else ${p}${x};`).join('\n')).join('\n')}
  process (CLKA, CLKB, RSTA, RSTB)
    variable mem : bit_vector(18431 downto 0);
    variable started : boolean := false;
    variable w, k, aA, aB : integer := 0;
    variable bad, wrA, wrB : boolean := false;
    variable q, lA, rA, lB, rB : std_logic_vector(35 downto 0) := (others => '0');
  begin
    if not started then
      started := true;
      mem := ${range(64).reverse().map((j) => `rows(INITVAL_${hex2(j)})`).join(' & ')};
    end if;
${edge('A')}
${edge('B')}
${write('A')}
${write('B')}
    if RESETMODE = "ASYNC" and RSTA = '1' then lA := (others => '0'); rA := (others => '0'); end if;
    if RESETMODE = "ASYNC" and RSTB = '1' then lB := (others => '0'); rB := (others => '0'); end if;
    if REGMODE_A = "OUTREG" then doA_i <= rA; else doA_i <= lA; end if;
    if REGMODE_B = "OUTREG" then doB_i <= rB; else doB_i <= lB; end if;
  end process;
${range(18).map((i) => `  DOA${i} <= doB_i(${i}) when DATA_WIDTH_B = 36 else doA_i(${i});\n  DOB${i} <= doB_i(${i + 18}) when DATA_WIDTH_B = 36 else doB_i(${i});`).join('\n')}
end silinx;`;
