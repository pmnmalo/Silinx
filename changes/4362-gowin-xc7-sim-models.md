In short:

- **Simulate Post-Place & Route on the Gowin, Post-Synthesis on the 7-series.** The Tang Nano 9K's flow makes its
  Post-Place & Route simulation model too, and the Silinx toolchain's 7-series flow (the Basys 3, the Nexys A7) its
  Post-Synthesis one: Simulate and Emulate them as on the other boards.

In detail:

- **The Gowin's Post-Place & Route simulation model (Part of #4362):** Generate Post-Place & Route Simulation Model writes
  nextpnr-himbaechel-gowin's routed design as `build/netgen/par/<top>_timesim.v`, as the iCE40's and ECP5's (#2299). Its cells
  are made the models' again (core/gowin-routed.js: its block RAMs' and multipliers' pins a bit gathered into their vectors,
  SP / DP the SPX9, DPB or DPX9B they were, the pins of no function left out) and its ALU chains' ends (`ALU_MODE` "C2L",
  "ONE2C") written as their LUTs (core/netlist-verilog.js gowinAluModes). The row, the model choices, simulate and
  run_process's `post_par_model` take it. Tests: gowin-routed (every example's post-place & route model passes its test bench,
  no warning), gowin-routed-cells, netlist-verilog, gowin-prims, mcp-gowin, mcp-simulate-models, tasks, tool-descriptors,
  gowin, test/ui/sim-models-flows, test/ui/gowin-device.
- **The 7-series' Post-Synthesis simulation model (Part of #4362):** the Silinx toolchain's 7-series flow writes Yosys's
  netlist of UNISIM's cells as `build/netgen/synthesis/<top>_synthesis.v`, simulated with Silinx's models of them, DSP48E1,
  RAMB18E1 and RAMB36E1 new (packages/silinx-hdl/src/unisim-xc7.js). Its row and model choice are shown when the project's
  synthesis tool is Silinx; simulate and run_process take it then (or with `toolchain: 'silinx'`), and with AMD Vivado's flow
  say that the Silinx toolchain's makes it. No Post-Place & Route model: nextpnr-xilinx's routed design is made of its sites'
  cells, which Silinx does not model (#4362 stays open for it). Tests: xc7-netlist (every example's post-synthesis model passes
  its test bench, no warning), unisim-xc7, mcp-xc7, mcp-simulate-models, tasks, tool-descriptors, test/ui/xc7-open-flow,
  test/ui/sim-models-flows.
