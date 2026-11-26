In short:

- A copy from a read-only document pastes into another: a read-only HDL file's text (its context menu's Copy), a
  read-only schematic's selection (Edit ▸ Copy, the toolbar, Ctrl+C); the text of a read-only drawing's Properties
  (a name, a condition, an output's expression) and of a module's name is selected and copied.

In detail:

- **A read-only HDL file's copy pasted elsewhere (#5732):** the text editor's context menu's Cut, Copy and Paste go
  through the app's clipboard, as Edit ▸ Cut / Copy / Paste do (#677): a copy from the HDL generated from a drawing
  pastes into another HDL file by Edit ▸ Paste, the toolbar and the context menu's Paste, which no longer refuses it
  with "Use Ctrl+V to paste" when the browser's clipboard cannot be read; its Paste and Cut are disabled when there is
  nothing to paste or the file is read-only.
- **A read-only schematic copied (#5733):** its selection copied by Edit ▸ Copy, the toolbar's Copy and Ctrl+C (a
  drawing saved by a newer Silinx, a followed project's, a truth table's or a state diagram's schematic, a symbol's
  composition); Cut, Paste and Delete still refused there. Tests: the UI test clipboard-readonly, both interfaces.
- **Every read-only document copied (#5736):** a read-only ASM chart's Edit ▸ Cut, Paste and Delete disabled (they
  were enabled and did nothing); the side panels of a read-only ASM chart, state diagram, Petri net, circuit, System
  document, register map, pin planner and symbol make their text fields read only, not disabled, so that their text is
  selected and copied (`web/js/lock-fields.js`, as the schematic's Properties did), their other fields disabled and
  drawn as before; the module name's field (#5718) and the circuit's Name read only too. docs/UI-GUIDELINES.md says
  so. The state diagram, Petri net and circuit already copied their objects, the truth table its fields, the text
  views, reports and the console their text. Tests: the UI test clipboard-readonly-drawings (the ASM chart, the state
  diagram, the Petri net and the circuit read only, copied by the menu, the toolbar and the keys and pasted into
  another; a side panel's field copied, a register map's and a truth table's), both interfaces; the read-only tests
  that asserted disabled fields accept read-only text fields.
