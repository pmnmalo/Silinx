In detail:

- **An architecture and data-model audit (#5902):** `docs/audits/2026-11-architecture-audit.md`, on main at
  c7e65829e: the layers and their dependencies, the device, board and family registries, the persisted documents and
  their versions, the toolchains, simulators, emulators, programmers and the System's co-simulation, the interface and
  its parity with the MCP server, the cost of adding a family, a board, a microcontroller or a link type, and cheap
  measurements of start-up, simulation, co-simulation and memory; an executive summary in Portuguese, findings rated
  with file and line references, the probable defects found, a target architecture (one registry per concept, the
  System's node contract made mandatory) and a staged roadmap. No code changed.
