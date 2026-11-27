-- tb_crossing: the traffic-circuit example's test bench (Circuit mode: no board). The crossing's phases in order when a
-- pedestrian asks (cars, yellow, all red, walk, walk ends, all red, cars), each lasting four of the timer's ticks, and
-- its lamps in each; at night the cars' yellow blinks. Each check is an assertion; the last line says they all passed.
library ieee;
use ieee.std_logic_1164.all;

entity tb_crossing is
end entity tb_crossing;

architecture sim of tb_crossing is
    signal clk, rst, tick, req, night : std_logic := '0';
    signal phase : std_logic_vector(2 downto 0);
    signal car_r, car_y, car_g, walk_r, walk_g : std_logic;
    signal running : boolean := true;
    constant T : time := 10 ns;
begin
    dut : entity work.crossing
        port map ( clk => clk, rst => rst, tick => tick, req => req, night => night, phase => phase,
                   car_r => car_r, car_y => car_y, car_g => car_g, walk_r => walk_r, walk_g => walk_g );

    clk <= not clk after T / 2 when running;

    -- a tick (a second, in the real crossing) every 4 clock cycles
    ticks : process
    begin
        while running loop
            wait until rising_edge(clk); wait until rising_edge(clk); wait until rising_edge(clk);
            tick <= '1'; wait until rising_edge(clk); tick <= '0';
        end loop;
        wait;
    end process ticks;

    check : process
        -- the lamps of a phase: cars red, yellow, green; walk red, green
        procedure lamps_are (r, y, g, wr, wg : std_logic; what : string) is
        begin
            assert car_r = r and car_y = y and car_g = g and walk_r = wr and walk_g = wg
                report what & ": wrong lamps" severity error;
        end procedure;
        -- the next phase, waited for (at most 40 cycles)
        procedure next_phase (p : std_logic_vector(2 downto 0); what : string) is
        begin
            for i in 1 to 40 loop
                wait until rising_edge(clk);
                wait for 1 ns;
                exit when phase = p;
            end loop;
            wait for 1 ns;
            assert phase = p report what & ": not reached" severity error;
        end procedure;
    begin
        rst <= '1'; wait for 3 * T; rst <= '0';
        wait until rising_edge(clk); wait for 1 ns;
        assert phase = "000" report "after reset: not cars" severity error;
        lamps_are('0', '0', '1', '1', '0', "cars");
        -- no request: the cars keep their green
        wait for 40 * T;
        assert phase = "000" report "no request: the cars lost their green" severity error;
        -- a pedestrian asks
        req <= '1';
        next_phase("001", "cars yellow"); lamps_are('0', '1', '0', '1', '0', "cars yellow");
        req <= '0';
        next_phase("010", "all red");     lamps_are('1', '0', '0', '1', '0', "all red");
        next_phase("011", "walk");        lamps_are('1', '0', '0', '0', '1', "walk");
        next_phase("100", "walk ends");
        next_phase("101", "all red 2");   lamps_are('1', '0', '0', '1', '0', "all red 2");
        next_phase("000", "cars again");  lamps_are('0', '0', '1', '1', '0', "cars again");
        -- night: the cars' yellow blinks
        night <= '1';
        next_phase("110", "night");
        wait for 40 * T;
        assert phase = "110" report "night: left" severity error;
        night <= '0';
        next_phase("000", "day");
        report "tb_crossing: all checks passed";
        running <= false;
        wait;
    end process check;
end architecture sim;
