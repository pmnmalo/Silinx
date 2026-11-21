In detail:

- **"Does this file define module X", one copy (#4772):** core/hdl-defines.js `definesUnit` (outside comments, a
  declaration starting its line; VHDL's names in any letter case, Verilog's as written, `macromodule` too) for the
  drawings' HDL files, the schematic's live simulation, the exported .xise project's top and the board's generics. The
  .xise top no longer takes an entity named only in a comment (its architecture was then the wrong file's), and the
  board's generics find a top declared as a `macromodule`.
