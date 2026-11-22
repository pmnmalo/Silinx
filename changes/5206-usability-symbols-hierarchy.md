In detail:

- **Usability tests of symbols and hierarchy (#5206, its fourth phase):** `test/usability/symbols.test.js` takes a
  module (a 2-to-1 multiplexer, in VHDL and in Verilog) through a person's steps. Edit Symbol of its row in the Design
  pane makes its default symbol. In the Symbol Editor a pin goes to the bottom by its Side, one moves with Later ▶, the
  body is made wider, and the symbol is saved. The module is placed in the top's schematic from its palette, with a
  wire from each pin to an I/O marker. Its instance is double-clicked to open its HDL, where a port is renamed and one
  added (the lines typed). In the Symbol Editor again the new pins are added and the old one dropped (said in the
  console), one pin moves with ◀ Earlier and one is dragged. Update Symbol in the schematic: the wires on the pins kept
  follow them, the renamed pin's wire is left unconnected, Check Schematic's warnings are exact, and the new pins are
  wired. `test/usability/hierarchy.test.js` goes down a top schematic (Verilog) to a schematic module (VHDL) and to its
  Verilog module, where a port is added, then back up by the tabs. Each level is updated (the module is also used in
  the top) and saved, and its HDL is made again and elaborated with the hierarchy below it.
- After every step: the schematic's invariants; its HDL in VHDL and Verilog compiled with the modules below it and
  elaborated; the symbol's pins the module's ports (the project's files on disk, `lib/hier-kit.js`); the instances up
  to date once updated; the console's lines, exactly; the Design pane's hierarchy. Each editor is undone to the start
  and redone to the end. In both interfaces and in Portuguese, about a minute and a quarter a configuration.
- New helpers: `lib/sym-actions.js` (the Symbol Editor's kit) and `lib/hier-actions.js` (an instance double-clicked,
  a tab, Update Symbol, a line of HDL replaced).
- The bugs found are todos: #5277 (Update Symbol's "not connected any more" flashed on the canvas, not said in the
  console) and #5278 (a pin moved along the bottom drags its wire over its I/O marker's body).
