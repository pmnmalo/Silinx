In detail:

- **The Boolean algebra's ⋮ menu without HDL Language (#4159):** the Boolean algebra editor keeps its Notation only,
  which lists VHDL and Verilog too; its HDL file's language is chosen in its Source Properties (and by the MCP's
  `set_source_properties`). The other drawings keep their HDL Language (#4063). Test: ui/drawing-language-menu, in
  both interfaces.
