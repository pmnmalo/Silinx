-- Silinx example regs-zynq (#4688): the Zybo Z7's programmable logic driven by its processing system's program
-- (ps/main.c) through a register map on AXI4-Lite (cnt_regs.regs.json). The Cortex-A9 writes `period` (FCLK0's clocks
-- per step) and `enable`, strobes `clear`, and reads `count` back; LD0 to LD3 show the count's low four bits. Its clk is
-- FCLK_CLK0, its registers the map's: Silinx writes the PL's top (the PS7, its M_AXI_GP0 on the map's slave, this
-- module).
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter is
  port (
    clk      : in  std_logic;
    enable   : in  std_logic;
    period   : in  std_logic_vector(31 downto 0);
    clear    : in  std_logic;
    clear_wr : in  std_logic;
    count    : out std_logic_vector(15 downto 0);
    led      : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of counter is
  signal ticks : unsigned(31 downto 0) := (others => '0');
  signal c     : unsigned(15 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if clear_wr = '1' and clear = '1' then
        ticks <= (others => '0');
        c <= (others => '0');
      elsif enable = '1' then
        if ticks + 1 >= unsigned(period) then
          ticks <= (others => '0');
          c <= c + 1;
        else
          ticks <= ticks + 1;
        end if;
      end if;
    end if;
  end process;

  count <= std_logic_vector(c);
  led <= std_logic_vector(c(3 downto 0));
end architecture;
