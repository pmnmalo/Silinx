----------------------------------------------------------------------------------
-- i2c_leds: the i2c-avr example's FPGA module, an I2C peripheral at the address 0x42
--   scl      : from the Arduino Uno, the master (its A5)
--   sda      : the bus's data line, shared with it (its A4): pulled low or released,
--              never driven high (open drain, the bus's pull-up its 1)
--   sw       : SW7..SW0, the byte a read gets
--   LD7..LD0 : the last byte written
-- Each byte is acknowledged; a read gets the switches, again and again until the
-- master says no more (its NACK). SCL and SDA are sampled with the clock (two
-- flip-flops each): SCL much slower than clk (100 kHz against 50 MHz).
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity i2c_leds is
    Port ( clk : in    STD_LOGIC;
           scl : in    STD_LOGIC;
           sda : inout STD_LOGIC;
           sw  : in    STD_LOGIC_VECTOR (7 downto 0);
           led : out   STD_LOGIC_VECTOR (7 downto 0));
end i2c_leds;

architecture rtl of i2c_leds is
    constant ADDRESS : STD_LOGIC_VECTOR (6 downto 0) := "1000010";   -- 0x42
    type state_t is (IDLE, ADDR, WDATA, ACK, RDATA, RACK);
    signal state : state_t := IDLE;
    signal scl_s, sda_s : STD_LOGIC_VECTOR (2 downto 0) := (others => '1');
    signal rx, tx, shown : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal count : unsigned (3 downto 0) := (others => '0');
    signal reading, pull, acked : STD_LOGIC := '0';
begin
    process (clk)
        variable rise, fall : boolean;
    begin
        if rising_edge(clk) then
            scl_s <= scl_s(1 downto 0) & scl;
            sda_s <= sda_s(1 downto 0) & sda;
            rise := scl_s(2) = '0' and scl_s(1) = '1';
            fall := scl_s(2) = '1' and scl_s(1) = '0';
            if scl_s(1) = '1' and sda_s(2) = '1' and sda_s(1) = '0' then      -- START
                state <= ADDR;
                count <= (others => '0');
                pull <= '0';
            elsif scl_s(1) = '1' and sda_s(2) = '0' and sda_s(1) = '1' then   -- STOP
                state <= IDLE;
                pull <= '0';
            else
                case state is
                    when ADDR | WDATA =>                                        -- a byte in
                        if rise then
                            rx <= rx(6 downto 0) & sda_s(1);
                            count <= count + 1;
                        elsif fall and count = 8 then
                            if state = WDATA then
                                shown <= rx;
                                pull <= '1';
                                state <= ACK;
                            elsif rx(7 downto 1) = ADDRESS then
                                reading <= rx(0);
                                pull <= '1';
                                state <= ACK;
                            else
                                state <= IDLE;                                  -- not ours
                            end if;
                        end if;
                    when ACK =>                                                 -- our ACK, then the next byte
                        if fall then
                            count <= (others => '0');
                            if reading = '1' then
                                tx <= sw(6 downto 0) & '0';
                                pull <= not sw(7);
                                count <= to_unsigned(1, 4);
                                state <= RDATA;
                            else
                                pull <= '0';
                                state <= WDATA;
                            end if;
                        end if;
                    when RDATA =>                                               -- a byte out
                        if fall then
                            if count = 8 then
                                pull <= '0';
                                state <= RACK;
                            else
                                pull <= not tx(7);
                                tx <= tx(6 downto 0) & '0';
                                count <= count + 1;
                            end if;
                        end if;
                    when RACK =>                                                -- the master's ACK: more
                        if rise then
                            acked <= not sda_s(1);
                        elsif fall then
                            if acked = '1' then
                                tx <= sw(6 downto 0) & '0';
                                pull <= not sw(7);
                                count <= to_unsigned(1, 4);
                                state <= RDATA;
                            else
                                state <= IDLE;
                            end if;
                        end if;
                    when IDLE =>
                        null;
                end case;
            end if;
        end if;
    end process;
    sda <= '0' when pull = '1' else 'Z';
    led <= shown;
end rtl;
