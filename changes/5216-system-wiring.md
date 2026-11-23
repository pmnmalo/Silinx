In short:

- **The System's wiring:** Wiring in the System editor shows each link pin by pin, from one board's pin to the
  other's, with its levels; a 5 V output on a 3.3 V input drawn in orange.

In detail:

- **The System editor's Wiring view (#5216):** its Wiring button draws each link as a band, its two nodes facing each
  other, a row per wire: its signal, the pin at each end (an FPGA's port and package pin, the board's label of the
  pin as its tip), the levels, an arrow towards the input; a wire the check warns of is hot, its warning its tip. Read
  only: the tools that edit are hidden, a wire's click selects its link (web/js/system-wiring.js). Its wires are the
  check's (core/system-check.js analyzeSystem, wiringLines); the MCP server's check_system says them, a line each, and
  gives them in its data (`wires`). The user's guide (EN, PT), docs/CODESIGN.md.
