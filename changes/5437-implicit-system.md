In detail:

- Any project's System, read only (#5437, roadmap #5416's phase 3): `core/project-system.js` `projectSystem` gives the
  model of a System document for every project: a System project's own document; an FPGA or a design and simulation
  project's implicit one, derived from its silinx.json with nothing written (no .sys.json), one node (its board and the
  board's variant for its device, its device, top module and constraints as silinx.json says them) and no link.
  `core/project-nodes.js` reads its nodes from it; the MCP's `project_info` gives it (`system`). Nothing changes on
  disk nor in the interface. Tests: project-system on the repository's whole corpus (every silinx.json: the examples,
  the test designs, the exercises, the fixtures; the ISE projects imported; the old kind id), each one's check asserted
  and every file's bytes the same before and after; mcp-project-nodes (its System), mcp-design-only (Fixes #5437)
