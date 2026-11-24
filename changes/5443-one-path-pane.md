In detail:

- The Design pane and the processes on one path for every profile (#5443, roadmap #5416's phase 5, part 1): the pane's
  top row comes from the project's nodes (web/js/design-system.js topRow: a System's row with its nodes' branches, or
  the one implicit node of an FPGA or a design project drawn as its device row, as before); a module of a System's
  FPGA node, its System the project's top, gets its node's processes (Check Syntax, View RTL Schematic, its drawing
  opened), no longer the FPGA flow on the project's default device, which is not its node's board (implementing a node
  on its board: docs/SYSTEMS.md's phase 3). The MCP's run_process says why it refuses the flow in such a project
  (core/system-top.js systemFlowRefusal). Tests: the UI's design-system-nodes (the module's processes), the Design
  pane's and the processes' tests unchanged, both interfaces; mcp-system-top (the refusal) (Part of #5443)
