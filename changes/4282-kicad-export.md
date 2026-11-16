In short:

- **Export to KiCad:** the circuit editor's ⋮ menu writes the library's ICs as a KiCad symbol library (.kicad_sym),
  and the project's KiCad parts as a KiCad package (.zip), to use in KiCad or in another Silinx project.

In detail:

- **The library's ICs as KiCad symbols (#4282, #4278):** `core/kicad-export.js` writes each of the 48 ICs as a KiCad
  symbol at KiCad 9's file version. A gate IC has a unit per gate and a unit of its supply; an MSI or sequential IC has
  one unit. The pins sit on the 2.54 mm grid, an active low one named `~{CLR}`, with a DIP footprint and its behaviour
  in `Silinx.Model` and `Silinx.Family`. Silinx reads every one of them back as that IC, by its properties and by its
  part number alone.
- **A project's KiCad parts as a PCM package (#4282):** a `.zip` with the PCM schema's required metadata, the project's
  `parts/` files as they are and, ticked, the library's ICs.
- **The editor's ⋮ menu (#4282):** Export ICs as KiCad Symbols… (all of them, or this circuit's) and Export Parts as
  KiCad Package…, downloaded, their lines in the console. Portuguese too.
- **MCP (#4282):** `export_part`, to the exchange folder.
