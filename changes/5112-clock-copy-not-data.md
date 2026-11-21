In detail:

- **Check Syntax: a clock copied as it is not "used as data" (#5112):** a plain copy of a clock (`n <= clk`, `assign n = clk`),
  as a digital circuit's clock source in its HDL, is a name of the clock, no more warned as `Clock signal <clk> is used as
  data`; the clock in an expression still is.
