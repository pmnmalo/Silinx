--==============================================================================
-- Entity      : sync
-- Description : the digital circuit sync.circ.json
--               The digit's four switches synchronised to the clock: a 74175, four D flip-flops on one clock (CLK the board's), its CLR̅ high (on +). Each switch can change at any time; the flip-flops give the rest of the lock a digit that changes only on a clock edge.
-- Generator   : Silinx circuit editor (edit the circuit, not this file)
-- Parts       : U1 (SN74LS175)
-- Inputs      : clk (CK1, '1' while high), d[0] (S1, '1' while on), d[1] (S2, '1' while on), d[2] (S3, '1' while on), d[3] (S4, '1' while on)
-- Outputs     : q[0] (D1, '1' while lit), q[1] (D2, '1' while lit), q[2] (D3, '1' while lit), q[3] (D4, '1' while lit)
--==============================================================================

-- SN74LS175's model (Silinx's, written in VHDL)
library ieee;
use ieee.std_logic_1164.all;

entity sync_sn74ls175_core is
  port (
    clr_n, d1, d2, clk, d3, d4 : in std_logic;
    q1, q1_n, q2_n, q2, q3, q3_n, q4_n, q4 : out std_logic
  );
end entity sync_sn74ls175_core;

architecture rtl of sync_sn74ls175_core is
  signal st0, st1, st2, st3 : std_logic := 'X';
begin
  -- silinx: ignore data-as-clock
  process (clk, clr_n)
  begin
    if clr_n = '0' then st0 <= '0';
    elsif rising_edge(clk) then
      st0 <= d1;
    end if;
  end process;
  q1 <= st0;
  q1_n <= not st0;
  -- silinx: ignore data-as-clock
  process (clk, clr_n)
  begin
    if clr_n = '0' then st1 <= '0';
    elsif rising_edge(clk) then
      st1 <= d2;
    end if;
  end process;
  q2 <= st1;
  q2_n <= not st1;
  -- silinx: ignore data-as-clock
  process (clk, clr_n)
  begin
    if clr_n = '0' then st2 <= '0';
    elsif rising_edge(clk) then
      st2 <= d3;
    end if;
  end process;
  q3 <= st2;
  q3_n <= not st2;
  -- silinx: ignore data-as-clock
  process (clk, clr_n)
  begin
    if clr_n = '0' then st3 <= '0';
    elsif rising_edge(clk) then
      st3 <= d4;
    end if;
  end process;
  q4 <= st3;
  q4_n <= not st3;
end architecture rtl;

library ieee;
use ieee.std_logic_1164.all;

-- SN74LS175: quad d flip-flop, clear, q and q̅ (rising edge) (typical delay 20 ns)
entity sync_sn74ls175 is
  port (
    clr_n : in std_logic;
    q1 : out std_logic := 'X';
    q1_n : out std_logic := 'X';
    d1 : in std_logic;
    d2 : in std_logic;
    q2_n : out std_logic := 'X';
    q2 : out std_logic := 'X';
    gnd : in std_logic;
    clk : in std_logic;
    q3 : out std_logic := 'X';
    q3_n : out std_logic := 'X';
    d3 : in std_logic;
    d4 : in std_logic;
    q4_n : out std_logic := 'X';
    q4 : out std_logic := 'X';
    vcc : in std_logic
  );
end entity sync_sn74ls175;

architecture digital of sync_sn74ls175 is
  signal o_q1, o_q1_n, o_q2_n, o_q2, o_q3, o_q3_n, o_q4_n, o_q4 : std_logic;
begin
  u_core : entity work.sync_sn74ls175_core port map (clr_n => clr_n, d1 => d1, d2 => d2, clk => clk, d3 => d3, d4 => d4, q1 => o_q1, q1_n => o_q1_n, q2_n => o_q2_n, q2 => o_q2, q3 => o_q3, q3_n => o_q3_n, q4_n => o_q4_n, q4 => o_q4);
  q1 <= o_q1 and vcc and not gnd;
  q1_n <= o_q1_n and vcc and not gnd;
  q2_n <= o_q2_n and vcc and not gnd;
  q2 <= o_q2 and vcc and not gnd;
  q3 <= o_q3 and vcc and not gnd;
  q3_n <= o_q3_n and vcc and not gnd;
  q4_n <= o_q4_n and vcc and not gnd;
  q4 <= o_q4 and vcc and not gnd;
end architecture digital;

-- synthesis translate_off
architecture model of sync_sn74ls175 is
  -- a 74LS input reads a floating (Z) level high
  function rd(s : std_logic) return std_logic is
  begin
    case s is
      when '0' | 'L' => return '0';
      when '1' | 'H' | 'Z' => return '1';
      when others => return 'X';
    end case;
  end function rd;
  signal i_clr_n, i_d1, i_d2, i_clk, i_d3, i_d4 : std_logic := 'X';
  signal o_q1, o_q1_n, o_q2_n, o_q2, o_q3, o_q3_n, o_q4_n, o_q4 : std_logic;
  signal pw : boolean;
begin
  pw <= vcc = '1' and gnd = '0';
  i_clr_n <= rd(clr_n);
  i_d1 <= rd(d1);
  i_d2 <= rd(d2);
  i_clk <= rd(clk);
  i_d3 <= rd(d3);
  i_d4 <= rd(d4);
  u_core : entity work.sync_sn74ls175_core port map (clr_n => i_clr_n, d1 => i_d1, d2 => i_d2, clk => i_clk, d3 => i_d3, d4 => i_d4, q1 => o_q1, q1_n => o_q1_n, q2_n => o_q2_n, q2 => o_q2, q3 => o_q3, q3_n => o_q3_n, q4_n => o_q4_n, q4 => o_q4);
  q1 <= o_q1 after 20 ns when pw else 'Z' after 20 ns;
  q1_n <= o_q1_n after 20 ns when pw else 'Z' after 20 ns;
  q2_n <= o_q2_n after 20 ns when pw else 'Z' after 20 ns;
  q2 <= o_q2 after 20 ns when pw else 'Z' after 20 ns;
  q3 <= o_q3 after 20 ns when pw else 'Z' after 20 ns;
  q3_n <= o_q3_n after 20 ns when pw else 'Z' after 20 ns;
  q4_n <= o_q4_n after 20 ns when pw else 'Z' after 20 ns;
  q4 <= o_q4 after 20 ns when pw else 'Z' after 20 ns;
end architecture model;
-- synthesis translate_on

library ieee;
use ieee.std_logic_1164.all;

entity sync is
  port (
    clk : in std_logic;
    d : in std_logic_vector(3 downto 0);
    q : out std_logic_vector(3 downto 0)
  );
end entity sync;

architecture digital of sync is
  signal n1, n2, n3, n4, n5, n6, d_U1_q1, d_U1_q2, d_U1_q3, d_U1_q4 : std_logic;
begin
  n1 <= d_U1_q1;
  n2 <= '0';
  n3 <= d_U1_q2;
  n4 <= d_U1_q3;
  n5 <= d_U1_q4;
  n6 <= '1';
  d_U1 : entity work.sync_sn74ls175 port map (clr_n => n6, d1 => d(0), d2 => d(1), clk => clk, d3 => d(2), d4 => d(3), q1 => d_U1_q1, q1_n => open, q2_n => open, q2 => d_U1_q2, q3 => d_U1_q3, q3_n => open, q4_n => open, q4 => d_U1_q4, vcc => '1', gnd => '0');
  q(0) <= n1 and not n2;
  q(1) <= n3 and not n2;
  q(2) <= n4 and not n2;
  q(3) <= n5 and not n2;
end architecture digital;

-- synthesis translate_off
architecture circuit of sync is
  signal n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11 : std_logic := 'X';
begin
  n1 <= '1';   -- P1 +
  n2 <= '0';   -- P1 −
  n3 <= clk;   -- CK1
  n4 <= d(0);   -- S1
  n5 <= d(1);   -- S2
  n6 <= d(2);   -- S3
  n7 <= d(3);   -- S4
  u_U1 : entity work.sync_sn74ls175 port map (clr_n => n1, q1 => n9, q1_n => open, d1 => n4, d2 => n5, q2_n => open, q2 => n11, gnd => n2, clk => n3, q3 => n10, q3_n => open, d3 => n6, d4 => n7, q4_n => open, q4 => n8, vcc => n1);
  q(0) <= '1' when to_x01(n9) = '1' and to_x01(n2) = '0' else '0';
  q(1) <= '1' when to_x01(n11) = '1' and to_x01(n2) = '0' else '0';
  q(2) <= '1' when to_x01(n10) = '1' and to_x01(n2) = '0' else '0';
  q(3) <= '1' when to_x01(n8) = '1' and to_x01(n2) = '0' else '0';
end architecture circuit;
-- synthesis translate_on
