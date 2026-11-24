In short:

- **Systems:** an FPGA node of a System is synthesized, implemented and its bitstream made on its own board, from its row
  in the Design pane; Implement System does every FPGA node.

In detail:

- A System's FPGA node implemented from the interface (#5446, roadmap #4695's phase 3, part 2): its row's
  Synthesize, Implement Design and Generate Programming File, and the System's row's Implement System, run the local
  server's job (server/system-implement.js) as a run of its own in the console (web/js/system-implement-ui.js); the
  browser edition says it is the local server's for now. The user's guide (EN, PT). Tests: the UI's system-implement
  (the uart-avr example's FPGA node synthesized, built in build/nodes/fpga/; Implement System; Portuguese; no
  warnings), design-system-nodes (the node's and the System's processes), both interfaces (Fixes #5446)
