----------------------------------------------------------------------------------
-- Silinx example: lock, a combination lock for the Basys2 / Nexys2, made of every kind of source Silinx has.
-- The code is 2 0 2 6: set a digit on the switches, press Enter, the next digit, Enter... The four digits right open
-- the lock; a wrong one locks it for a penalty (3 s, then 6 s, then 9 s: the seconds left on the display), and the
-- third wrong one sounds the alarm until reset.
--   clk : the board's oscillator (CLK_HZ: 50 MHz on the Basys2 / Nexys2)
--   SW3..SW0 (sw(3 downto 0)) : the digit
--   BTN0 (btn(0)) : Enter: the digit typed
--   BTN1 (btn(1)) : Clear: the code started again (and the lock closed)
--   BTN2 (btn(2)) : reset
--   LD0 / LD1 / LD2 : open / alarm / locked out
--   LD7..LD4        : the digit, as the flip-flops of the circuit sync hold it
--   display         : the digits typed (the last on the right), or the seconds left of a lock-out
-- The design, each part in the style that suits it best:
--   sync.circ.json     : the digit's switches synchronised to the clock, a 74175 on a breadboard (a digital circuit)
--   debounce.vhd       : the buttons made clean (VHDL, the stopwatch example's)
--   control.sch.json   : the controller's parts wired together (a schematic):
--     lock.fsm.json      : the controller, a state diagram (a Moore machine: one state per digit right)
--     digit_ok.bool.json : the code, a truth table (is the digit the right one at its position?)
--     alarm.pn.json      : the failures counted, a Petri net (a token moved on at each failure)
--     timer.asm.json     : the lock-out timer, an ASM chart (a register counted down)
--   penalty.c          : the seconds of a lock-out, a C function (Silinx HLS)
--   typed.cpp          : the digits typed, a C++ function with a static variable (Silinx HLS)
--   sevenseg.v         : the 7-segment display (Verilog, the clock example's)
--   top.vhd            : this file: the second's tick, the parts connected together, the display's digits
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
    Generic ( CLK_HZ  : integer := 50_000_000;     -- the board's clock, in Hz (50 MHz on the Basys2 / Nexys2)
              TICK    : integer := 0;              -- clock cycles per second: 0 for CLK_HZ
              REFRESH : integer := 0;              -- display: cycles per digit (1 ms): 0 for CLK_HZ / 1000
              STABLE  : integer := 0;              -- buttons: cycles a press must last (20 ms): 0 for CLK_HZ / 50
              BTN_LOW : boolean := false;          -- true: the board's buttons read '0' when pressed
              SW_LOW  : boolean := false;          -- true: the board's switches read '0' when on
              AN_LOW  : boolean := true );         -- true: the board's digit enables light a digit at '0'
    Port ( clk : in  STD_LOGIC;
           sw  : in  STD_LOGIC_VECTOR (3 downto 0);
           btn : in  STD_LOGIC_VECTOR (2 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);
           dp  : out STD_LOGIC;
           an  : out STD_LOGIC_VECTOR (3 downto 0) );
end top;

architecture Structural of top is
    -- the timing in clock cycles: a generic given (the test bench's), else (0) from the board's clock
    function or_else (given, derived : integer) return integer is
    begin
        if given /= 0 then return given; else return derived; end if;
    end function;
    constant TICK_N    : integer := or_else(TICK, CLK_HZ);
    constant REFRESH_N : integer := or_else(REFRESH, CLK_HZ / 1000);
    constant STABLE_N  : integer := or_else(STABLE, CLK_HZ / 50);
    -- AN_LOW as sevenseg.v's parameter (1: true; a Verilog module takes an integer)
    function to_int (b : boolean) return integer is
    begin
        if b then return 1; else return 0; end if;
    end function;
    component sevenseg
        generic ( REFRESH : integer; AN_LOW : integer );
        port ( clk    : in  std_logic;
               digits : in  std_logic_vector(15 downto 0);
               points : in  std_logic_vector(3 downto 0);
               seg    : out std_logic_vector(6 downto 0);
               dp     : out std_logic;
               an     : out std_logic_vector(3 downto 0) );
    end component;
    signal rst, enter, clear, sec_tick : STD_LOGIC;   -- (not "tick": VHDL's names ignore case, the generic TICK)
    signal count               : integer range 0 to TICK_N - 1 := 0;
    signal digit               : STD_LOGIC_VECTOR (3 downto 0);
    signal opened, locked, alarm : STD_LOGIC;
    signal fails               : STD_LOGIC_VECTOR (1 downto 0);
    signal secs_now, left      : STD_LOGIC_VECTOR (3 downto 0);
    signal secs                : STD_LOGIC_VECTOR (3 downto 0) := "0000";
    signal shown_now           : STD_LOGIC_VECTOR (15 downto 0);
    signal shown               : STD_LOGIC_VECTOR (15 downto 0) := x"FFFF";
    signal shown_vld, call     : STD_LOGIC;
    signal digits              : STD_LOGIC_VECTOR (15 downto 0);
    -- the buttons and switches as '1' when pressed or on, whatever the board's level
    signal btnOn : STD_LOGIC_VECTOR (2 downto 0);
    signal swOn  : STD_LOGIC_VECTOR (3 downto 0);
begin
    btnOn <= not btn when BTN_LOW else btn;
    swOn  <= not sw when SW_LOW else sw;

    rst <= btnOn(2);

    -- one clock cycle a second
    process (clk)
    begin
        if rising_edge(clk) then
            if count = TICK_N - 1 then count <= 0; else count <= count + 1; end if;
        end if;
    end process;
    sec_tick <= '1' when count = TICK_N - 1 else '0';

    u_sync : entity work.sync
        port map ( clk => clk, d => swOn, q => digit );
    u_enter : entity work.debounce
        generic map ( STABLE => STABLE_N )
        port map ( clk => clk, btn => btnOn(0), press => enter );
    u_clear : entity work.debounce
        generic map ( STABLE => STABLE_N )
        port map ( clk => clk, btn => btnOn(1), press => clear );

    u_control : entity work.control
        port map ( clk => clk, rst => rst, enter => enter, clear => clear, digit => digit, tick => sec_tick, secs => secs,
                   opened => opened, locked => locked, alarm => alarm, fails => fails, left => left );

    -- the penalty of the failures so far (C): logic alone, no block protocol (ap_ctrl_none)
    u_penalty : entity work.penalty
        port map ( fails => fails, ap_return => secs_now );
    -- the digits typed (C++), running by itself (ap_ctrl_none): a call at each Enter, or a Clear to blank them
    call <= enter or clear;
    u_typed : entity work.typed
        port map ( ap_clk => clk, ap_rst => rst, call => call, clear => clear, digit => digit,
                   shown => shown_now, shown_ap_vld => shown_vld );
    led <= digit & '0' & locked & alarm & opened;

    -- the alarm: blank; the seconds left of a lock-out on the right digit (F: blank); else the digits typed
    digits <= x"FFFF" when alarm = '1' else x"FFF" & left when left /= "0000" else shown;
    u_display : sevenseg
        generic map ( REFRESH => REFRESH_N, AN_LOW => to_int(AN_LOW) )
        port map ( clk => clk, digits => digits, points => "0000",
                   seg => seg, dp => dp, an => an );

    -- the penalty, registered, and the digits shown, kept when a call changes them
    process (clk)
    begin
        if rising_edge(clk) then
            secs <= secs_now;
            if rst = '1' then shown <= x"FFFF"; elsif shown_vld = '1' then shown <= shown_now; end if;
        end if;
    end process;
end Structural;
