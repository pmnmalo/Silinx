// A design that reads the XADC (#5385), for the tests of the emulator's analog inputs: its VAUX6 converted again and again
// (single channel, INIT_41 3000h, INIT_40 16h, ADCCLK DCLK / 4), each end of conversion a DRP read of channel 22, the
// code's top 8 bits on the LEDs; the die temperature read too, its top 8 bits on led2.
export const XADC_TOP = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
library unisim; use unisim.vcomponents.all;
entity adcled is
  port (clk : in std_logic; led : out std_logic_vector(7 downto 0));
end adcled;
architecture rtl of adcled is
  signal eoc, drdy, den : std_logic := '0';
  signal channel : std_logic_vector(4 downto 0);
  signal daddr : std_logic_vector(6 downto 0);
  signal do_r : std_logic_vector(15 downto 0);
  signal code : std_logic_vector(7 downto 0) := (others => '0');
begin
  daddr <= "00" & channel;
  adc : XADC
    generic map (INIT_40 => X"0016", INIT_41 => X"3F0F", INIT_42 => X"0400")
    port map (DCLK => clk, RESET => '0', DEN => den, DWE => '0', DADDR => daddr, DI => (others => '0'), DO => do_r, DRDY => drdy,
              CHANNEL => channel, EOC => eoc, EOS => open, VP => '0', VN => '0', VAUXP => (others => '0'), VAUXN => (others => '0'),
              CONVST => '0', CONVSTCLK => '0', ALM => open, OT => open, BUSY => open, MUXADDR => open, JTAGBUSY => open, JTAGLOCKED => open, JTAGMODIFIED => open);
  process (clk)
  begin
    if rising_edge(clk) then
      den <= eoc;
      if drdy = '1' then code <= do_r(15 downto 8); end if;
    end if;
  end process;
  led <= code;
end rtl;
`;
