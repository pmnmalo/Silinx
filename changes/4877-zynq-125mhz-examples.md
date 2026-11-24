In short:

- **Stopwatch and pong at the Zynq boards' 125 MHz:** on the Zybo Z7 and the Arty Z7 the Silinx toolchain builds
  stopwatch with no timing warning, and pong on the Zybo Z7.

In detail:

- **The examples' paths for a 125 MHz clock (#4877):** stopwatch's binary to decimal conversion registers its value
  before the multipliers (`to_decimal.vhd`: three cycles, the lap memory's block RAM and the multipliers no longer in
  one), 147–152 MHz on the Zybo Z7 and the Arty Z7 by nextpnr's estimate (97–101 before); pong keeps `period - 1`, the
  next period and whether it may still shrink, and the ball at either end in registers (`pong.v`), 130–132 MHz on the
  Zybo Z7 (97–101 before). Still below 125 MHz, their warnings expected: pong on the Arty Z7 (106–124 MHz, its
  placement) and micro80 (108–115 MHz, its light8080 core's paths, kept as they are: nextpnr's placement, #3803). The
  examples' tables on every board measured again.
