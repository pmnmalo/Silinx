In short:

- **KiCad parts in the circuit editor:** the Parts panel lists a project's KiCad parts (its `parts/` folder) and
  places them; their Part info says their KiCad symbol, part number, datasheet, source and licence. **Import KiCad
  Part…** copies a `.kicad_sym` or a `.kicad_mod` into the project, showing what each symbol is (as which IC, drawn
  only, or not a part) as its model, family and footprint are set.

In detail:

- **The circuit editor's KiCad parts (#4281, #4278):** a circuit opened reads its project's KiCad parts. The Parts panel
  lists them last (*KiCad parts (project)*), by part number and description. The canvas draws a part that behaves as an IC
  as that IC under its own number, and a part drawn only with a dashed body. The Part info adds the KiCad symbol and file,
  the part number, the datasheet (a link), the footprint, the source, author and licence.
- **Import KiCad Part… (#4281):** the Parts panel's dialog picks a `.kicad_sym` or a `.kicad_mod`, lists a library's
  symbols with what each one is, and lets each one's Model, Family and Footprint be set, with the source, author and
  licence given once. It imports the file as the MCP's `import_part` does (`core/kicad-import.js`, the same checks and
  messages), each symbol said in the console. Every label is in Portuguese too.
