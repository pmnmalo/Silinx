In short:

- Run PS Program: a Zynq board's PS program loaded over JTAG and started on its Cortex-A9, by the user's OpenOCD.

In detail:

- **Run PS Program (#4687, part 3b):** a Zynq's PS program, the ELF Compile PS Program made, is loaded over the board's
  JTAG and started by the user's OpenOCD (`server/zynq-ps-run.js`; config.json's `paths.openocd`, the PATH or Homebrew's
  folders; Silinx does not install it, and says so when it is missing). Its Tcl is written from the same checked plan as
  Silinx's own engine (`core/zynq-ps-openocd.js`) and refused the same way before OpenOCD runs. Also refused first: no ELF,
  an ELF older than its sources, an untrusted project. It is a process of the Design pane's PS row, of a Zynq node's row and
  of a Board project's `ps/` files, and the MCP's `program_board` with `ps`; `toolchain_info` says whether OpenOCD is
  found. Tests: `test/zynq-ps-openocd.test.js` (the script's writes against the engine's, on two simulated chips),
  `test/zynq-ps-run-server.test.js` (a stand-in OpenOCD), `test/ui/zynq-ps-compile.test.js`.
