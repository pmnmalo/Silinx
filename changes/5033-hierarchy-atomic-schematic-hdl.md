In short:

- The Design pane no longer lists a flip-flop of a schematic as a sub-module. A composition's rows read [Schematic],
  and in an FPGA project they have their HDL badge too, opening that level's HDL.

In detail:

- **The Design pane's composition rows (#5033, after #4984):**
  - An atomic symbol's block (a flip-flop's, FDCE…: #4806's D2) is not a row, as a gate is none.
  - A composition's base badge is [Schematic]: each level is one.
  - In an FPGA project each row also has its HDL badge, dashed: the level's HDL as generated from its drawing, in the
    schematic's language, read-only (`openCompositionHdl`), its notice linking to the drawing. A design and simulation
    project has no HDL badge (#3780).
