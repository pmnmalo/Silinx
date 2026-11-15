--==============================================================================
-- Entity      : breadboard
-- Description : the digital circuit breadboard.circ.json
--               A press of BTN0 counts once on LD3..LD0, up to 15: a 74161 counter, its count enabled for one clock by the rising
--               edge of the button. A 74194 shift register synchronises the button with the clock (QA the button, QB QA a clock later,
--               QC QB a clock later, QD QC; LD4..LD7 show them), the edge QB and not QC, as QB and (QB xor QC), by a 7486 and a 7408;
--               their other gates stop the count at 15 (the 74161's RCO): edge and (edge xor RCO). SW0 low clears the counter and the
--               shift register.
-- Generator   : Silinx circuit editor (edit the circuit, not this file)
-- Parts       : U1 (SN74LS194), U2 (SN74LS08), U3 (SN74LS161), U4 (SN74LS86)
-- Inputs      : clk (CK1, '1' while high), btn[0] (B1, '1' while pressed), sw[0] (S1, '1' while on)
-- Outputs     : led[0] (D1, '1' while lit), led[1] (D2, '1' while lit), led[2] (D3, '1' while lit), led[3] (D4, '1' while lit), led[4] (D5, '1' while lit), led[5] (D6, '1' while lit), led[6] (D7, '1' while lit), led[7] (D8, '1' while lit)
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- SN74LS194: 4-bit bidirectional universal shift register (typical delay 20 ns)
entity breadboard_sn74ls194 is
  port (
    clr_n : in std_logic;
    sr : in std_logic;
    a : in std_logic;
    b : in std_logic;
    c : in std_logic;
    d : in std_logic;
    sl : in std_logic;
    gnd : in std_logic;
    s0 : in std_logic;
    s1 : in std_logic;
    clk : in std_logic;
    qd : out std_logic := 'X';
    qc : out std_logic := 'X';
    qb : out std_logic := 'X';
    qa : out std_logic := 'X';
    vcc : in std_logic
  );
end entity breadboard_sn74ls194;

architecture digital of breadboard_sn74ls194 is
  function anyx(v : std_logic_vector) return boolean is
  begin
    return false;
  end function anyx;
  signal o_qd, o_qc, o_qb, o_qa : std_logic;
  signal q : std_logic_vector(3 downto 0);
begin
  process (clk, clr_n)
  begin
    if clr_n = '0' then q <= "0000";
    elsif rising_edge(clk) then
      case std_logic_vector'(s1 & s0) is when "00" => null; when "01" => q <= q(2 downto 0) & sr; when "10" => q <= sl & q(3 downto 1); when "11" => q <= d & c & b & a; when others => q <= (others => 'X'); end case;
    end if;
  end process;
  o_qa <= q(0);
  o_qb <= q(1);
  o_qc <= q(2);
  o_qd <= q(3);
  qd <= o_qd and vcc and not gnd;
  qc <= o_qc and vcc and not gnd;
  qb <= o_qb and vcc and not gnd;
  qa <= o_qa and vcc and not gnd;
end architecture digital;

-- synthesis translate_off
architecture model of breadboard_sn74ls194 is
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
  signal i_clr_n, i_sr, i_a, i_b, i_c, i_d, i_sl, i_s0, i_s1, i_clk : std_logic := 'X';
  signal o_qd, o_qc, o_qb, o_qa : std_logic := 'X';
  signal q : std_logic_vector(3 downto 0) := (others => 'X');
  signal pw : boolean;
begin
  pw <= vcc = '1' and gnd = '0';
  i_clr_n <= rd(clr_n);
  i_sr <= rd(sr);
  i_a <= rd(a);
  i_b <= rd(b);
  i_c <= rd(c);
  i_d <= rd(d);
  i_sl <= rd(sl);
  i_s0 <= rd(s0);
  i_s1 <= rd(s1);
  i_clk <= rd(clk);
  -- silinx: ignore data-as-clock (the IC's pins read as the chip reads them)
  process (i_clk, i_clr_n)
  begin
    if i_clr_n = '0' then q <= "0000";
    elsif rising_edge(i_clk) then
      case std_logic_vector'(i_s1 & i_s0) is when "00" => null; when "01" => q <= q(2 downto 0) & i_sr; when "10" => q <= i_sl & q(3 downto 1); when "11" => q <= i_d & i_c & i_b & i_a; when others => q <= (others => 'X'); end case;
    end if;
  end process;
  o_qa <= q(0);
  o_qb <= q(1);
  o_qc <= q(2);
  o_qd <= q(3);
  qd <= o_qd after 20 ns when pw else 'Z' after 20 ns;
  qc <= o_qc after 20 ns when pw else 'Z' after 20 ns;
  qb <= o_qb after 20 ns when pw else 'Z' after 20 ns;
  qa <= o_qa after 20 ns when pw else 'Z' after 20 ns;
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
    sw : in std_logic_vector(0 downto 0);
    led : out std_logic_vector(7 downto 0)
  );
end entity breadboard;

architecture digital of breadboard is
  signal n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14, n15, n16, d_U1_qa, d_U1_qb, d_U1_qc, d_U1_qd, d_U3_qa, d_U3_qb, d_U3_qc, d_U3_qd, d_U3_rco : std_logic;
begin
  n1 <= d_U3_qa;
  n2 <= '0';
  n3 <= d_U3_qb;
  n4 <= d_U3_qc;
  n5 <= d_U3_qd;
  n6 <= d_U1_qa;
  n7 <= d_U1_qb;
  n8 <= d_U1_qc;
  n9 <= d_U1_qd;
  n10 <= n11 when btn(0) = '1' else '0';
  n11 <= '1';
  n12 <= (n13 and n14);
  n13 <= (n7 and n15);
  n14 <= (n13 xor n16);
  n15 <= (n7 xor n8);
  n16 <= d_U3_rco;
  d_U1 : entity work.breadboard_sn74ls194 port map (clr_n => sw(0), sr => n10, a => n2, b => n2, c => n2, d => n2, sl => n2, s0 => n11, s1 => n2, clk => clk, qd => d_U1_qd, qc => d_U1_qc, qb => d_U1_qb, qa => d_U1_qa, vcc => '1', gnd => '0');
  d_U3 : entity work.breadboard_sn74ls161 port map (clr_n => sw(0), clk => clk, a => n2, b => n2, c => n2, d => n2, enp => n12, load_n => n11, ent => n11, qd => d_U3_qd, qc => d_U3_qc, qb => d_U3_qb, qa => d_U3_qa, rco => d_U3_rco, vcc => '1', gnd => '0');
  led(0) <= n1 and not n2;
  led(1) <= n3 and not n2;
  led(2) <= n4 and not n2;
  led(3) <= n5 and not n2;
  led(4) <= n6 and not n2;
  led(5) <= n7 and not n2;
  led(6) <= n8 and not n2;
  led(7) <= n9 and not n2;
end architecture digital;

-- synthesis translate_off
architecture circuit of breadboard is
  signal n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13, n14, n15, n16, n17, n18, n5_d : std_logic := 'X';
begin
  n1 <= '1';   -- P1 +
  n2 <= '0';   -- P1 −
  n9 <= clk;   -- CK1
  n5_d <= n1 when btn(0) = '1' else 'Z';   -- B1 pressed
  n3 <= sw(0);   -- S1
  n5 <= '0' when n5_d = 'Z' else n5_d;   -- pulled down
  u_U1 : entity work.breadboard_sn74ls194 port map (clr_n => n3, sr => n5, a => n2, b => n2, c => n2, d => n2, sl => n2, gnd => n2, s0 => n1, s1 => n2, clk => n9, qd => n8, qc => n7, qb => n6, qa => n4, vcc => n1);
  u_U2 : entity work.breadboard_sn74ls08 port map (a1 => n6, b1 => n10, y1 => n11, a2 => n11, b2 => n12, y2 => n13, gnd => n2, y3 => open, a3 => 'Z', b3 => 'Z', y4 => open, a4 => 'Z', b4 => 'Z', vcc => n1);
  u_U3 : entity work.breadboard_sn74ls161 port map (clr_n => n3, clk => n9, a => n2, b => n2, c => n2, d => n2, enp => n13, gnd => n2, load_n => n1, ent => n1, qd => n18, qc => n17, qb => n16, qa => n15, rco => n14, vcc => n1);
  u_U4 : entity work.breadboard_sn74ls86 port map (a1 => n6, b1 => n7, y1 => n10, a2 => n11, b2 => n14, y2 => n12, gnd => n2, y3 => open, a3 => 'Z', b3 => 'Z', y4 => open, a4 => 'Z', b4 => 'Z', vcc => n1);
  led(0) <= '1' when to_x01(n15) = '1' and to_x01(n2) = '0' else '0';
  led(1) <= '1' when to_x01(n16) = '1' and to_x01(n2) = '0' else '0';
  led(2) <= '1' when to_x01(n17) = '1' and to_x01(n2) = '0' else '0';
  led(3) <= '1' when to_x01(n18) = '1' and to_x01(n2) = '0' else '0';
  led(4) <= '1' when to_x01(n4) = '1' and to_x01(n2) = '0' else '0';
  led(5) <= '1' when to_x01(n6) = '1' and to_x01(n2) = '0' else '0';
  led(6) <= '1' when to_x01(n7) = '1' and to_x01(n2) = '0' else '0';
  led(7) <= '1' when to_x01(n8) = '1' and to_x01(n2) = '0' else '0';
end architecture circuit;
-- synthesis translate_on
