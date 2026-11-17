In short:

- **Simulate Post-Synthesis and Post-Place & Route on the iCE40 and the ECP5.** Their flows make both simulation models
  again (hidden since #3707), the Gowin's the Post-Synthesis one: Simulate and Emulate them as on the Spartan boards.

In detail:

- **The iCE40's, ECP5's and Gowin's simulation models (Part of #2299):** Generate Post-Synthesis Simulation Model writes the
  family's synthesis's netlist, and Generate Post-Place & Route Simulation Model nextpnr's routed design (its `--write` JSON
  through Yosys's `write_verilog`), as `build/netgen/synthesis/<top>_synthesis.v` and `build/netgen/par/<top>_timesim.v`
  (core/flow-models-nextpnr.js, core/netlist-verilog.js): the design synthesized with the generics the test bench gives it
  (declared as the netlist's parameters), placed and routed as Place & Route does it, the board's model beside it. Each simulates
  with Silinx's models of the family's cells, the routed design's packed ones too (ICESTORM_LC, ICESTORM_RAM, TRELLIS_COMB,
  TRELLIS_RAMW, TRELLIS_FF's SD, the pins' `*MUX` generics), without timing; the global buffers are left out of the model and
  each pad gets a net of its own (#4360). The Simulate / Emulate Post-… rows and the model choices are shown for them (the
  Gowin's Post-Synthesis only: its routed design's ALU modes are not modelled yet); simulate and run_process accept those
  models and refuse the others with what the flow makes. Tests: ice40-routed and ecp5-routed (every example's post-place &
  route model passes its test bench, no warning), netlist-verilog, ice40-prims, ecp5-prims (the packed cells), mcp-ice40,
  mcp-ecp5, mcp-gowin (run_process and simulate of the models), mcp-simulate-models, tasks, tool-descriptors,
  test/ui/sim-models-flows.
