In detail:

- **The iCE40 primitives' simulation models (#2299):** src/ice40-prims.js, ice40-ram.js and ice40-dsp.js (SB_LUT4, SB_CARRY,
  the flip-flops, the I/O cells, SB_GB, the PLLs, the oscillators, the LED drivers, the block RAMs, SB_SPRAM256KA,
  SB_MAC16), added by primitiveSources (unisim.js, through lattice-libs.js) to a design that instantiates them or uses
  `library sb_ice40_components_syn`; native-lattice.js runs the netlist cells natively (nativePrimitive's option `lib`, the
  library's file, in place of `gowin`); the flat Verilog keeps an iCE40 primitive as the iCE40's cell.
