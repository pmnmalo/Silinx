In short:

- **KiCad parts in a circuit:** a project's KiCad symbol libraries (in its `parts/` folder, kept as KiCad wrote them)
  are parts of its circuits. A symbol whose part number is an IC of the library (SN74LS00N, 74HC00, CD4011BE) is
  simulated as that IC; any other is drawn only. The MCP's `import_part` copies one in.

In detail:

- **A project's KiCad parts (#4280, #4278):** the `.kicad_sym` libraries, `.kicad_symdir` folders and `.kicad_mod`
  footprints of a project's `parts/` folder are its circuits' parts, named `parts/<library>.kicad_sym#<symbol>`.
  Nothing converted is stored: they are read again whenever a circuit is (`core/circuit-kicad.js`). A symbol behaves
  as an IC of the library when its part number is one or its property `Silinx.Model` names one, and its pins are that
  IC's, pin by pin. It is then simulated, checked and made into HDL as that IC, under its own name; `Silinx.Family`
  makes its inputs another family's. Any other symbol is drawn only: its pins on its footprint's places (a `.kicad_mod`,
  a DIP's or a pin header's name), not simulated, with Check Circuit's warning "U2 (TEST-SENSOR) is drawn only: it is
  not simulated and its pins drive nothing". A symbol with no through-hole footprint is no part, its reason said.
- **What KiCad has no field for, in the symbols' properties (#4280):** `Silinx.Model`, `Silinx.Family`,
  `Silinx.Footprint`, `Silinx.Source`, `Silinx.Author` and `Silinx.Licence` are written in the library's text
  (`core/kicad-edit.js`), the rest of the file as it was, so the file stays valid in KiCad.
- **MCP (#4280):** `import_part` copies a library or a footprint of the exchange folder into `parts/`, writes the
  properties given and says each symbol (as which IC, drawn only, or no part and why). `circuit_parts` with a project
  lists its KiCad parts and the symbols that are no part. `edit_circuit`, `check_drawing`, `simulate_drawing`,
  `related_view` and the drawings' HDL files take them.
