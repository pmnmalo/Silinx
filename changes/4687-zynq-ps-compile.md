In detail:

- **A Zynq board's PS program compiled (#4687, part 1):** the C and assembly of a System Zynq node's `ps/` (or a Board
  project's `ps/` on the Zybo Z7 or the Arty Z7) are compiled and linked by the local server's `arm-none-eabi-gcc` (the
  user's Arm GNU Toolchain: config.json's `paths['arm-none-eabi-gcc']`, the PATH, Homebrew's or Arm's installer's folders).
  The program runs bare metal on CPU 0 in the on-chip memory, with Silinx's startup code and linker script (the OCM's low
  192 KB) unless `ps/` has its own. Its ELF goes to `build/nodes/<id>/ps/out/` (`build/ps/out/`) and is checked to be in the
  OCM (`core/elf32.js`, `core/zynq-ps-compile.js`, `server/zynq-ps-compile.js`). The compiler's errors and warnings are given
  by the project's file and line, and the OCM overflowing is said as such. The MCP's `run_process` has the process `ps`
  (the node's id in a System), and `toolchain_info` says whether arm-none-eabi-gcc is found. Loading the ELF over JTAG and
  the interface's Compile PS Program follow. Tests: `test/elf32.test.js`, `test/zynq-ps-compile.test.js` (Silinx's startup
  and the starter program compiled for the Cortex-A9 by the host's clang with no warning; linked by arm-none-eabi-gcc where
  it is installed), `test/zynq-ps-compile-server.test.js` (a stand-in compiler).
