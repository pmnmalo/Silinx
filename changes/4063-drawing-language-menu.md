In short:

- Every drawing's ⋮ menu (schematic, Boolean algebra, state diagram, ASM chart, Petri net, digital circuit) chooses its
  HDL language: the project's Preferred Language, VHDL or Verilog; the circuit's Properties no longer show it.

In detail:

- **A drawing's HDL language in its ⋮ menu (#4063):** an *HDL Language* choice in the ⋮ menu of the schematic, Boolean
  algebra, state diagram, ASM chart, Petri net and circuit editors (`web/js/drawing-lang-menu.js`): Preferred Language
  (the drawing follows the project's), VHDL or Verilog, the ✓ on the drawing's; the same choice as Source Properties'
  (`setSourceLanguage`, the project's `sourceLanguage`, the MCP's `set_source_properties`): the HDL file made again in
  that language. None in a design project nor in a read-only view. The circuit's Properties lose their read-only HDL
  language field; an open circuit follows a language change. Tests: UI `drawing-language-menu` (new; every drawing,
  the circuit in Verilog and back, a design project, Portuguese) and the editors' menus' tests, in both interfaces.
