In detail:

- **Co-design's System document and its check (#4697, roadmap #4695):** `core/system-doc.js` reads and writes a
  co-design project's System (`<name>.sys.json`, version 1): its FPGA nodes (a module of the project, its board and
  its ports' pins), microcontroller nodes (an Arduino Uno or Nano, its firmware) and serial terminals, their UART and
  GPIO interfaces and the links between them. `core/system-check.js` checks it: the nodes' ids, kinds, boards, modules
  and firmware; the interfaces' baud, frame, pins and directions (an FPGA's TX that is an input of its module: TX and
  RX crossed); the baud and the frame equal at both ends of a UART; a wire driven twice, a pin used by two links, an
  FPGA pin not on its board; warnings for a non-standard baud, a wire nothing drives, a 5 V output on a 3.3 V FPGA input
  and a node that joins nothing. The MCP server's `check_system` runs it with the project's modules (elaborated) and
  files. docs/CODESIGN.md and docs/PROJECT.md say co-design is a project kind (#5041), its System the top, its FPGA
  nodes modules of the project; New Project's co-design choice stays disabled until phase 1 is usable.
