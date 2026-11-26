In short:

- A drawing's module name is no longer changed in its Properties: it is renamed with Rename… in the Design pane, its
  file, its HDL and its instances with it.

In detail:

- **A drawing's module name, read-only in its Properties (#5718):** the schematic's (the sheet's Properties), the ASM
  chart's, the state diagram's and the Petri net's module name is shown disabled, with the note "renamed with Rename…
  in the Design pane" (`web/js/module-name-field.js`; the circuit's was already disabled). Changed there it renamed
  the drawing alone: its HDL declared another module, and the hierarchy showed the module its parent instantiates
  "(missing)", with a red cross. The Design pane's Rename… (the MCP server's `rename_module`) renames the module, its
  file, its HDL and its instances together; no MCP tool sets a drawing's name through its properties. A System's Name,
  not a module's, stays editable. Tests: module-name-readonly (fails on the old code), asm-inspector and fsm-side, in
  both interfaces and in Portuguese.
