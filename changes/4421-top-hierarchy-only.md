In short:

- **A broken module the top does not use no longer stops the top's runs:** Synthesize, Implement Design, Generate
  Programming File (the Silinx toolchain, ISE and Vivado), the Board Emulator and the test bench's simulation read only
  the top's hierarchy, as ISE does; a file with errors outside it is left out, a warning saying so. Check Syntax still
  shows every file's errors.

In detail:

- **The runs of the top check and compile only its hierarchy (#4421):** `core/top-hierarchy.js` finds the files the
  top needs (the modules it instantiates, transitively, the generated HDL of drawings among them, their architectures'
  files, the packages they use, the files they include); a file with errors none of them is, nor declaring a module the
  hierarchy misses, is left out of the Check Syntax a run starts with (Implement Design's processes, the Board Emulator,
  a simulation), of the Silinx toolchain's sources in the browser, and of the build folder of the server's three
  toolchains (`server/ise.js` generateBuild: ISE's .prj, Vivado's sources, the Silinx toolchain's), with the warning
  "<file> is not in the hierarchy of the top module '<top>': left out, its N errors not checked (Check Syntax shows
  them)". A file with errors inside the hierarchy still stops the run. A clean file outside it is still read. The MCP
  server's `run_process` and `simulate` the same; Check Syntax (of a file, of a module, `check_syntax`) unchanged.
