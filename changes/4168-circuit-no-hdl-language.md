In detail:

- **The digital circuit's ⋮ menu without HDL Language (#4168):** the Digital Electronic Circuit editor's ⋮ menu keeps
  its Wires and Wire crossings; its HDL file's language is chosen in its Source Properties (and by the MCP's
  `set_source_properties`), as the Boolean algebra's (#4159). The schematic, state diagram, ASM chart and Petri net keep
  their HDL Language (#4063). Test: ui/drawing-language-menu (the circuit in Verilog and back through Source
  Properties), in both interfaces.
