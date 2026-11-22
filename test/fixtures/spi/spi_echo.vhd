-- Silinx test design (#5214): an SPI peripheral, mode 0, MSB first. Each byte it receives on MOSI is shown on its
-- LEDs, and it answers each transfer on MISO with the last byte it received plus one (the first: 0x00). SCK, MOSI
-- and SS are sampled with the clock (two flip-flops each): SCK much slower than clk. Copyright 2026 Pedro Malo.
-- AGPL-3.0-only.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity spi_echo is
    Port ( clk  : in  STD_LOGIC;
           sck  : in  STD_LOGIC;
           mosi : in  STD_LOGIC;
           ss   : in  STD_LOGIC;
           miso : out STD_LOGIC;
           led  : out STD_LOGIC_VECTOR (7 downto 0));
end spi_echo;

architecture rtl of spi_echo is
    signal sck_s, ss_s, mosi_s : STD_LOGIC_VECTOR (2 downto 0) := (others => '1');
    signal rx, tx, reply, shown : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal count : unsigned (2 downto 0) := (others => '0');
begin
    process (clk)
    begin
        if rising_edge(clk) then
            sck_s <= sck_s(1 downto 0) & sck;
            ss_s <= ss_s(1 downto 0) & ss;
            mosi_s <= mosi_s(1 downto 0) & mosi;
            if ss_s(1) = '1' then
                count <= (others => '0');
                tx <= reply;
            elsif sck_s(2) = '0' and sck_s(1) = '1' then        -- SCK rising: a bit in
                rx <= rx(6 downto 0) & mosi_s(1);
                count <= count + 1;
                if count = 7 then
                    shown <= rx(6 downto 0) & mosi_s(1);
                    reply <= std_logic_vector(unsigned(rx(6 downto 0) & mosi_s(1)) + 1);
                end if;
            elsif sck_s(2) = '1' and sck_s(1) = '0' then        -- SCK falling: the next bit out
                if count = 0 then
                    tx <= reply;
                else
                    tx <= tx(6 downto 0) & '0';
                end if;
            end if;
        end if;
    end process;
    miso <= tx(7);
    led <= shown;
end rtl;
