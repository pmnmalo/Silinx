-- tb_stopwatch: the stopwatch-circuit example's test bench (Circuit mode: no board). A press starts it: the tenths count
-- the ticks, the seconds the tenths' wraps (2.5 after 25 ticks); a press stops it: the ticks no longer count; another
-- starts it again; 9.9 wraps to 0.0. Each check is an assertion; the last line says they all passed.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_stopwatch is
end entity tb_stopwatch;

architecture sim of tb_stopwatch is
    signal clk, rst, start, tick : std_logic := '0';
    signal tenths, secs : std_logic_vector(3 downto 0);
    signal running : std_logic;
    signal done : boolean := false;
    constant T : time := 10 ns;
begin
    dut : entity work.stopwatch port map ( clk => clk, rst => rst, start => start, tick => tick, tenths => tenths, secs => secs, running => running );

    clk <= not clk after T / 2 when not done;

    check : process
        -- n ticks, each a pulse of one clock cycle
        procedure ticks (n : integer) is
        begin
            for i in 1 to n loop
                tick <= '1'; wait until falling_edge(clk); tick <= '0'; wait until falling_edge(clk);
            end loop;
        end procedure;
        procedure press is
        begin
            start <= '1'; wait until falling_edge(clk); start <= '0'; wait until falling_edge(clk);
        end procedure;
        procedure shows (s, t : integer; what : string) is
        begin
            assert to_integer(unsigned(secs)) = s and to_integer(unsigned(tenths)) = t
                report what & ": shows " & integer'image(to_integer(unsigned(secs))) & "." & integer'image(to_integer(unsigned(tenths)))
                     & ", not " & integer'image(s) & "." & integer'image(t) severity error;
        end procedure;
    begin
        rst <= '1'; wait until falling_edge(clk); wait until falling_edge(clk); rst <= '0';
        shows(0, 0, "after reset");
        assert running = '0' report "after reset: running" severity error;
        ticks(5);
        shows(0, 0, "stopped: the ticks do not count");
        press;
        assert running = '1' report "a press: not running" severity error;
        ticks(25);
        shows(2, 5, "25 ticks");
        press;
        assert running = '0' report "a second press: still running" severity error;
        ticks(7);
        shows(2, 5, "stopped again");
        press;
        ticks(74);
        shows(9, 9, "99 ticks");
        ticks(1);
        shows(0, 0, "100 ticks: wrapped");
        report "tb_stopwatch: all checks passed";
        done <= true;
        wait;
    end process check;
end architecture sim;
