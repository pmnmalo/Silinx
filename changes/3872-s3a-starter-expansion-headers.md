In short:

- **The examples with a display on the Spartan-3A Starter Kit.** The board has no 7-segment display: ISE's build of
  an example that drives one (traffic, blinky, pong, stopwatch, clock, isqrt, uart, micro80) was refused for want of
  pins; it now puts the display on the board's expansion headers and says which pin each bit is on.

In detail:

- **The Spartan-3A Starter Kit's expansion connectors (#3872).** The board's pin table (core/boards.js) has, after
  UG334 ch. 15 (figs. 15-11, table 15-1), its 6-pin accessory headers J18 (`j18_io`) and J20 (`j20_io`) and its FX2
  connector J17 (`fx2_io`, its 40 I/O; `fx2_clk`, its 3 clock pins), before J19 (through-hole pads, no connector), all
  as headers: #3709's rule puts the port bits the board has no pin for there, in this order. Every example's build
  for the board goes ahead, warning of each bit it put on a header pin (the display's 12, the buttons' and switches'
  the board lacks). The Silinx toolchain does not build for the Spartan-3A yet: on this board it is ISE's.
