In detail:

- **The ECP5 primitives' simulation models (#2299):** src/ecp5-prims.js, ecp5-bram.js and ecp5-dsp.js (LUT4, LUT2, PFUMX,
  L6MUX21, CCU2C, TRELLIS_FF and the Diamond flip-flops, the distributed RAMs, the I/O cells, the DDR registers, DCCA, DCSC,
  OSCG, EHXPLLL, DP16KD, MULT18X18D), added by primitiveSources (unisim.js, through lattice-libs.js) to a design that
  instantiates them (LUT4, LUT2, INV and GSR by the ECP5's pins, before UNISIM's and Gowin's) or uses `library ecp5u`;
  native-lattice.js runs the netlist cells natively; the flat Verilog keeps an ECP5 primitive as the ECP5's cell.
