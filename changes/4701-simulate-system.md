In detail:

- **Co-design: Simulate System (#4701):** the System editor's Simulate opens its simulation view under the canvas: Run,
  Pause, Run 100 ms and Restart run the whole System together, in a Web Worker (the FPGA nodes' modules compiled by
  Yosys for the compiled engine at their board's clock, the Arduino's firmware, a .hex, run by avr8js, a serial terminal
  for each terminal node, its line typed sent with Enter); the link inspector shows each wire's decoded bytes (a UART's
  at its baud and frame) with their times, Waves the whole System's waves in the waveform viewer (a scope a node, and the
  links). The nodes' and the decoders' warnings are in the console. The MCP server's `simulate` runs a System (`top`: its
  .sys.json, a co-design project's by default) for a time and gives each wire's bytes, the terminals' text and the warnings, its waves written to `build/<name>.vcd`
  (core/system-build.js, core/system-run.js, core/system-host.js, core/system-sim-terminal.js). avr8js is served to the
  page and the worker, and bundled in the browser edition.
