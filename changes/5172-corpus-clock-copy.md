In detail:
- The design corpus expects no clock-as-data warning for light8080's `clk <= clk_i;` (mcu80_uart.vhdl:254): a clock copied as it is is a name of the clock since #5112, and the Nightly's designs job failed on the vanished warning (#5172).
