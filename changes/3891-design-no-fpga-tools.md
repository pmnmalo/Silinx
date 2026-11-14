In short:

- **No FPGA tools in a design and simulation project.** No Toolchain Settings, no RTL Schematic, no Xilinx ISE
  export, no Language column in Files, no Xilinx library equivalents in the Symbol Info; its Implementation view is
  called Design.

In detail:

- **A design and simulation project without HDL, part 5 (#3891):** in a design project, Settings, Tools and the
  toolbar's gear have no Toolchain Settings; Tools, a module's menu and the Processes no (View) RTL Schematic; View and
  the Design pane call the Implementation view Design; Export Project exports a Silinx project, with no software to
  choose; the Files tab has no Language column; a symbol's Symbol Info no Xilinx library equivalents; Design Checks'
  message names Check Design. The MCP server's `export_project` makes a Silinx project there by default and refuses
  a Xilinx ISE one. Set as Top Module, the About dialog and the console's first line (the application's) stay.
