In short:

- **A schematic symbol's datasheet over MCP.** The MCP server's `symbol_info` gives what the Symbol Info dialog shows:
  the description, pins, parameters, truth or mode table, Xilinx equivalents and equivalent VHDL and Verilog.

In detail:

- **The MCP server's Symbol Info (#3935):** `symbol_info` (server/mcp-symbol-info.js) makes a symbol's datasheet through
  the dialog's functions (core/symdocs.js `symbolDoc`, core/symtables.js `truthTable`): the symbol by its palette,
  Xilinx library or computed name (M4_1, FDCE, AND2), its type or a project module, its parameters changing it, in
  English or Portuguese; a device primitive's resource on the project's device. In a design and simulation project
  (#3891) no HDL, no Xilinx equivalents, no device primitive nor HDL BLOCK.
