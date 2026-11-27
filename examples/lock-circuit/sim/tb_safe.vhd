-- tb_safe: the lock-circuit example's test bench (Circuit mode: no board).
--   1. after reset: closed, not locked, no alarm
--   2. the code 2 0 2 6: open after its fourth digit; Clear closes it
--   3. a wrong digit: locked out for 3 seconds, the seconds left counting down 3, 2, 1, then open to a digit again
--   4. a second wrong digit: locked out again; a third: the alarm, kept until reset
-- Each check is an assertion; the last line says they all passed.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_safe is
end entity tb_safe;

architecture sim of tb_safe is
    signal clk, rst, enter, clear, tick : std_logic := '0';
    signal sw : std_logic_vector(3 downto 0) := "0000";
    signal opened, locked, alarm : std_logic;
    signal fails : std_logic_vector(1 downto 0);
    signal left : std_logic_vector(3 downto 0);
    signal done : boolean := false;
    constant T : time := 10 ns;
begin
    dut : entity work.safe port map ( clk => clk, rst => rst, sw => sw, enter => enter, clear => clear, tick => tick,
                                      opened => opened, locked => locked, alarm => alarm, fails => fails, left => left );

    clk <= not clk after T / 2 when not done;

    check : process
        procedure cycles (n : integer) is
        begin
            for i in 1 to n loop wait until falling_edge(clk); end loop;
        end procedure;
        -- a digit on the switches (through the 74LS175), then Enter pressed
        procedure digit (d : integer) is
        begin
            sw <= std_logic_vector(to_unsigned(d, 4)); cycles(3);
            enter <= '1'; cycles(1); enter <= '0'; cycles(2);
        end procedure;
        -- n seconds, each a tick of one clock cycle
        procedure seconds (n : integer) is
        begin
            for i in 1 to n loop tick <= '1'; cycles(1); tick <= '0'; cycles(3); end loop;
        end procedure;
        procedure state_is (o, l, a : std_logic; f, s : integer; what : string) is
        begin
            assert opened = o and locked = l and alarm = a and to_integer(unsigned(fails)) = f and to_integer(unsigned(left)) = s
                report what & ": opened " & std_logic'image(opened) & ", locked " & std_logic'image(locked) & ", alarm " & std_logic'image(alarm)
                     & ", fails " & integer'image(to_integer(unsigned(fails))) & ", left " & integer'image(to_integer(unsigned(left)))
                severity error;
        end procedure;
    begin
        rst <= '1'; cycles(3); rst <= '0'; cycles(2);
        state_is('0', '0', '0', 0, 0, "after reset");
        digit(2); digit(0); digit(2);
        state_is('0', '0', '0', 0, 0, "three digits of the code");
        digit(6);
        state_is('1', '0', '0', 0, 0, "the code 2 0 2 6");
        clear <= '1'; cycles(1); clear <= '0'; cycles(2);
        state_is('0', '0', '0', 0, 0, "Clear");
        digit(5);
        state_is('0', '1', '0', 1, 3, "a wrong digit");
        seconds(1); state_is('0', '1', '0', 1, 2, "1 s");
        seconds(1); state_is('0', '1', '0', 1, 1, "2 s");
        seconds(1); state_is('0', '0', '0', 1, 0, "3 s: open to a digit again");
        digit(1);
        state_is('0', '1', '0', 2, 3, "a second wrong digit");
        seconds(3);
        digit(1);
        state_is('0', '1', '1', 3, 3, "a third: the alarm");
        seconds(5);
        assert alarm = '1' report "the alarm stopped by itself" severity error;
        rst <= '1'; cycles(1); rst <= '0'; cycles(2);
        state_is('0', '0', '0', 0, 0, "reset: the alarm off");
        report "tb_safe: all checks passed";
        done <= true;
        wait;
    end process check;
end architecture sim;
