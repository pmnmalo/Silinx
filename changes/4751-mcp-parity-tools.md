In short:
- An AI assistant can program, verify, back up and erase the board's PROM, scan its JTAG chain, read the bitstream's
  header and see what Toolchain Settings found, as iMPACT's window and Toolchain Settings show them.

In detail:
- The MCP server's new tools (#4751): `program_prom` (the Platform Flash PROM: program, verify, read a backup, erase,
  reconfigure), `jtag_scan`, `bitstream_info` and `toolchain_info` (read only: ISE's mode, whether ISE and Vivado can run and
  why; never a host, a user or a path). They go through the server's functions iMPACT's window calls
  (server/impl-routes.js `startProm`, `startScan`, `bitInfo`), with the same checks.
- Toolchain Settings has no tool that writes: this computer's settings are the user's, as trusting a project is (#2830).
  core/mcp-parity.js lists every menu action with its MCP tools or the reason it has none, and a UI test walks the menus
  in both interfaces (#4751).
- core/tool-descriptors.js (moved from web/js/): the MCP server's `run_process` processes and the simulation models each
  flow makes come from it, as the interface's; a Zynq the Silinx toolchain does not implement no longer claims its two
  models (#4751).
- New Source's text is made by one function, core/new-source-text.js, for the interface and `new_source` (#4751).
