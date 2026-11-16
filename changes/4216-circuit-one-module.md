In short:

- A digital circuit is one module of the project: its chips no longer show as rows of the Design pane nor as modules to
  pick (Instantiate module, a test bench's module to test, the schematic's symbols).

In detail:

- **A digital circuit one module of the project (#4216):** its generated HDL holds the circuit's module and one of each
  of its ICs (`<circuit>_sn74ls47`…), which only the circuit instantiates; they were taken for modules of the
  project: a row under the circuit in the Design pane, an entry of the module pickers, and in the MCP server the Test
  Bench Wizard's default module to test (a test bench of the 7447 rather than of the circuit), the Constraints
  Wizard's, `rename_module`'s, `convert_module`'s and the schematic's modules. A circuit's HDL is known by its header
  (`core/circuit-modules.js`) and its ICs' modules left out of those lists (their names still taken); synthesis and
  simulation compile the file as it is. Nothing was stored in the project: one that has them is right once it opens.
  Tests: `circuit-modules` (new: every assembly and an older circuit, VHDL and Verilog, compiled and elaborated with no
  warnings; the MCP's tools), UI `circuit-modules` (new: the Design pane's rows, the Test Bench's Associate Source, no
  warnings, both interfaces).
