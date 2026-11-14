--==============================================================================
-- Entity      : breadboard
-- Description : the digital circuit breadboard.circ.json
--               A press of BTN0 counts once on LD3..LD0: a 74161 counter, its count enabled for one clock by the rising edge of
--               the button, synchronised by a 74164 shift register (QA the button, QB QA a clock later) and detected as QA and
--               (QA xor QB) by a 7486 and a 7408. SW0 low clears the counter and the shift register. SW1 and SW2 into a half adder
--               (the 7486's and the 7408's other gates): LD4 their sum, LD5 their carry.
-- Generator   : Silinx circuit editor (edit the circuit, not this file)
-- Parts       : U1 (SN74LS164), U2 (SN74LS08), U3 (SN74LS161), U4 (SN74LS86)
-- Inputs      : clk (CK1, '1' while high), btn[0] (B1, '1' while pressed), sw[0] (S1, '1' while on), sw[1] (S2, '1' while on), sw[2] (S3, '1' while on)
-- Outputs     : led[0] (D1, '1' while lit), led[1] (D2, '1' while lit), led[2] (D3, '1' while lit), led[3] (D4, '1' while lit), led[4] (D5, '1' while lit), led[5] (D6, '1' while lit)
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- SN74LS164: 8-bit serial in, parallel out shift register (typical delay 20 ns)
entity breadboard_sn74ls164 is
  port (
    a : in std_logic;
    b : in std_logic;
    qa : out std_logic := 'X';
    qb : out std_logic := 'X';
    qc : out std_logic := 'X';
    qd : out std_logic := 'X';
    gnd : in std_logic;
    clk : in std_logic;
    clr_n : in std_logic;
    qe : out std_logic := 'X';
    qf : out std_logic := 'X';
    qg : out std_logic := 'X';
    qh : out std_logic := 'X';
    vcc : in std_logic
  );
end entity breadboard_sn74ls164;

architecture digital of breadboard_sn74ls164 is
  function anyx(v : std_logic_vector) return boolean is
  begin
    return false;
  end function anyx;
  signal o_qa, o_qb, o_qc, o_qd, o_qe, o_qf, o_qg, o_qh : std_logic;
  signal r : std_logic_vector(7 downto 0);
begin
  process (clk, clr_n)
  begin
    if clr_n = '0' then r <= (others => '0'); elsif rising_edge(clk) then r <= r(6 downto 0) & (a and b); end if;
  end process;
  o_qa <= r(0);
  o_qb <= r(1);
  o_qc <= r(2);
  o_qd <= r(3);
  o_qe <= r(4);
  o_qf <= r(5);
  o_qg <= r(6);
  o_qh <= r(7);
  qa <= o_qa and vcc and not gnd;
  qb <= o_qb and vcc and not gnd;
  qc <= o_qc and vcc and not gnd;
  qd <= o_qd and vcc and not gnd;
  qe <= o_qe and vcc and not gnd;
  qf <= o_qf and vcc and not gnd;
  qg <= o_qg and vcc and not gnd;
  qh <= o_qh and vcc and not gnd;
end architecture digital;

-- synthesis translate_off
architecture model of breadboard_sn74ls164 is
  -- a 74LS input reads a floating (Z) level high
  function rd(s : std_logic) return std_logic is
  begin
    case s is
      when '0' | 'L' => return '0';
      when '1' | 'H' | 'Z' => return '1';
      when others => return 'X';
    end case;
  end function rd;
  -- whether a level is unknown
  function anyx(v : std_logic_vector) return boolean is
  begin
    for k in v'range loop
      if v(k) /= '0' and v(k) /= '1' then return true; end if;
    end loop;
    return false;
  end function anyx;
  signal i_a, i_b, i_clk, i_clr_n : std_logic := 'X';
  signal o_qa, o_qb, o_qc, o_qd, o_qe, o_qf, o_qg, o_qh : std_logic := 'X';
  signal r : std_logic_vector(7 downto 0) := (others => 'X');
  signal pw : boolean;
begin
  pw <= vcc = '1' and gnd = '0';
  i_a <= rd(a);
  i_b <= rd(b);
  i_clk <= rd(clk);
  i_clr_n <= rd(clr_n);
  -- silinx: ignore data-as-clock (the IC's pins read as the chip reads them)
  process (i_clk, i_clr_n)
  begin
    if i_clr_n = '0' then r <= (others => '0'); elsif rising_edge(i_clk) then r <= r(6 downto 0) & (i_a and i_b); end if;
  end process;
  o_qa <= r(0);
  o_qb <= r(1);
  o_qc <= r(2);
  o_qd <= r(3);
  o_qe <= r(4);
  o_qf <= r(5);
  o_qg <= r(6);
  o_qh <= r(7);
  qa <= o_qa after 20 ns when pw else 'Z' after 20 ns;
  qb <= o_qb after 20 ns when pw else 'Z' after 20 ns;
  qc <= o_qc after 20 ns when pw else 'Z' after 20 ns;
  qd <= o_qd after 20 ns when pw else 'Z' after 20 ns;
  qe <= o_qe after 20 ns when pw else 'Z' after 20 ns;
  qf <= o_qf after 20 ns when pw else 'Z' after 20 ns;
  qg <= o_qg after 20 ns when pw else 'Z' after 20 ns;
  qh <= o_qh after 20 ns when pw else 'Z' after 20 ns;
end architecture model;
-- synthesis translate_on

-- synthesis translate_off
library ieee;
use ieee.std_logic_1164.all;

-- SN74LS08: quad 2-input and (typical delay 10 ns)
entity breadboard_sn74ls08 is
  port (
    a1 : in std_logic;
    b1 : in std_logic;
    y1 : out std_logic := 'X';
    a2 : in std_logic;
    b2 : in std_logic;
    y2 : out std_logic := 'X';
    gnd : in std_logic;
    y3 : out std_logic := 'X';
    a3 : in std_logic;
    b3 : in std_logic;
    y4 : out std_logic := 'X';
    a4 : in std_logic;
    b4 : in std_logic;
    vcc : in std_logic
  );
end entity breadboard_sn74ls08;

architecture model of breadboard_sn74ls08 is
  -- a 74LS input reads a floating (Z) level high
  function rd(s : std_logic) return std_logic is
  begin
    case s is
      when '0' | 'L' => return '0';
      when '1' | 'H' | 'Z' => return '1';
      when others => return 'X';
    end case;
  end function rd;
  signal pw : boolean;
begin
  pw <= vcc = '1' and gnd = '0';
  y1 <= (rd(a1) and rd(b1)) after 10 ns when pw else 'Z' after 10 ns;
  y2 <= (rd(a2) and rd(b2)) after 10 ns when pw else 'Z' after 10 ns;
  y3 <= (rd(a3) and rd(b3)) after 10 ns when pw else 'Z' after 10 ns;
  y4 <= (rd(a4) and rd(b4)) after 10 ns when pw else 'Z' after 10 ns;
end architecture model;
-- synthesis translate_on

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- SN74LS161: synchronous 4-bit binary counter, asynchronous clear (typical delay 20 ns)
entity breadboard_sn74ls161 is
  port (
    clr_n : in std_logic;
    clk : in std_logic;
    a : in std_logic;
    b : in std_logic;
    c : in std_logic;
    d : in std_logic;
    enp : in std_logic;
    gnd : in std_logic;
    load_n : in std_logic;
    ent : in std_logic;
    qd : out std_logic := 'X';
    qc : out std_logic := 'X';
    qb : out std_logic := 'X';
    qa : out std_logic := 'X';
    rco : out std_logic := 'X';
    vcc : in std_logic
  );
end entity breadboard_sn74ls161;

architecture digital of breadboard_sn74ls161 is
  function anyx(v : std_logic_vector) return boolean is
  begin
    return false;
  end function anyx;
  signal o_qd, o_qc, o_qb, o_qa, o_rco : std_logic;
  signal q : std_logic_vector(3 downto 0);
begin
  process (clk, clr_n)
  begin
    if clr_n = '0' then q <= "0000";
    elsif rising_edge(clk) then
      if load_n = '0' then q <= d & c & b & a;
      elsif (enp and ent) = '1' then if anyx(q) then q <= (others => 'X'); else q <= std_logic_vector(unsigned(q) + 1); end if;
      elsif (enp and ent) /= '0' then q <= (others => 'X');
      end if;
    end if;
  end process;
  o_qa <= q(0);
  o_qb <= q(1);
  o_qc <= q(2);
  o_qd <= q(3);
  o_rco <= ent and q(0) and q(1) and q(2) and q(3);
  qd <= o_qd and vcc and not gnd;
  qc <= o_qc and vcc and not gnd;
  qb <= o_qb and vcc and not gnd;
  qa <= o_qa and vcc and not gnd;
  rco <= o_rco and vcc and not gnd;
end architecture digital;

-- synthesis translate_off
architecture model of breadboard_sn74ls161 is
  -- a 74LS input reads a floating (Z) level high
  function rd(s : std_logic) return std_logic is
  begin
    case s is
      when '0' | 'L' => return '0';
      when '1' | 'H' | 'Z' => return '1';
      when others => return 'X';
    end case;
  end function rd;
  -- whether a level is unknown
  function anyx(v : std_logic_vector) return boolean is
  begin
    for k in v'range loop
      if v(k) /= '0' and v(k) /= '1' then return true; end if;
    end loop;
    return false;
  end function anyx;
  signal i_clr_n, i_clk, i_a, i_b, i_c, i_d, i_enp, i_load_n, i_ent : std_logic := 'X';
  signal o_qd, o_qc, o_qb, o_qa, o_rco : std_logic := 'X';
  signal q : std_logic_vector(3 downto 0) := (others => 'X');
  signal pw : boolean;
begin
  pw <= vcc = '1' and gnd = '0';
  i_clr_n <= rd(clr_n);
  i_clk <= rd(clk);
  i_a <= rd(a);
  i_b <= rd(b);
  i_c <= rd(c);
  i_d <= rd(d);
  i_enp <= rd(enp);
  i_load_n <= rd(load_n);
  i_ent <= rd(ent);
  -- silinx: ignore data-as-clock (the IC's pins read as the chip reads them)
  process (i_clk, i_clr_n)
  begin
    if i_clr_n = '0' then q <= "0000";
    elsif rising_edge(i_clk) then
      if i_load_n = '0' then q <= i_d & i_c & i_b & i_a;
      elsif (i_enp and i_ent) = '1' then if anyx(q) then q <= (others => 'X'); else q <= std_logic_vector(unsigned(q) + 1); end if;
      elsif (i_enp and i_ent) /= '0' then q <= (others => 'X');
      end if;
    end if;
  end process;
  o_qa <= q(0);
  o_qb <= q(1);
  o_qc <= q(2);
  o_qd <= q(3);
  o_rco <= i_ent and q(0) and q(1) and q(2) and q(3);
  qd <= o_qd after 20 ns when pw else 'Z' after 20 ns;
  qc <= o_qc after 20 ns when pw else 'Z' after 20 ns;
  qb <= o_qb after 20 ns when pw else 'Z' after 20 ns;
  qa <= o_qa after 20 ns when pw else 'Z' after 20 ns;
  rco <= o_rco after 20 ns when pw else 'Z' after 20 ns;
end architecture model;
-- synthesis translate_on

-- synthesis translate_off
library ieee;
use ieee.std_logic_1164.all;

-- SN74LS86: quad 2-input xor (typical delay 12 ns)
entity breadboard_sn74ls86 is
  port (
    a1 : in std_logic;
    b1 : in std_logic;
    y1 : out std_logic := 'X';
    a2 : in std_logic;
    b2 : in std_logic;
    y2 : out std_logic := 'X';
    gnd : in std_logic;
    y3 : out std_logic := 'X';
    a3 : in std_logic;
    b3 : in std_logic;
    y4 : out std_logic := 'X';
    a4 : in std_logic;
    b4 : in std_logic;
    vcc : in std_logic
  );
end entity breadboard_sn74ls86;

architecture model of breadboard_sn74ls86 is
  -- a 74LS input reads a floating (Z) level high
  function rd(s : std_logic) return std_logic is
  begin
    case s is
      when '0' | 'L' => return '0';
      when '1' | 'H' | 'Z' => return '1';
      when others => return 'X';
    end case;
  end function rd;
  signal pw : boolean;
begin
  pw <= vcc = '1' and gnd = '0';
  y1 <= (rd(a1) xor rd(b1)) after 12 ns when pw else 'Z' after 12 ns;
  y2 <= (rd(a2) xor rd(b2)) after 12 ns when pw else 'Z' after 12 ns;
  y3 <= (rd(a3) xor rd(b3)) after 12 ns when pw else 'Z' after 12 ns;
  y4 <= (rd(a4) xor rd(b4)) after 12 ns when pw else 'Z' after 12 ns;
end architecture model;
-- synthesis translate_on

library ieee;
use ieee.std_logic_1164.all;

entity breadboard is
  port (
    clk : in std_logic;
    btn : in std_logic_vector(0 downto 0);
    sw : in std_logic_vector(2 downto 0);
    led : out std_logic_vector(5 downto 0)
  );
end entity breadboard;

architecture digital of breadboard is
  signal n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, d_U1_qa, d_U1_qb, d_U3_qa, d_U3_qb, d_U3_qc, d_U3_qd : std_logic;
begin
  n1 <= d_U3_qa;
  n2 <= '0';
  n3 <= d_U3_qb;
  n4 <= d_U3_qc;
  n5 <= d_U3_qd;
  n6 <= (sw(1) xor sw(2));
  n7 <= (sw(1) and sw(2));
  n8 <= n9 when btn(0) = '1' else '0';
  n9 <= '1';
  n10 <= (n11 and n12);
  n11 <= d_U1_qa;
  n12 <= (n11 xor n13);
  n13 <= d_U1_qb;
  d_U1 : entity work.breadboard_sn74ls164 port map (a => n8, b => n9, clk => clk, clr_n => sw(0), qa => d_U1_qa, qb => d_U1_qb, qc => open, qd => open, qe => open, qf => open, qg => open, qh => open, vcc => '1', gnd => '0');
  d_U3 : entity work.breadboard_sn74ls161 port map (clr_n => sw(0), clk => clk, a => n2, b => n2, c => n2, d => n2, enp => n10, load_n => n9, ent => n9, qd => d_U3_qd, qc => d_U3_qc, qb => d_U3_qb, qa => d_U3_qa, rco => open, vcc => '1', gnd => '0');
  led(0) <= n1 and not n2;
  led(1) <= n3 and not n2;
  led(2) <= n4 and not n2;
  led(3) <= n5 and not n2;
  led(4) <= n6 and not n2;
  led(5) <= n7 and not n2;
end architecture digital;

-- synthesis translate_off
architecture circuit of breadboard is
  signal n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14, n15, n16, n17, n3_d : std_logic := 'X';
begin
  n1 <= '1';   -- P1 +
  n2 <= '0';   -- P1 −
  n7 <= clk;   -- CK1
  n3_d <= n1 when btn(0) = '1' else 'Z';   -- B1 pressed
  n6 <= sw(0);   -- S1
  n10 <= sw(1);   -- S2
  n11 <= sw(2);   -- S3
  n3 <= '0' when n3_d = 'Z' else n3_d;   -- pulled down
  u_U1 : entity work.breadboard_sn74ls164 port map (a => n3, b => n1, qa => n4, qb => n5, qc => open, qd => open, gnd => n2, clk => n7, clr_n => n6, qe => open, qf => open, qg => open, qh => open, vcc => n1);
  u_U2 : entity work.breadboard_sn74ls08 port map (a1 => n4, b1 => n8, y1 => n9, a2 => n10, b2 => n11, y2 => n12, gnd => n2, y3 => open, a3 => 'Z', b3 => 'Z', y4 => open, a4 => 'Z', b4 => 'Z', vcc => n1);
  u_U3 : entity work.breadboard_sn74ls161 port map (clr_n => n6, clk => n7, a => n2, b => n2, c => n2, d => n2, enp => n9, gnd => n2, load_n => n1, ent => n1, qd => n16, qc => n15, qb => n14, qa => n13, rco => open, vcc => n1);
  u_U4 : entity work.breadboard_sn74ls86 port map (a1 => n10, b1 => n11, y1 => n17, a2 => n4, b2 => n5, y2 => n8, gnd => n2, y3 => open, a3 => 'Z', b3 => 'Z', y4 => open, a4 => 'Z', b4 => 'Z', vcc => n1);
  led(0) <= '1' when to_x01(n13) = '1' and to_x01(n2) = '0' else '0';
  led(1) <= '1' when to_x01(n14) = '1' and to_x01(n2) = '0' else '0';
  led(2) <= '1' when to_x01(n15) = '1' and to_x01(n2) = '0' else '0';
  led(3) <= '1' when to_x01(n16) = '1' and to_x01(n2) = '0' else '0';
  led(4) <= '1' when to_x01(n17) = '1' and to_x01(n2) = '0' else '0';
  led(5) <= '1' when to_x01(n12) = '1' and to_x01(n2) = '0' else '0';
end architecture circuit;
-- synthesis translate_on
