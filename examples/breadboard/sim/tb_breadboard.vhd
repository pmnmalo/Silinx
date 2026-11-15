----------------------------------------------------------------------------------
-- Test bench for breadboard: a digital circuit of 74LS chips on a breadboard
-- (src/breadboard.circ.json, its VHDL src/breadboard.vhd generated from it).
--
-- The simulation runs the circuit's own model (its architecture "circuit": each
-- chip with its gate delays); synthesis builds its digital model (the
-- architecture "digital"). On the board:
--   BTN0 pressed once: the 74161 counts once, its count on LD3..LD0, up to 15
--   (a 74194 shift register synchronises the button with the clock: QA the
--   button, QB QA a clock later, QC QB, QD QC, on LD4..LD7; a 7486 and a 7408
--   detect its rising edge, QB and (QB xor QC), and stop the count at 15, the
--   74161's RCO: edge and (edge xor RCO));
--   SW0 low clears the counter and the shift register.
--
-- The test clears the circuit, presses the button three times (the count 1, 2,
-- 3; LD4..LD7 lit while it is held, dark once released), then 13 times more
-- (15) and once again (still 15), then clears it. Each mismatch is reported as
-- an ERROR; when all of them pass: "Simulation finished OK".
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;
USE ieee.numeric_std.ALL;

ENTITY tb_breadboard IS
END tb_breadboard;

ARCHITECTURE behavior OF tb_breadboard IS
   signal clk : std_logic := '0';
   signal btn : std_logic_vector(0 downto 0) := "0";
   signal sw  : std_logic_vector(0 downto 0) := "0";
   signal led : std_logic_vector(7 downto 0);
   signal done : boolean := false;
   constant PERIOD : time := 100 ns;   -- 10 MHz: well within the 74LS chips' delays
BEGIN
   uut: entity work.breadboard
      port map ( clk => clk, btn => btn, sw => sw, led => led );

   clk <= not clk after PERIOD / 2 when not done else '0';

   stim_proc: process
      variable errors : integer := 0;
      procedure expect(what : string; got, want : std_logic_vector) is
      begin
         if got /= want then
            report "ERROR: " & what & " is " & integer'image(to_integer(unsigned(got)))
                 & ", expected " & integer'image(to_integer(unsigned(want))) severity error;
            errors := errors + 1;
         end if;
      end procedure;
   begin
      sw(0) <= '0';                                     -- cleared
      wait for 4 * PERIOD;
      sw(0) <= '1';
      wait for 4 * PERIOD;
      expect("the count (LD3..LD0) once cleared", led(3 downto 0), "0000");
      for n in 1 to 16 loop
         btn(0) <= '1';                                 -- pressed for a few clocks: one count
         wait for 5 * PERIOD;
         if n <= 3 then
            expect("the shift register (LD7..LD4) while pressed", led(7 downto 4), "1111");
         end if;
         btn(0) <= '0';
         wait for 5 * PERIOD;
         if n <= 3 then
            expect("the shift register (LD7..LD4) once released", led(7 downto 4), "0000");
         end if;
         if n <= 3 then
            expect("the count (LD3..LD0) after press " & integer'image(n), led(3 downto 0), std_logic_vector(to_unsigned(n, 4)));
         elsif n >= 15 then                             -- (the 16th press: the count stays at 15)
            expect("the count (LD3..LD0) after press " & integer'image(n), led(3 downto 0), "1111");
         end if;
      end loop;
      sw(0) <= '0';                                     -- cleared again
      wait for 2 * PERIOD;
      expect("the count (LD3..LD0) cleared again", led(3 downto 0), "0000");
      if errors = 0 then
         report "Simulation finished OK" severity note;
      else
         report "ERROR: " & integer'image(errors) & " wrong output(s)" severity error;
      end if;
      done <= true;
      wait;
   end process;
END;
