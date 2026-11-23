--==============================================================================
-- Entity      : pwm_regs
-- Description : the registers of the register map pwm_regs.regs.json behind an SPI slave
-- Generator   : Silinx register map (edit the map, not this file).
-- Bus         : SPI, mode 0, MSB first, SS low for a transaction: a command byte (R << 7 | address),
--               then the data bytes, the address incremented after each; a read's bytes on MISO from
--               the second byte on
-- Clock       : clk (rising edge), the bus's lines sampled with it
--
-- Registers (address, name, width, access):
--   0x00  duty    8 bit(s)  rw  reset 0
--   0x01  count  16 bit(s)  ro
--   0x03  clear   1 bit(s)  wo  reset 0, clear_wr a pulse when written
--==============================================================================
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity pwm_regs is
    Port ( clk      : in  STD_LOGIC;
           sck      : in  STD_LOGIC;
           mosi     : in  STD_LOGIC;
           ss       : in  STD_LOGIC;
           miso     : out STD_LOGIC;
           duty     : out STD_LOGIC_VECTOR (7 downto 0);
           count    : in  STD_LOGIC_VECTOR (15 downto 0);
           clear    : out STD_LOGIC;
           clear_wr : out STD_LOGIC);
end pwm_regs;

architecture rtl of pwm_regs is
    signal sck_s, ss_s, mosi_s : STD_LOGIC_VECTOR (2 downto 0) := (others => '1');
    signal rx, tx, rbyte : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal addr : STD_LOGIC_VECTOR (6 downto 0) := (others => '0');
    signal bits : unsigned (2 downto 0) := (others => '0');
    signal first, rd : STD_LOGIC := '0';
    signal duty_q : STD_LOGIC_VECTOR (7 downto 0) := "00000000";
    signal clear_q : STD_LOGIC := '0';
    signal clear_wr_q : STD_LOGIC := '0';
begin
    -- the byte a read gives at addr
    process (addr, duty_q, count)
    begin
        case addr is
            when "0000000" => rbyte <= duty_q(7 downto 0);
            when "0000001" => rbyte <= count(7 downto 0);
            when "0000010" => rbyte <= count(15 downto 8);
            when "0000011" => rbyte <= (others => '0');
            when others => rbyte <= (others => '0');
        end case;
    end process;

    process (clk)
        variable b : STD_LOGIC_VECTOR (7 downto 0);
    begin
        if rising_edge(clk) then
            sck_s <= sck_s(1 downto 0) & sck;
            ss_s <= ss_s(1 downto 0) & ss;
            mosi_s <= mosi_s(1 downto 0) & mosi;
            clear_wr_q <= '0';
            if ss_s(1) = '1' then                                  -- not selected
                first <= '1';
                bits <= (others => '0');
                tx <= (others => '0');
            elsif sck_s(2) = '0' and sck_s(1) = '1' then             -- SCK rising: a bit in
                b := rx(6 downto 0) & mosi_s(1);
                rx <= b;
                bits <= bits + 1;
                if bits = 7 then
                    if first = '1' then                          -- the command: R, the address
                        first <= '0';
                        rd <= b(7);
                        addr <= b(6 downto 0);
                    elsif rd = '0' then                         -- a byte written
                        case addr is
                            when "0000000" => duty_q(7 downto 0) <= b(7 downto 0);
                            when "0000011" => clear_q <= b(0); clear_wr_q <= '1';
                            when others => null;
                        end case;
                        addr <= std_logic_vector(unsigned(addr) + 1);
                    end if;
                end if;
            elsif sck_s(2) = '1' and sck_s(1) = '0' then             -- SCK falling: the next bit out
                if bits = 0 and first = '0' and rd = '1' then
                    tx <= rbyte;
                    addr <= std_logic_vector(unsigned(addr) + 1);
                else
                    tx <= tx(6 downto 0) & '0';
                end if;
            end if;
        end if;
    end process;
    miso <= tx(7);
    duty <= duty_q;
    clear <= clear_q;
    clear_wr <= clear_wr_q;
end rtl;
