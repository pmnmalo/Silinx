----------------------------------------------------------------------------------
-- pwm_top: the regs-avr example's FPGA module, an SPI peripheral of registers, the
-- Arduino Uno its master. The registers (pwm_regs.regs.json, their slave pwm_regs.vhd
-- generated from it):
--   duty  (0x00, rw)  the PWM's duty on LD0, of 256; LD7..LD1 show its bits 7..1
--   count (0x01, ro)  the milliseconds since the last clear (16 bits)
--   clear (0x03, wo)  writing it sets count back to 0
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity pwm_top is
    Port ( clk  : in  STD_LOGIC;
           sck  : in  STD_LOGIC;
           mosi : in  STD_LOGIC;
           ss   : in  STD_LOGIC;
           miso : out STD_LOGIC;
           led  : out STD_LOGIC_VECTOR (7 downto 0));
end pwm_top;

architecture rtl of pwm_top is
    constant MS : natural := 50000;                       -- clk's cycles in a millisecond (50 MHz)
    signal duty : STD_LOGIC_VECTOR (7 downto 0);
    signal count : unsigned (15 downto 0) := (others => '0');
    signal clear_wr : STD_LOGIC;
    signal tick : natural range 0 to MS - 1 := 0;
    signal phase : unsigned (7 downto 0) := (others => '0');
begin
    regs : entity work.pwm_regs
        port map (clk => clk, sck => sck, mosi => mosi, ss => ss, miso => miso,
                  duty => duty, count => std_logic_vector(count), clear => open, clear_wr => clear_wr);

    process (clk)
    begin
        if rising_edge(clk) then
            phase <= phase + 1;                           -- the PWM's period: 256 cycles of clk
            if clear_wr = '1' then
                count <= (others => '0');
                tick <= 0;
            elsif tick = MS - 1 then
                count <= count + 1;
                tick <= 0;
            else
                tick <= tick + 1;
            end if;
        end if;
    end process;
    led(0) <= '1' when phase < unsigned(duty) else '0';
    led(7 downto 1) <= duty(7 downto 1);
end rtl;
