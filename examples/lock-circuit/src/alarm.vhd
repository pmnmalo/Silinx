--==============================================================================
-- Entity      : alarm
-- Description : synchronous controller of the Petri net alarm.pn.json
--               The failures counted by a token: it moves one place on at each failure (fail) and goes back to none when the lock
--               opens (opened). Its place is the number of failures (fails, for the penalty); the third one takes it to alarm, where it
--               stays until reset.
-- Generator   : Silinx Petri net editor (edit the net, not this file)
-- Semantics   : on each rising edge of clk the enabled transitions whose guard is true fire,
--               in priority order (a transition takes its tokens only if they are still there);
--               reset (rst, active-high, synchronous) restores the initial marking.
-- Places      : none (1 token), one, two, alarmed
-- Transitions : fail1 [fail], fail2 [fail], fail3 [fail], forgive1 [opened], forgive2 [opened]
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity alarm is
  port (
    clk : in std_logic;
    rst : in std_logic;
    fail : in std_logic;
    opened : in std_logic;
    fails : out std_logic_vector(1 downto 0);
    alarm : out std_logic
  );
end entity alarm;

architecture petri of alarm is
  signal pl_none : std_logic := '1';
  signal pl_one : std_logic := '0';
  signal pl_two : std_logic := '0';
  signal pl_alarmed : std_logic := '0';
begin
  process (clk)
    variable o_none, v_none, add_none, o_one, v_one, add_one, o_two, v_two, add_two, o_alarmed, v_alarmed, add_alarmed : unsigned(8 downto 0);
  begin
    if rising_edge(clk) then
      if rst = '1' then
        pl_none <= '1';
        pl_one <= '0';
        pl_two <= '0';
        pl_alarmed <= '0';
      else
        o_none := unsigned'("00000000" & pl_none);
        v_none := o_none;
        add_none := (others => '0');
        o_one := unsigned'("00000000" & pl_one);
        v_one := o_one;
        add_one := (others => '0');
        o_two := unsigned'("00000000" & pl_two);
        v_two := o_two;
        add_two := (others => '0');
        o_alarmed := unsigned'("00000000" & pl_alarmed);
        v_alarmed := o_alarmed;
        add_alarmed := (others => '0');
        -- fail1
        if (fail = '1') and (v_none >= 1) and (v_one + add_one + 1 <= 1) then
          v_none := v_none - 1;
          add_one := add_one + 1;
        end if;
        -- fail2
        if (fail = '1') and (v_one >= 1) and (v_two + add_two + 1 <= 1) then
          v_one := v_one - 1;
          add_two := add_two + 1;
        end if;
        -- fail3
        if (fail = '1') and (v_two >= 1) and (v_alarmed + add_alarmed + 1 <= 1) then
          v_two := v_two - 1;
          add_alarmed := add_alarmed + 1;
        end if;
        -- forgive1
        if (opened = '1') and (v_one >= 1) and (v_none + add_none + 1 <= 1) then
          v_one := v_one - 1;
          add_none := add_none + 1;
        end if;
        -- forgive2
        if (opened = '1') and (v_two >= 1) and (v_none + add_none + 1 <= 1) then
          v_two := v_two - 1;
          add_none := add_none + 1;
        end if;
        v_none := v_none + add_none;
        pl_none <= v_none(0);
        v_one := v_one + add_one;
        pl_one <= v_one(0);
        v_two := v_two + add_two;
        pl_two <= v_two(0);
        v_alarmed := v_alarmed + add_alarmed;
        pl_alarmed <= v_alarmed(0);
      end if;
    end if;
  end process;

  process (pl_none, pl_one, pl_two, pl_alarmed)
    variable o_fails : std_logic_vector(1 downto 0);
    variable o_alarm : std_logic;
  begin
    o_fails := (others => '0');
    if pl_one = '1' then o_fails := o_fails or "01"; end if;
    if pl_two = '1' then o_fails := o_fails or "10"; end if;
    if pl_alarmed = '1' then o_fails := o_fails or "11"; end if;
    fails <= o_fails;
    o_alarm := '0';
    if pl_alarmed = '1' then o_alarm := o_alarm or '1'; end if;
    alarm <= o_alarm;
  end process;
end architecture petri;
