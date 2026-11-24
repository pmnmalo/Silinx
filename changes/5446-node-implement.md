In detail:

- A System's FPGA node implemented on its own board, the server and the MCP (#5446, roadmap #4695's phase 3; the
  interface next): core/system-node.js makes the node a project of its own (its module the top, its board's device,
  its constraints from its pins in the device's format, each pin with its board's resource's attributes, a clock's
  period); server/system-implement.js builds it by the Silinx toolchain in a folder of its own, build/nodes/<id>/ (the
  project's files copied there), the project's build/ and silinx.json not touched; every FPGA node one after another
  (Implement System, node '*'), a failed node said and the next one going on. POST /projects/:p/implement takes node;
  the MCP's run_process takes node (synthesize, implement, bitstream). Tests: system-implement (the uart-avr example's
  node's constraints the uart example's UCF line for line, the refusals, its bitstream the uart example's, the project
  untouched, Implement System, a second run refused), mcp-system-top (run_process node) (Part of #5446)
