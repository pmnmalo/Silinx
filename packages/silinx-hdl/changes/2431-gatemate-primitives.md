In detail:

- **The GateMate primitives' simulation models (#2431):** src/gatemate-prims.js and gatemate-bram.js (CC_LUT1-4, CC_L2T4 /
  L2T5, CC_MX2/4/8, CC_ADDF, CC_MULT, CC_DFF, CC_DLT, the I/O buffers, CC_IDDR / ODDR, CC_BUFG, CC_PLL, CC_USR_RSTN,
  CC_CFG_CTRL, CC_BRAM_20K / 40K), from Yosys's techlibs/gatemate/cells_sim.v; added by primitiveSources (lattice-libs.js) to
  a design that instantiates them or uses `library gatemate` / `library cc_lib`; native-gatemate.js runs the netlist's cells
  natively.
