In detail:

- **A Zynq board's processing system in a System (#4686, part 2):** an FPGA node on a Zynq board (the Zybo Z7, the Arty
  Z7; Pedro's model: no node kind of its own) has a PS program, its `ps`: a C file of its folder's `ps/`
  (`core/zynq-ps.js`), kept by the System document, renamed with its node, refused on a board with no processing system
  or out of `ps/`; the System's check says a program the project has not and a PS that cannot be set up; its
  description says the PS (its program, the Cortex-A9's clock, its UART's MIO pins, FCLK0); the PL's build leaves `ps/`
  out. The MCP's edit_system sets it (`fields.ps`), writing its starter program when the project has none: bare-metal
  C, its UART at 115200 baud from the clocks of Silinx's ps7_init, the Zybo Z7's LD4 blinking. A Board project on a
  Zynq board reads its silinx.json's `ps` (`ps/main.c`) the same way. The interface's part (the node's PS in its
  Properties and the Design pane, Board mode's) follows. Tests: `test/zynq-ps.test.js` (the starter compiled by the
  host's C compiler, no warning), `test/mcp-zynq-ps.test.js`.
