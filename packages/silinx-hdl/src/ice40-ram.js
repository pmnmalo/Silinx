// Silinx - the iCE40's RAMs (#2299): ice40-prims.js's, written from Yosys's techlibs/ice40/cells_sim.v.
//   - the block RAMs SB_RAM40_4K, SB_RAM40_4KNR (read on RCLKN's falling edge), SB_RAM40_4KNW (written on WCLKN's) and
//     SB_RAM40_4KNRNW: 4 Kbit, 256 words of 16 bits, INIT_0 … INIT_F (256 bits each, INIT_0's bits 15 … 0 word 0). WRITE_MODE
//     / READ_MODE 0: 256 × 16 (MASK's 1s the bits a write keeps), 1: 512 × 8, 2: 1024 × 4, 3: 2048 × 2, the address's bits
//     above 7 choosing one bit of every group of 2, 4 or 8 (the data on WDATA's and RDATA's bits 2j, 4j + 1, 8j + 3 as
//     cells_sim.v's); a write on its clock's edge with WE and WCLKE, a read into RDATA on its own with RE and RCLKE (RDATA
//     starts at 0, the iCE40's after its configuration; cells_sim.v's starts unknown);
//   - the UltraPlus's single-port RAM SB_SPRAM256KA: 16384 words of 16 bits, on CLOCK's rising edge with CHIPSELECT a write
//     (WREN, of the nibbles MASKWREN enables; DATAOUT unknown) or a read; STANDBY: DATAOUT unknown; SLEEP or POWEROFF low:
//     DATAOUT 0 at once, POWEROFF's falling edge loses the contents (unknown, as at the start).
//
// Isomorphic ES module (browser + Node), no DOM.

const IEEE = 'library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;';
const HEX = '0123456789ABCDEF';

// the bit of an address's word that mode m (1 … 3) reads or writes: the address's bits 8 … 7 + m
const ADDR = `  function adr(a : std_logic_vector; lo, hi : integer; bad : out boolean) return integer is
    variable r : integer := 0;
  begin
    bad := false;
    for i in hi downto lo loop
      r := r * 2;
      if a(i) = '1' then r := r + 1; elsif a(i) /= '0' then bad := true; end if;
    end loop;
    return r;
  end function;
`;

const ram40 = (nr, nw) => {
  const name = `SB_RAM40_4K${nr ? 'NR' : ''}${nw ? 'NW' : ''}`;
  const rclk = nr ? 'RCLKN' : 'RCLK', wclk = nw ? 'WCLKN' : 'WCLK';
  return `
${IEEE}
entity ${name} is
  generic (WRITE_MODE, READ_MODE : integer := 0;
    ${[...HEX].map((h) => `INIT_${h}`).join(', ')} : bit_vector(255 downto 0) := (others => '0');
    INIT_FILE : string := "");
  port (RDATA : out std_logic_vector(15 downto 0);
    ${rclk}, ${wclk} : in std_ulogic; RCLKE, WCLKE : in std_ulogic := '1'; RE, WE : in std_ulogic := '0';
    RADDR, WADDR : in std_logic_vector(10 downto 0);
    MASK : in std_logic_vector(15 downto 0) := (others => '0');
    WDATA : in std_logic_vector(15 downto 0));
end ${name};
architecture silinx of ${name} is
${ADDR}  -- (a mode's group of bits, 1, 2, 4 or 8, and the data's bit in each group: 0, 0, 1, 3)
  function grp(m : integer) return integer is
  begin
    return 2 ** m;
  end function;
  signal r : std_logic_vector(15 downto 0) := (others => '0');
  function dbit(m : integer) return integer is
  begin
    if m = 0 or m = 1 then return 0; elsif m = 2 then return 1; else return 3; end if;
  end function;
begin
  process (${rclk}, ${wclk})
    variable mem : bit_vector(4095 downto 0);
    variable started : boolean := false;
    variable a, s : integer;
    variable bad, bs : boolean;
    variable q : std_logic_vector(15 downto 0) := (others => '0');
  begin
    if not started then
      started := true;
      mem := ${[...HEX].reverse().map((h) => `INIT_${h}`).join(' & ')};
    end if;
    -- (the read before the write of the same edge)
    if ${nr ? 'falling_edge' : 'rising_edge'}(${rclk}) and RE = '1' and RCLKE = '1' then
      a := adr(RADDR, 0, 7, bad);
      s := 0;
      if READ_MODE > 0 then s := adr(RADDR, 8, 7 + READ_MODE, bs); bad := bad or bs; end if;
      q := (others => '0');
      for i in 0 to 15 loop
        if bad then q(i) := 'X';
        elsif READ_MODE = 0 then q(i) := to_stdulogic(mem(a * 16 + i));
        elsif i mod grp(READ_MODE) = dbit(READ_MODE) then q(i) := to_stdulogic(mem(a * 16 + i - dbit(READ_MODE) + s));
        end if;
      end loop;
      r <= q;
    end if;
    if ${nw ? 'falling_edge' : 'rising_edge'}(${wclk}) and WE = '1' and WCLKE = '1' then
      a := adr(WADDR, 0, 7, bad);
      s := 0;
      if WRITE_MODE > 0 then s := adr(WADDR, 8, 7 + WRITE_MODE, bs); bad := bad or bs; end if;
      if not bad then
        for i in 0 to 15 loop
          if WRITE_MODE = 0 then
            if MASK(i) /= '1' then mem(a * 16 + i) := to_bit(WDATA(i)); end if;
          elsif i mod grp(WRITE_MODE) = s then
            mem(a * 16 + i) := to_bit(WDATA(i - s + dbit(WRITE_MODE)));
          end if;
        end loop;
      end if;
    end if;
  end process;
  RDATA <= r;
end silinx;`;
};

const SPRAM = `
${IEEE}
entity SB_SPRAM256KA is
  port (DATAOUT : out std_logic_vector(15 downto 0);
    ADDRESS : in std_logic_vector(13 downto 0); DATAIN : in std_logic_vector(15 downto 0);
    MASKWREN : in std_logic_vector(3 downto 0) := (others => '1');
    WREN, CHIPSELECT, CLOCK, STANDBY, SLEEP : in std_ulogic := '0'; POWEROFF : in std_ulogic := '1');
end SB_SPRAM256KA;
architecture silinx of SB_SPRAM256KA is
${ADDR}  type mem_t is array (0 to 16383) of std_logic_vector(15 downto 0);
begin
  process (CLOCK, SLEEP, POWEROFF)
    variable mem : mem_t := (others => (others => 'X'));
    variable a : integer;
    variable bad : boolean;
  begin
    if falling_edge(POWEROFF) then mem := (others => (others => 'X')); end if;
    if SLEEP = '1' or POWEROFF = '0' then DATAOUT <= (others => '0');
    elsif rising_edge(CLOCK) then
      if STANDBY = '1' then DATAOUT <= (others => 'X');
      elsif CHIPSELECT = '1' then
        a := adr(ADDRESS, 0, 13, bad);
        if WREN = '0' then
          if bad then DATAOUT <= (others => 'X'); else DATAOUT <= mem(a); end if;
        else
          if not bad then
            for n in 0 to 3 loop
              if MASKWREN(n) = '1' then mem(a)(4 * n + 3 downto 4 * n) := DATAIN(4 * n + 3 downto 4 * n); end if;
            end loop;
          end if;
          DATAOUT <= (others => 'X');
        end if;
      end if;
    end if;
  end process;
end silinx;`;

/** VHDL source of the iCE40's RAMs (joined to ice40-prims.js's ICE40_VHDL). */
export const ICE40_RAM_VHDL = [ram40(false, false), ram40(true, false), ram40(false, true), ram40(true, true), SPRAM].join('\n');
