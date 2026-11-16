In short:

- **Try it runs a KiCad part's VHDL or Verilog model:** a part whose `Silinx.HDL` names a module of the project is
  simulated live in the circuit editor, as its HDL simulates it.

In detail:

- **A KiCad part's module run live (#4284, #4278):** `core/circuit-live-model.js` gives each such part a copy of its
  module of its own in Silinx's HDL simulator. The circuit's simulation (`core/circuit-sim.js`) forces the part's
  input levels on the module's inputs, runs it a step, and drives its outputs' levels after the part's delay (10 ns),
  its registers keeping their state. The live run and the generated HDL's simulation agree vector by vector (an
  inverter and a toggle flip-flop, VHDL and Verilog); a flip costs about what a 7404's does.
- **A module that cannot run live (#4284):** its elaboration's errors, or a `$finish` or a failure as it starts, are said
  by Check Circuit and `simulate_drawing` ("U1 (TEST-INV): its module test_inv cannot run in Try it: its simulation
  stopped (finish)"), and its pins drive nothing. The warning "Try it does not run it" of #4283 is gone.
- **Where:** the editor's Try it and Check (the project's compiled HDL), the MCP's `check_drawing`, `edit_circuit` and
  `simulate_drawing` (`core/drawing-sync.js` `projectHdl`).
