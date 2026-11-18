In detail:

- **Blinky's test bench reads the display once the segments have settled (#4460):** it read each digit at a falling edge,
  half a clock cycle after the edge that changed the segments. On a Post-Place & Route model with its timing, the
  segments' clock to pad can be longer than that (10.3 to 11.2 ns on the XC3S250E with blinky's debounce counters 1 bit
  wide), and the test bench read a digit half changed: "digit 0: not a decimal digit". The synthesis was right (the
  Post-Synthesis models of the Spartan-3E, iCE40, ECP5 and Gowin, and the Post-Place & Route model without its SDF,
  passed). It now reads each digit at the next rising edge, a whole cycle after, as the stopwatch's, isqrt's and
  micro80's test benches do; a test runs blinky with 1-bit debounce counters on its timed model, in VHDL and Verilog.
