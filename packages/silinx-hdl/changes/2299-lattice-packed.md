In detail:

- **nextpnr's packed cells (#2299):** src/ice40-packed.js (ICESTORM_LC, natively too, and ICESTORM_RAM) and src/ecp5-packed.js
  (TRELLIS_COMB, natively in its LOGIC and CCU2 modes, and TRELLIS_RAMW), joined to the iCE40's and ECP5's libraries;
  TRELLIS_FF's SD, TRELLIS_IO's DATAMUX_*, DP16KD's and MULT18X18D's pin `*MUX` generics (the constants nextpnr folds into them).
  An ICESTORM_LC's flip-flop takes its LUT's value, SR and CEN as they were before the clock's delta; SB_IO starts with its pad
  unknown, not 0.
