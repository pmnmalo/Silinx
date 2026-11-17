In short:

- **Circuits on an FPGA: a 7474 with its preset tied high synthesizes with no warning:** the digital model of a 7474's,
  7476's or 74112's flip-flop leaves out the preset or the clear the circuit ties high (or leaves open), so the open
  synthesis builds a flip-flop with a clear only (or a preset only) and no longer warns "Complex async reset"; it still
  warns for a flip-flop whose preset and clear are both driven.

In detail:

- **A flip-flop's tied controls left out of the digital model (#3975):** the 7474, 7476 and 74112 have the generics
  `USE_PRE1`, `USE_CLR1`, `USE_PRE2`, `USE_CLR2` (VHDL booleans, Verilog parameters, true by default), and their
  digital model (core/circuit-seq.js) a flip-flop for each combination (a VHDL if-generate, a Verilog generate if), with
  the preset and the clear, one of them, or neither. core/circuit-digital.js sets them on the instance: a control whose
  net is the supply's + or no one drives (a 74LS input reads it high) false, its port the constant '1'. The simulation's
  model is unchanged (the chip's). In Verilog a preset tied high used to stop the open synthesis with Yosys's "Multiple
  edge sensitive events" error (the front end's, #4332); now it is left out. docs/CIRCUITS.md follows. Tests: circuit-ff-controls (the instance's
  generics, the entity's generates, the open synthesis's exact warnings with the preset tied, the clear tied, both
  driven, the generated HDL compiled, checked and simulated against the engine, VHDL and Verilog).
