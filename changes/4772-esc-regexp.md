In detail:

- **One RegExp escape (#4772):** `escRegExp` in core/escape.js replaces the copies of eight modules (the C test bench's
  files, Find, the ISE schematic's blocks, the netlist's Verilog, a part's function, the .xise project, Vivado's
  constraints, the CI's failure report); the copies left are listed in test/ident-escape.test.js, each with its reason.
