----------------------------------------------------------------------------------
-- adc_display: the adc-pmod example's FPGA module, a Basys 2 reading a Pmod AD1 on its JA header
--   cs, sck : to the AD1 (JA1, JA4): its AD7476A's chip select and clock
--   d0      : from the AD1 (JA2): its first converter's data, a potentiometer's wiper on A0
--   an, seg : the four displays: the 12-bit code in hexadecimal (0 then three digits)
--   LD7..LD0: the code's top 8 bits
-- The SPI master's SCK is clk / 16 (3.125 MHz): CS falls, 16 SCK periods (SCK idle high, D0 read as SCK falls, just
-- before the AD7476A puts out its next bit: 4 zeros, then the code MSB first), CS rises, the code kept; again and again,
-- about every 6.6 us. The displays are multiplexed, each lit for a quarter of 2^16 clk periods (1.3 ms).
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity adc_display is
  port (clk : in std_logic;
        cs, sck : out std_logic;
        d0 : in std_logic;
        led : out std_logic_vector(7 downto 0);
        seg : out std_logic_vector(6 downto 0);
        dp : out std_logic;
        an : out std_logic_vector(3 downto 0));
end adc_display;

architecture rtl of adc_display is
  signal div : unsigned(2 downto 0) := (others => '0');
  signal bitn : unsigned(5 downto 0) := (others => '0');
  signal sh : std_logic_vector(15 downto 0) := (others => '0');
  signal code : std_logic_vector(11 downto 0) := (others => '0');
  signal sck_r, cs_r : std_logic := '1';
  signal scan : unsigned(15 downto 0) := (others => '0');
  signal digit : std_logic_vector(3 downto 0);
begin
  -- the SPI master: a step every 8 clk periods, SCK toggled at each (16 periods of clk a period of SCK)
  process (clk)
  begin
    if rising_edge(clk) then
      div <= div + 1;
      if div = 7 then
        if bitn = 0 then cs_r <= '0'; sck_r <= '1'; bitn <= bitn + 1;
        elsif bitn <= 32 then
          sck_r <= not sck_r;
          if sck_r = '1' then sh <= sh(14 downto 0) & d0; end if;
          bitn <= bitn + 1;
        elsif bitn = 33 then cs_r <= '1'; code <= sh(11 downto 0); bitn <= bitn + 1;
        elsif bitn = 40 then bitn <= (others => '0');
        else bitn <= bitn + 1;
        end if;
      end if;
    end if;
  end process;
  cs <= cs_r;
  sck <= sck_r;
  led <= code(11 downto 4);

  -- the displays: AN3 (the left one) a 0, AN2..AN0 the code's three hexadecimal digits
  process (clk)
  begin
    if rising_edge(clk) then
      scan <= scan + 1;
    end if;
  end process;
  with scan(15 downto 14) select
    digit <= code(3 downto 0) when "00",
             code(7 downto 4) when "01",
             code(11 downto 8) when "10",
             "0000" when others;
  with scan(15 downto 14) select
    an <= "1110" when "00",
          "1101" when "01",
          "1011" when "10",
          "0111" when others;
  -- (seg(0) is a, seg(6) is g; a segment lit at 0)
  with digit select
    seg <= "1000000" when "0000", "1111001" when "0001", "0100100" when "0010", "0110000" when "0011",
           "0011001" when "0100", "0010010" when "0101", "0000010" when "0110", "1111000" when "0111",
           "0000000" when "1000", "0010000" when "1001", "0001000" when "1010", "0000011" when "1011",
           "1000110" when "1100", "0100001" when "1101", "0000110" when "1110", "0001110" when others;
  dp <= '1';
end rtl;
