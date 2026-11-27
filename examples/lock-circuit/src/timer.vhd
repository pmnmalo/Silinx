--==============================================================================
-- Entity      : timer
-- Description : controller (state machine + data path) generated from the ASM chart timer.asm.json
--               The lock-out timer: started (start) by a failure, it counts the seconds gone (cnt, at each second's tick) up
--               to the penalty (secs seconds, the C function's: it is read at each tick, so its few clock cycles of latency do not
--               matter), shows the seconds left (left) and says done in the last one.
-- Generator   : Silinx ASM editor (edit the chart, not this file).
-- Style       : state register + next-state logic + output logic (latch-free)
-- Clock       : clk (rising edge)
-- Reset       : rst, active-high, synchronous
-- Encoding    : binary (1 state bit)
--
-- States:
--   IDLE  = 0  (reset)
--   COUNT = 1           Moore: left = secs - cnt
--
-- Transitions (condition -> next state [Mealy outputs]):
--   IDLE  : start -> COUNT  [cnt = 0]
--   IDLE  : !start -> IDLE
--   COUNT : tick && (cnt == secs - 1) -> IDLE  [done = 1]
--   COUNT : tick && !(cnt == secs - 1) -> COUNT  [cnt = cnt + 1]
--   COUNT : !tick -> COUNT
--
-- Registers (internal; load the value assigned in this cycle at the clock edge, hold otherwise):
--   cnt : 4 bits, reset 0
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity timer is
    port (
        clk   : in  std_logic;
        rst   : in  std_logic;
        start : in  std_logic;
        tick  : in  std_logic;
        secs  : in  std_logic_vector(3 downto 0);
        done  : out std_logic;
        left  : out std_logic_vector(3 downto 0)
    );
end entity timer;

architecture rtl of timer is

    -- state encoding
    subtype state_t is std_logic_vector(0 downto 0);
    constant S_IDLE  : state_t := "0";
    constant S_COUNT : state_t := "1";

    signal state_reg  : state_t := S_IDLE;
    signal state_next : state_t;

    attribute fsm_encoding : string;
    attribute fsm_encoding of state_reg : signal is "user";

    -- internal registers
    signal cnt, cnt_next : std_logic_vector(3 downto 0) := "0000";

begin

    -- ------------------------------------------------------------------ registers
    state_register : process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                state_reg <= S_IDLE;
                cnt <= "0000";
            else
                state_reg <= state_next;
                cnt <= cnt_next;
            end if;
        end if;
    end process state_register;

    -- ------------------------------------------------------------------ next-state logic
    next_state_logic : process (state_reg, start, tick, secs, cnt)
    begin
        state_next <= state_reg;
        case state_reg is
            when S_IDLE =>
                if start = '1' then
                    state_next <= S_COUNT;
                else
                    state_next <= S_IDLE;
                end if;
            when S_COUNT =>
                if tick = '1' then
                    if unsigned(cnt) = (resize(unsigned(secs), 32) - 1) then
                        state_next <= S_IDLE;
                    else
                        state_next <= S_COUNT;
                    end if;
                else
                    state_next <= S_COUNT;
                end if;
            when others =>
                state_next <= S_IDLE;
        end case;
    end process next_state_logic;

    -- ------------------------------------------------------------------ output and register logic
    output_logic : process (state_reg, start, tick, secs, cnt)
    begin
        -- default values (every output is assigned on every path: no latches)
        done <= '0';
        left <= "0000";
        cnt_next <= cnt;
        case state_reg is
            when S_IDLE =>
                if start = '1' then
                    cnt_next <= "0000";
                end if;
            when S_COUNT =>
                left <= std_logic_vector(unsigned(secs) - unsigned(cnt));
                if tick = '1' then
                    if unsigned(cnt) = (resize(unsigned(secs), 32) - 1) then
                        done <= '1';
                    else
                        cnt_next <= std_logic_vector(unsigned(cnt) + 1);
                    end if;
                end if;
            when others =>
                null;
        end case;
    end process output_logic;

end architecture rtl;
