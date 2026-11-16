In short:

- No editor's ⋮ menu has an HDL Language any more: a drawing's HDL language (schematic, state diagram, ASM chart,
  Petri net, Boolean algebra, circuit) is chosen in its Source Properties, as before 15.26.0.

In detail:

- **A drawing's HDL language in Source Properties only (#4240):** the *HDL Language* choice #4063 put at the end of the
  drawings' ⋮ menus (Preferred Language, VHDL, Verilog) is gone from the schematic, state diagram, ASM chart and Petri
  net editors too (the Boolean algebra and the circuit lost it in #4159 and #4168): Source Properties choose it (the
  project's `sourceLanguage`; the MCP's `set_source_properties`, unchanged). `web/js/drawing-lang-menu.js` and the
  editors' `menuItems` that only carried it are removed; the state diagram's Try it lock keeps its own choices.
  `toolbar-menu.js` is no hub of `scripts/related-tests.mjs` any more (14 importers). Tests: UI
  `drawing-source-language` (was `drawing-language-menu`: no menu has it; a schematic, a state diagram and a circuit in
  Verilog and back by Source Properties; Portuguese; no warnings), the editors' menus' tests, in both interfaces.
