----------------------------------------------------------------------------------
-- Test bench for top: the combination lock, with a fast second (TICK = 16 clock cycles), a fast display
-- (REFRESH = 1: one digit per clock cycle) and fast buttons (STABLE = 2 clock cycles).
--   1. after reset: closed, the display blank, the LEDs LD7..LD4 the digit on the switches
--   2. the code 2 0 2 6: each digit shown as it is typed, the lock open after the fourth (LD0); Clear closes it
--   3. a wrong digit: locked out (LD2) for 3 s, the display counting the seconds left down to 1, then the lock waits
--      for the code again; a second wrong digit: 6 s
--   4. the code right: open, the failures forgiven; after Clear a wrong digit is 3 seconds again
--   5. three wrong digits: the alarm (LD1), the display blank, kept until reset (BTN2)
-- Each wrong value is reported as an ERROR; when all of them pass: "Simulation finished OK".
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;
USE ieee.numeric_std.ALL;

ENTITY tb_lock IS
END tb_lock;

ARCHITECTURE behavior OF tb_lock IS
   constant T          : integer := 16;              -- clock cycles per second (TICK)
   constant clk_period : time := 20 ns;
   signal clk : std_logic := '0';
   signal sw  : std_logic_vector(3 downto 0) := "0000";
   signal btn : std_logic_vector(2 downto 0) := "100";  -- BTN2: reset
   signal led : std_logic_vector(7 downto 0);
   signal seg : std_logic_vector(6 downto 0);
   signal dp  : std_logic;
   signal an  : std_logic_vector(3 downto 0);
   signal done_sim : boolean := false;
   constant BLANK : integer := 15;
   -- the segments (gfedcba, active low) of the digits 0..9
   type seg_table is array (0 to 9) of std_logic_vector(6 downto 0);
   constant DIGIT : seg_table := ("1000000", "1111001", "0100100", "0110000", "0011001",
                                  "0010010", "0000010", "1111000", "0000000", "0010000");
   type digits_t is array (3 downto 0) of integer;   -- the display's digits, 3 the left one

   function bits(v : std_logic_vector) return string is
      variable s : string(1 to v'length);
      variable k : integer := 1;
   begin
      for i in v'range loop
         if v(i) = '1' then s(k) := '1'; elsif v(i) = '0' then s(k) := '0'; else s(k) := 'X'; end if;
         k := k + 1;
      end loop;
      return s;
   end function;
BEGIN
   uut: entity work.top
      generic map ( TICK => T, REFRESH => 1, STABLE => 2 )
      port map ( clk => clk, sw => sw, btn => btn, led => led, seg => seg, dp => dp, an => an );

   clk_process : process
   begin
      clk <= '0'; wait for clk_period/2;
      clk <= '1'; wait for clk_period/2;
      if done_sim then wait; end if;
   end process;

   stim_proc: process
      variable errors : integer := 0;
      procedure fail_with(msg : string) is
      begin
         if errors < 20 then report "ERROR: " & msg severity error; end if;
         errors := errors + 1;
      end procedure;
      procedure cycles(n : integer) is
      begin
         for i in 1 to n loop wait until falling_edge(clk); end loop;
      end procedure;
      -- the LEDs LD0..LD2: open, alarm, locked; LD7..LD4 the digit
      procedure check_leds(open_l, alarm_l, locked_l : std_logic; what : string) is
         variable want : std_logic_vector(7 downto 0);
      begin
         want := sw & '0' & locked_l & alarm_l & open_l;
         if led /= want then fail_with(what & ": the LEDs are " & bits(led) & ", expected " & bits(want)); end if;
      end procedure;
      -- the four digits of the display (one each clock cycle: REFRESH = 1), the decimal points off; each read at a
      -- rising edge, a whole cycle after the edge that changed it (the post-place & route model's clock to pad)
      procedure check_display(d : digits_t; what : string) is
         variable shown : std_logic_vector(6 downto 0);
         variable k : integer;
      begin
         for i in 1 to 4 loop
            wait until rising_edge(clk);
            case an is
               when "1110" => k := 0;
               when "1101" => k := 1;
               when "1011" => k := 2;
               when "0111" => k := 3;
               when others => k := -1;
            end case;
            if k < 0 then
               fail_with(what & ": the digit enables are " & bits(an));
            else
               shown := "1111111";
               if d(k) /= BLANK then shown := DIGIT(d(k)); end if;
               if seg /= shown or dp /= '1' then
                  fail_with(what & ": digit " & integer'image(k) & " shows " & bits(seg) & ", expected " & bits(shown));
               end if;
            end if;
         end loop;
      end procedure;
      -- a button pressed (longer than STABLE) and released; the lock's answer settled
      procedure press(b : integer) is
      begin
         btn(b) <= '1'; cycles(6);
         btn(b) <= '0'; cycles(6);
      end procedure;
      procedure type_digit(n : integer) is
      begin
         sw <= std_logic_vector(to_unsigned(n, 4)); cycles(3);
         press(0);
      end procedure;
      -- a lock-out of secs seconds from the failure (its first second a part of one: the count starts at once and goes
      -- on at each second's tick): locked (LD2), the display counting the seconds left down to 1, then the lock waits
      -- for the code again
      procedure lockout(secs : integer; what : string) is
         variable n, most, last, shown : integer := 0;
      begin
         check_leds('0', '0', '1', what & ", locked");
         while led(2) = '1' and n < (secs + 2) * T loop
            wait until rising_edge(clk);   -- (read as check_display does: the lock's state of the cycle before)
            if an = "1110" and led(2) = '1' then
               shown := -1;
               for k in 0 to 9 loop if seg = DIGIT(k) then shown := k; end if; end loop;
               if shown < 0 then fail_with(what & ": the seconds left show " & bits(seg)); end if;
               if shown > most then most := shown; end if;
               last := shown;
            end if;
            n := n + 1;
         end loop;
         if led(2) = '1' then fail_with(what & ": still locked after " & integer'image(secs + 2) & " s"); end if;
         -- (the failure was a few clock cycles before: the press's release, then type_digit's settling)
         if n < (secs - 1) * T - 16 or n > secs * T then
            fail_with(what & ": unlocked after " & integer'image(n) & " clock cycles, " & integer'image(secs) & " s expected");
         end if;
         if most /= secs and most /= secs - 1 then fail_with(what & ": the count down from " & integer'image(most)); end if;
         if last /= 1 then fail_with(what & ": the count down to " & integer'image(last)); end if;
      end procedure;
   begin
      cycles(4);
      btn(2) <= '0'; cycles(4);
      -- 1. closed, blank, the switches' digit on LD7..LD4 (two clock cycles later: the 74175, then the LED)
      sw <= "0101"; cycles(3);
      check_leds('0', '0', '0', "after reset");
      check_display((BLANK, BLANK, BLANK, BLANK), "after reset");

      -- 2. the code
      type_digit(2); check_display((BLANK, BLANK, BLANK, 2), "2 typed");  check_leds('0', '0', '0', "2 typed");
      type_digit(0); check_display((BLANK, BLANK, 2, 0), "2 0 typed");    check_leds('0', '0', '0', "2 0 typed");
      type_digit(2); check_display((BLANK, 2, 0, 2), "2 0 2 typed");      check_leds('0', '0', '0', "2 0 2 typed");
      type_digit(6); check_display((2, 0, 2, 6), "the code typed");       check_leds('1', '0', '0', "the code typed: open");
      press(1);      check_display((BLANK, BLANK, BLANK, BLANK), "Clear"); check_leds('0', '0', '0', "Clear: closed");

      -- 3. a wrong digit: 3 s; then a right one and a wrong one: 6 s
      type_digit(5); lockout(3, "the first failure");
      check_display((BLANK, BLANK, BLANK, 5), "after the first failure");
      type_digit(2); type_digit(1); lockout(6, "the second failure");

      -- 4. the code right: open, the failures forgiven; a wrong digit after Clear: 3 s again
      type_digit(2); type_digit(0); type_digit(2); type_digit(6); check_leds('1', '0', '0', "the code again: open");
      press(1); check_leds('0', '0', '0', "Clear again");
      type_digit(9); lockout(3, "a failure after the code");

      -- 5. two more failures: 6 s, then the alarm
      type_digit(1); lockout(6, "the second failure again");
      type_digit(7); cycles(T);
      check_leds('0', '1', '1', "the third failure: the alarm");
      check_display((BLANK, BLANK, BLANK, BLANK), "the alarm");
      type_digit(2); press(1); cycles(4 * T);
      check_leds('0', '1', '1', "the alarm kept");
      btn(2) <= '1'; cycles(4);
      btn(2) <= '0'; cycles(4);
      check_leds('0', '0', '0', "reset: the alarm off");
      check_display((BLANK, BLANK, BLANK, BLANK), "reset");

      if errors = 0 then
         report "Simulation finished OK" severity note;
      else
         report "Simulation finished with " & integer'image(errors) & " error(s)" severity error;
      end if;
      done_sim <= true;
      wait;
   end process;
END;
