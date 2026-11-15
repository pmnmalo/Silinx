In short:

- **Boolean Notation, conversions:** an HDL module, an ASM chart or a Petri net made a state diagram or an ASM chart
  writes its conditions in the notation of *Settings ▸ Boolean Notation*; the conditions of a diagram made again
  (its HDL edited) are kept as they were typed.

In detail:

- **The notation of the Boolean expressions shown, part 2 (#3915):** the conversions take a `notation`: fsmFromHdl,
  asmFromHdl, asmToFsm and petriToFsm write the conditions they make in it (core/cond-notation.js's showCond, moved
  out of core/expr-notation.js so that they read it without an import cycle), and keep those of the previous diagram;
  with none, as before. The interface passes the Settings' (Convert to State Diagram / ASM chart, a diagram made
  again from its HDL, an ASM chart's and a Petri net's state diagrams), the MCP server set_notation's
  (convert_module, convert_drawing, related_view's state diagrams). The machine is the same whatever the notation:
  its HDL the same (the Verilog notation's `~ & |` written as the bitwise operators), simulated in VHDL and Verilog.
