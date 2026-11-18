In short:

- **The GateMate's Post-Synthesis model:** Generate Post-Synthesis Simulation Model, Simulate and Emulate Post-Synthesis Model
  on a GateMate project: Yosys's netlist of the GateMate's cells, simulated with Silinx's models of them.

In detail:

- **The GateMate primitives' models (#2431):** packages/silinx-hdl/src/gatemate-prims.js and gatemate-bram.js, Silinx's own
  functional models of the cells synth_gatemate maps onto and a user's HDL may instantiate, from Yosys's
  techlibs/gatemate/cells_sim.v: CC_LUT1-4, CC_L2T4, CC_L2T5, CC_MX2/4/8, CC_ADDF, CC_MULT, CC_DFF, CC_DLT, the I/O buffers
  (CC_IBUF, CC_OBUF, CC_TOBUF, CC_IOBUF, the LVDS ones), CC_IDDR, CC_ODDR, CC_BUFG, CC_PLL (its outputs at OUT_CLK after three of
  CLK_REF's edges, not re-aligned to it), CC_USR_RSTN, CC_CFG_CTRL, and the block RAMs CC_BRAM_20K and CC_BRAM_40K (SDP and
  TDP, NO_CHANGE and WRITE_THROUGH, the output register, the 40K's cascade); a design gets them by their names (a Verilog
  instance) or its VHDL library (`library gatemate;`, `library cc_lib;`). The flow's postsynth step on the GateMate (core/
  flow-models-nextpnr.js), the MCP server's post_synthesis_model; no Post-Place & Route model. Tests: each cell against
  cells_sim.v's semantics written again, in Verilog and in VHDL (test/gatemate-prims.test.js); every example's test bench
  passes on its GateMate post-synthesis netlist as on its RTL, with no warning (test/gatemate-netlist.test.js); native-gatemate.js evaluates
  the netlist's LUTs, multiplexers, adders, flip-flops and buffers natively (vga's netlist 114 s, not 53 minutes).
