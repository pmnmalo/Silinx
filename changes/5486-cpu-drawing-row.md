In short:

- **A microcontroller node's drawing on the Design pane:** in a System, a state diagram, an ASM chart, a Petri net or a
  truth table in an Arduino node has its row, named after its module: its drawing's badge, then `[C]`, which opens the
  sketch generated from it. A drawing with errors has its `[C]` marked, and its tip says why.

In detail:

- **A CPU node's drawing's row (#5486):** `web/js/design-cpu.js` gives a drawing in a System's CPU node its Design pane
  row under its node (#5488's grouping): its module's name, its drawing's badge first (the base, Open), its node's
  language's last (`[C]`, `[C++]`: its sketch, `<module>.ino`, opened from it; marked when not made, its errors in its
  tip, or not made again since; a MicroPython node's not made yet, #5487), the drawings first, the sketch no row of its
  own, the drawing no longer listed twice. When the project is opened, a CPU node's drawing with no sketch gets it through
  `core/drawing-sync.js`'s `adoptDrawing`, as the MCP's tools do (no HDL file, nothing added to the FPGA's design's
  sources). Portuguese. Tests: the UI's design-cpu-code (the row, its badges and their tips, the sketch made on opening
  and opened from `[C]`, a drawing with errors, no HDL file and no source added, Portuguese; both interfaces) and
  design-system-groups (the drawing's `[C]` its generated C, failing on main since PR 5532, #5536).
