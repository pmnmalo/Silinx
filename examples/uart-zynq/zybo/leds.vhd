-- Silinx example uart-zynq (#4687): the Zybo Z7's programmable logic beside its processing system's program
-- (ps/main.c, which says hello on the board's USB serial port and blinks LD4): LD0 to LD2 follow SW0 to SW2, LD3 blinks
-- about once a second from the board's 125 MHz clock.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity leds is
  port (
    clk : in  std_logic;
    sw  : in  std_logic_vector(2 downto 0);
    led : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of leds is
  signal count : unsigned(26 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      count <= count + 1;
    end if;
  end process;

  led <= std_logic(count(26)) & sw;
end architecture;
