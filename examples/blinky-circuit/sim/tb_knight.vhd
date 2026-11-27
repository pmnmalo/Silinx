-- tb_knight: the blinky-circuit example's test bench (Circuit mode: no board). After a reset the rightmost LED is lit;
-- at each step the lit LED moves one place to the left, then, its end reached, back to the right: led(0) .. led(7), then
-- led(7) .. led(0), one LED at a time. Each check is an assertion; the last line says they all passed.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tb_knight is
end entity tb_knight;

architecture sim of tb_knight is
    signal clk, rst, step : std_logic := '0';
    signal led : std_logic_vector(7 downto 0);
    signal pos : std_logic_vector(2 downto 0);
    signal running : boolean := true;
    constant T : time := 10 ns;
    -- the LED's place after each step from the reset: 0 .. 7, then 7 .. 0
    type places_t is array (0 to 16) of integer;
    constant PLACES : places_t := (0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0, 0);
begin
    dut : entity work.knight port map ( clk => clk, rst => rst, step => step, led => led, pos => pos );

    clk <= not clk after T / 2 when running;

    check : process
        variable want : std_logic_vector(7 downto 0);
    begin
        rst <= '1'; wait for 2 * T; rst <= '0';
        for i in 0 to 16 loop
            wait until falling_edge(clk);
            want := (others => '0'); want(PLACES(i)) := '1';
            assert led = want report "step " & integer'image(i) & ": led(" & integer'image(PLACES(i)) & ") should be the only one lit" severity error;
            assert to_integer(unsigned(pos)) = PLACES(i) report "step " & integer'image(i) & ": wrong place" severity error;
            -- the next step: a pulse of one clock cycle
            step <= '1'; wait until falling_edge(clk); step <= '0';
        end loop;
        report "tb_knight: all checks passed";
        running <= false;
        wait;
    end process check;
end architecture sim;
