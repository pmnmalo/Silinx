In short:

- **A drawing in a microcontroller node generates C:** in a System, a state diagram, an ASM chart, a Petri net or a
  truth table in an Arduino node whose language is C is an Arduino sketch (`<module>.ino`), made again as the drawing
  changes, as an FPGA node's drawing is its HDL. A schematic there is refused: it is hardware.

In detail:

- **A drawing's code by its node's base language (#5486):** `core/drawing-code.js` gives a drawing in a CPU node (C or
  C++) its sketch through the synchronous reactive model, and an FPGA node's or an FPGA project's drawing its HDL as
  before. `core/drawing-sync.js` (`syncDrawing`, `adoptDrawing`, `staleDrawings`) follows the drawing's node, so the
  interface and the MCP's `write_file`, `new_source` and the drawings' tools share it. A drawing whose HDL was made
  before its node was a C one gets its sketch instead. Its pins are its node's GPIO interfaces named as its ports, and
  its ports are the node contract's typed ports (#5485). A schematic, a circuit and a register map are refused in a CPU
  node by `write_file` and `new_source`, with their messages; a MicroPython node's drawing is said not made yet
  (#5487). A CPU node's C sources and drawings are its board's program: left out of the FPGA's design (the server's
  flows, the browser's compile and Implement) and refused by Silinx HLS's tools. `write_file`'s description says it, within the tool list's budget (#5520). Tests: drawing-code (the node,
  the pins, the sketch, the refusals, the warnings), mcp-cpu-drawing (write_file and new_source in the uart-avr
  example's C, C++, MicroPython and FPGA nodes, the exact messages; the HLS tools' refusal, the server's flow's
  sources), the UI's system-cpu-code (a CPU node's C no module of the design, its errors not the FPGA's Check Syntax's).
