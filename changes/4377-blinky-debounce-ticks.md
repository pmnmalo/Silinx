In short:

- **blinky's buttons:** debounced over 3 ticks of its 80 Hz base tick (25 to 37.5 ms), the same on every board, instead
  of 20 ms of the board's clock; it builds with ISE with no warnings on the Nexys3 and the Atlys again.

In detail:

- **blinky's debounce in ticks, not clock cycles (#4377):** `speed_ctrl`'s counters `cnt_f` and `cnt_s` counted
  `CLK_HZ / 50` cycles (20 ms), and no fixed width fitted every board's clock: 21 bits never reached it above 104.8 MHz
  (#3922), 22 left bit 21 constant at 100 MHz (XST's `WARNING:Xst:1293 - FF/Latch <u_speed/cnt_s_21> has a constant
  value of 0` on the Nexys3 and the Atlys). They now count the prescaler's ticks (80 a second) while the button
  differs from its debounced value, under a `tick` decision box as the divider's (its VHDL translates to Verilog):
  `DEBOUNCE` = 3 ticks, 2-bit counters, every bit used on every board. A button is
  taken once held 3 ticks, 25 to 37.5 ms (it was 20 ms); a press held 2 ticks is not. A unit test checks the counters'
  width against `DEBOUNCE - 1` at every board's clock, and simulates the chart's VHDL and Verilog. The chart's register
  widths are integers; a width given by a generic's expression is #4378.
