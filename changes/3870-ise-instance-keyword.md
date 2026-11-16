In short:

- **Export Xilinx ISE Project: an instance named with a reserved word:** a schematic's instance named `reg`, `wire`,
  `signal`… (or an array of them, `reg(3:0)`) is written to ISE's schematic as `reg_1`, `reg_1(3:0)`, with a warning
  that says so, where ISE refused the project at its first step.

In detail:

- **ISE schematic export, instances named with a reserved word (#3870):** ISE's sch2hdl refuses a block named with a
  reserved word of Verilog ("is an illegal block name. It is a reserved word for verilog", in a VHDL schematic too).
  The export (`core/isesch-instnames.js`, called by `core/isesch-export.js`) writes an instance whose name, or an
  arrayed instance's base, is a word of Verilog-2005 or of VHDL, in any letter case, with `_1` after it (`_2` … when
  another instance has that name), as the import already names a keyword's copies, and warns
  `instance 'reg(3:0)' written as 'reg_1(3:0)': 'reg' is a reserved word of Verilog, which ISE's schematic refuses as a
  block's name`. The interface's Export Xilinx ISE Project and the MCP server's `export_project` share it. Tests: unit
  (`test/isesch-instnames.test.js`: every word of each language as a gate's name in a VHDL and a Verilog schematic,
  exported, its exact warning, read back with no warnings; another letter case; the names taken; an arrayed module's
  instance read back arrayed, its HDL compiled and elaborated with no warnings), `export_project`'s
  (`test/mcp-ise-array.test.js`), and ISE's (`test/ise/xise-interop.test.js`, the nightly's: `reg(3:0)` built
  by ISE's project flow as `reg_1(3:0)`, no warnings, and imported back).
