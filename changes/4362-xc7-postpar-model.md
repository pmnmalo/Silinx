In short:

- **Simulate Post-Place & Route on the 7-series.** The Silinx toolchain's 7-series flow (the Basys 3, the Nexys A7) makes its
  Post-Place & Route simulation model too: Simulate and Emulate it as on the other boards.

In detail:

- **The 7-series' Post-Place & Route simulation model (Fixes #4362):** Generate Post-Place & Route Simulation Model writes
  nextpnr-himbaechel-xilinx's routed design (its `--write` JSON, now `build/open/routed.json`) as
  `build/netgen/par/<top>_timesim.v`, simulated with Silinx's UNISIM models. Its sites' cells (SLICE_LUTX, SLICE_FFX, CARRY4,
  IOB33_INBUF_EN, RAMB18E1_RAMB18E1, DSP48E1_DSP48E1 …) are made the cells synthesis wrote again by the names nextpnr keeps
  (`X_ORIG_TYPE`, `X_ORIG_PORT_<pin>`; core/xc7-routed.js): the site pins of a bit gathered into the cell's vectors, the pins
  of no cell pin left out, the constants' cells their values, the inversions of a constant folded, a carry chain's head's
  CYINIT its `X_PRECYINIT`, BUFGCTRL a BUFG and RAMD32 a RAM32X1D again, a LUT's INIT its own bits. The row and the model
  choices are shown when the project's synthesis tool is Silinx; simulate and run_process's `post_par_model` take it then (or
  with `toolchain: 'silinx'`). Tests: xc7-routed (every example's post-place & route model passes its test bench on the Basys 3
  and the Nexys A7, no warning), xc7-routed-cells, mcp-xc7, mcp-simulate-models, tool-descriptors, vivado, open-flow-xc7-server,
  xc7-timing-vivado, test/ui/xc7-open-flow, test/ui/sim-models-flows.
