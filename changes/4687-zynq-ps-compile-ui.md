In short:

- Compile PS Program: a Zynq board's processing system's program compiled from the Design pane (its PS row, a Zynq
  node's row, a ps/ file), on the local server.

In detail:

- **Compile PS Program in the interface (#4687, part 2):** the Processes of the Design pane's PS row, of a System's Zynq
  node's row and of a Board project's `ps/` files on the Zybo Z7 or the Arty Z7 have Compile PS Program
  (`web/js/zynq-ps-ui.js`). It runs the local server's job (`POST /projects/:p/ps`, the MCP's `run_process ps`): its
  lines are in the console, its errors and warnings by file and line. The browser edition says a server is needed
  (#5904). Tests: `test/ui/zynq-ps-compile.test.js` (both interfaces, Portuguese, the browser edition).
