In detail:

- **nextpnr-himbaechel-xc7 0.3.0 (Fixes #3875).** The 7-series' timing is fitted to Vivado's: the routing, the slice's
  cells and a DSP48E1 with no register (#3516). The placer is tuned for it (#3803, #3875). nextpnr's estimate is now
  0.7–0.95 times Vivado's on the same netlist (1.2–2.2 times with 0.1.2). `XC7_TIMING_MODEL` and the timing report say
  "conservative against Vivado".
