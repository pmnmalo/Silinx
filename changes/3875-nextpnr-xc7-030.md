In short:

- **The 7-series' timing is no longer optimistic.** On the Basys 3 and the Nexys A7, nextpnr's frequency estimate now
  uses delays fitted to Vivado's, so it is about 0.7–0.95 times what Vivado gives on the same design (it was 1.2–2.2
  times). Every example still meets the board's 100 MHz with no warning; stopwatch uses the best of 3 seeds
  (Process Properties), which any project can choose.

In detail:

- **nextpnr-himbaechel-xc7 0.3.0 (Fixes #3875).** Its chip database times the routing, the slice's cells and a DSP48E1
  with no register by Vivado 2025.2's delays (#3516; the DSP48E1 was not timed at all, stopwatch's estimate twice
  Vivado's). Its placer has a delay estimate from the chip database's routes (#3803), and HeAP weighs a tile across like
  one up or down, with a refinement over 20 tiles (#3875). The stopwatch example places and routes with the best of 3
  seeds (`impl.xc7Seeds`, #3825): 101.21 MHz on the Basys 3, 100.84 on the Nexys A7 (seed 1 alone: 96.98 there).
  The timing's label says "conservative against Vivado" (it said "optimistic"), and so does the timing report.
  `test/xc7-vivado-comparison.json`'s open flow re-recorded (its LUTs, frequency and compressed `.bit`, #3876; Vivado's
  columns the same netlists'); the test holds nextpnr's estimate between 0.65 and 1 times Vivado's on the same netlist,
  and every example at 100 MHz, with no exception left for stopwatch.
