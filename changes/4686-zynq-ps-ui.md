In short:

- A Zynq board's processing system in the interface: on the Zybo Z7 or the Arty Z7, New Source's PS Program (Zynq)
  writes the Cortex-A9's starter program in `ps/`, and a System's FPGA node on one has its PS program in its Properties
  (New PS Program); the Design pane shows the PS with its program.

In detail:

- **A Zynq board's processing system in the interface (#4686, part 2b):** a Board project on a Zynq board has New
  Source's PS Program (Zynq) (none on another board), a .c of `ps/` with its starter, the first one the project's `ps`;
  the MCP's new_source has the same type, `ps`, with the same refusals. A System's FPGA node on a Zynq board has a PS
  program field in its Properties (its folder's `ps/` C files) and New PS Program (`<id>/ps/main.c`), its starter
  written when the System is saved, as edit_system writes it. The Design pane shows a PS (Cortex-A9) row with its
  program, in Board mode and under the node in a System. A PS's C is not a Silinx HLS source (`core/drawing-code.js`
  inCpuNode: a Board project's `ps/`, a System's Zynq node's `<id>/ps/`, part 2a's too). Tests:
  `test/zynq-ps.test.js`, `test/mcp-zynq-ps.test.js`, `test/ui/zynq-ps.test.js` (both interfaces, Portuguese).
