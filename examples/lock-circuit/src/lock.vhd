--==============================================================================
-- Entity      : lock
-- Description : Moore finite state machine generated from the state diagram lock.fsm.json
--               The lock's controller: a digit is typed with Enter, and checked against the code at its position (pos, the
--               truth table digit_ok says ok). Four right open the lock (opened) until Clear; a wrong one is a failure (fail, one clock
--               cycle: the Petri net alarm counts it), then the lock is held (hold) while the timer counts the penalty down (done);
--               the third failure (alarm) keeps it locked until reset. Clear starts the code again.
-- Generator   : Silinx FSM editor (edit the diagram, not this file).
-- Style       : 3 processes: state register, next-state logic, output logic
-- Clock       : clk (rising edge)
-- Reset       : rst, active-high, synchronous (goes to D0)
-- Encoding    : binary (3 state bits)
--
-- States and codes (Moore outputs):
--   D0    = 000  (reset)  pos = 0
--   D1    = 001           pos = 1
--   D2    = 010           pos = 2
--   D3    = 011           pos = 3
--   OPEN  = 100           pos = 0, opened = 1
--   FAIL  = 101           pos = 0, fail = 1, locked = 1
--   HOLD  = 110           pos = 0, hold = 1, locked = 1
--   ALARM = 111           pos = 0, locked = 1
--
-- Transitions (state : condition -> next state); the first true condition is taken:
--   D0    : enter && !ok -> FAIL
--   D0    : enter && ok -> D1
--   D0    : otherwise -> D0 (stays)
--   D1    : clear -> D0
--   D1    : enter && !ok -> FAIL
--   D1    : enter && ok -> D2
--   D1    : otherwise -> D1 (stays)
--   D2    : clear -> D0
--   D2    : enter && !ok -> FAIL
--   D2    : enter && ok -> D3
--   D2    : otherwise -> D2 (stays)
--   D3    : clear -> D0
--   D3    : enter && !ok -> FAIL
--   D3    : enter && ok -> OPEN
--   D3    : otherwise -> D3 (stays)
--   OPEN  : clear -> D0
--   OPEN  : otherwise -> OPEN (stays)
--   FAIL  : 1 -> HOLD
--   HOLD  : alarm -> ALARM
--   HOLD  : done -> D0
--   HOLD  : otherwise -> HOLD (stays)
--   ALARM : (no transition: stays in ALARM)
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity lock is
    port (
        clk    : in  std_logic;
        rst    : in  std_logic;
        enter  : in  std_logic;
        clear  : in  std_logic;
        ok     : in  std_logic;
        done   : in  std_logic;
        alarm  : in  std_logic;
        pos    : out std_logic_vector(1 downto 0);
        opened : out std_logic;
        fail   : out std_logic;
        hold   : out std_logic;
        locked : out std_logic
    );
end entity lock;

architecture rtl of lock is

    -- state encoding
    subtype state_t is std_logic_vector(2 downto 0);
    constant S_D0    : state_t := "000";
    constant S_D1    : state_t := "001";
    constant S_D2    : state_t := "010";
    constant S_D3    : state_t := "011";
    constant S_OPEN  : state_t := "100";
    constant S_FAIL  : state_t := "101";
    constant S_HOLD  : state_t := "110";
    constant S_ALARM : state_t := "111";

    signal state_reg  : state_t := S_D0;   -- present state
    signal state_next : state_t;                -- next state

    attribute fsm_encoding : string;
    attribute fsm_encoding of state_reg : signal is "user";

begin

    -- ------------------------------------------------------------------ state register
    state_register : process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                state_reg <= S_D0;
            else
                state_reg <= state_next;
            end if;
        end if;
    end process state_register;

    -- ------------------------------------------------------------------ next-state logic
    next_state_logic : process (state_reg, enter, clear, ok, done, alarm)
    begin
        state_next <= state_reg;   -- no transition taken: stay in the present state
        case state_reg is
            when S_D0 =>
                if (enter = '1') and (ok = '0') then
                    state_next <= S_FAIL;
                elsif (enter = '1') and (ok = '1') then
                    state_next <= S_D1;
                end if;
            when S_D1 =>
                if clear = '1' then
                    state_next <= S_D0;
                elsif (enter = '1') and (ok = '0') then
                    state_next <= S_FAIL;
                elsif (enter = '1') and (ok = '1') then
                    state_next <= S_D2;
                end if;
            when S_D2 =>
                if clear = '1' then
                    state_next <= S_D0;
                elsif (enter = '1') and (ok = '0') then
                    state_next <= S_FAIL;
                elsif (enter = '1') and (ok = '1') then
                    state_next <= S_D3;
                end if;
            when S_D3 =>
                if clear = '1' then
                    state_next <= S_D0;
                elsif (enter = '1') and (ok = '0') then
                    state_next <= S_FAIL;
                elsif (enter = '1') and (ok = '1') then
                    state_next <= S_OPEN;
                end if;
            when S_OPEN =>
                if clear = '1' then
                    state_next <= S_D0;
                end if;
            when S_FAIL =>
                state_next <= S_HOLD;
            when S_HOLD =>
                if alarm = '1' then
                    state_next <= S_ALARM;
                elsif done = '1' then
                    state_next <= S_D0;
                end if;
            when S_ALARM =>
                null;
            when others =>
                state_next <= S_D0;
        end case;
    end process next_state_logic;

    -- ------------------------------------------------------------------ output logic
    output_logic : process (state_reg)
    begin
        -- default output values (every output is assigned on every path: no latches)
        pos <= "00";
        opened <= '0';
        fail <= '0';
        hold <= '0';
        locked <= '0';
        case state_reg is
            when S_D0 =>
                pos <= "00";
            when S_D1 =>
                pos <= "01";
            when S_D2 =>
                pos <= "10";
            when S_D3 =>
                pos <= "11";
            when S_OPEN =>
                pos <= "00";
                opened <= '1';
            when S_FAIL =>
                pos <= "00";
                fail <= '1';
                locked <= '1';
            when S_HOLD =>
                pos <= "00";
                hold <= '1';
                locked <= '1';
            when S_ALARM =>
                pos <= "00";
                locked <= '1';
            when others =>
                null;
        end case;
    end process output_logic;

end architecture rtl;
-- silinx-sync drawing:61061aee490b912d hdl:b7ebc5560692fd64 (generated from the drawing: edit it, not this file)
