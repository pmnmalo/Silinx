In short:

- **Systems:** the Design pane shows a System's nodes as branches under its System: an FPGA node with its board and
  its module's hierarchy, an Arduino with its firmware, a circuit node with its drawing, a terminal; each node's
  processes in the Processes pane.

In detail:

- A project's nodes from one function (#5414, roadmap #5416's phase 2): `core/project-nodes.js` `projectNodes`, an FPGA
  or a design and simulation project one implicit node (nothing written), a System project its System document's
  nodes, each with its board, its module and its files. The Design pane draws a System's nodes as branches
  (`web/js/design-system.js`; a node's file not among the project's other rows, nor among the Implementation view's
  files), a project with one node as before; the Processes pane gives the System's row View/Edit, Check and Emulate
  System, a node View/Edit System, an FPGA node its module's Check Syntax and RTL schematic
  (`web/js/system-processes.js`). The MCP's `project_info` gives the nodes (`nodes`, and a line of them for a System
  project). Tests: project-nodes (every kind, the examples), mcp-project-nodes, mcp-design-only (its node); the UI's
  design-system-nodes, both interfaces and Portuguese (Fixes #5414)
