In detail:

- **The System's check with typed ports (part of #5485):** `core/system-check.js` makes each node's resolved pins its
  typed ports (a direction, a kind: an FPGA's and a microcontroller's pins, a terminal's UART a transaction bus's; a
  level: the board's I/O voltage, the FPGA bank's standard, for #5498), checks each wire's ends against its link's kind
  (`core/system-links.js` endsProblem) and gives them (`analyzeSystem`'s `ports`, each wire's ends' `kind`); the MCP's
  `check_system` gives them too (`ports`, its wires' ends' `kind`). The check's errors and warnings unchanged. Tests:
  system-check (the ports of each node, their levels, the wires' kinds, the System's link kinds those of a link type),
  mcp-system (check_system's ports).
