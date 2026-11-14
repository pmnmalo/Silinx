----------------------------------------------------------------------------------
-- Test bench for breadboard: a digital circuit of 74LS chips on a breadboard
-- (src/breadboard.circ.json, its VHDL src/breadboard.vhd generated from it).
--
-- The simulation runs the circuit's own model (its architecture "circuit": each
-- chip with its gate delays); synthesis builds its digital model (the
-- architecture "digital"). On the board:
--   BTN0 pressed once: the 74161 counts once, its count on LD3..LD0 (a 74164
--   synchronises the button with the clock: QA the button, QB QA a clock
--   later; a 7486 and a 7408 detect its rising edge: QA and (QA xor QB));
--   SW0 low clears the counter and the shift register;
--   SW1 and SW2 into a half adder: LD4 their sum (the 7486's other gate), LD5
--   their carry (the 7408's).
--
-- The test clears the circuit, presses the button three times (the count 1, 2,
-- 3), then tries the half adder's four inputs. Each mismatch is reported as an
-- ERROR; when all of them pass: "Simulation finished OK".
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;
USE ieee.numeric_std.ALL;

ENTITY tb_breadboard IS
END tb_breadboard;

ARCHITECTURE behavior OF tb_breadboard IS
   signal clk : std_logic := '0';
   signal btn : std_logic_vector(0 downto 0) := "0";
   signal sw  : std_logic_vector(2 downto 0) := "000";
   signal led : std_logic_vector(5 downto 0);
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
      for n in 1 to 3 loop
         btn(0) <= '1';                                 -- pressed for a few clocks: one count
         wait for 5 * PERIOD;
         btn(0) <= '0';
         wait for 5 * PERIOD;
         expect("the count (LD3..LD0) after press " & integer'image(n), led(3 downto 0), std_logic_vector(to_unsigned(n, 4)));
      end loop;
      for ab in 0 to 3 loop                             -- the half adder: SW2 SW1 = ab
         sw(2 downto 1) <= std_logic_vector(to_unsigned(ab, 2));
         wait for PERIOD;
         expect("the half adder (LD5 LD4) for " & integer'image(ab), led(5 downto 4),
                std_logic_vector(to_unsigned((ab / 2) + (ab mod 2), 2)));
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
