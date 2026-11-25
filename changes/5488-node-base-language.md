In detail:

- **A System node's base language and its folder's layout (#5488, roadmap #5479's phase 2):** each node of a System
  document whose kind has sources has its base language, `lang`: VHDL or Verilog for an FPGA or a design node, C, C++
  or MicroPython for a microcontroller, its kind's default (VHDL, C) when not given; one not its kind's is refused when
  the document is read and by the edits. The MCP's `edit_system` adds and changes it (`add_node`, `change_node`),
  `check_system` says it (`node fpga: FPGA, module uart on basys2-250, in VHDL`), `project_info` gives it with each
  node, an FPGA or a design project's implicit node the project's preferred HDL. `core/system-layout.js` is the
  layout of nodes as folders, one module for the server, the web and the MCP server: a node's folder named by its id,
  its files' paths in it (a traversal through a node's id or a file's name refused), a path's node, the files
  grouped by node, and which languages mix in a node (VHDL with Verilog; C with C++ and assembly). The co-design
  examples' System documents carry their nodes' languages.
