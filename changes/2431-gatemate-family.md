In short:

- **The Cologne Chip GateMate:** a family of the Silinx toolchain, its CCGM1A1 and CCGM1A2, and Cologne Chip's GateMate FPGA
  Evaluation Board (and the board + VGA): synthesis, place & route and the bitstream (`<top>.bit`, gmpack's) in the browser
  and locally, its constraints a CCF, its timing nextpnr's, the Board Emulator on its pins. Silinx does not program its
  board: openFPGALoader (`-b gatemate_evb_jtag`) loads the `.bit`, outside Silinx. Every example builds on the board.

In detail:

- **The GateMate family (#2431):** `FAMILY_INFO.gatemate` (constraints CCF, bitstream `.bit`), the CCGM1A1 and CCGM1A2 in the
  device database (core/devices-gatemate.js: Cologne Chip's DS1001 and nextpnr's counts, no speed grade), its profile and the
  interface's tool, SILINX_GATEMATE (no simulation model yet, no Configure Target Device); the CCF in New Source, Import
  Source, Check Syntax, Check Constraints (a pin that is no GPIO of the FBGA324, a DRIVE or a SLEW nextpnr has not), the CCF
  Wizard, I/O Pin Planning and Update Constraints; the Design Summary's reports (the routed design Project Peppercorn's
  configuration); the browser edition's worker; `@yowasp/nextpnr-himbaechel-gatemate` 0.11.825 downloaded on first use as the
  other families' nextpnr (4 MB packed), an optional peer of silinx-fpga now; the server refuses programming a GateMate's board
  with the reason, the MCP server's program_board too. The MCP server: list_devices, set_design_properties, new_source,
  check_constraints, run_process, get_report.
- **Cologne Chip's GateMate FPGA Evaluation Board (#2431):** its pins from LiteX's colognechip_gatemate_evb.py (after Cologne
  Chip's DS1003): the 10 MHz clock, eight LEDs and a button (active low); the examples' LEDs, switches and buttons on the
  headers of its banks NA and SA, a UART on SA's, the seven-segment display on its Pmods, vga's VGA on them
  (gatemate-evb-vga); none verified on a board. Every example builds on it (test/examples-gatemate.test.js), the 10 MHz met,
  its warnings asserted (micro80's Yosys's of its RAM's port; uart's two crashes of nextpnr's after its placement, a WebAssembly
  trap, placed and routed again with the next seed), each bitstream read back by gmunpack as nextpnr's configuration.
