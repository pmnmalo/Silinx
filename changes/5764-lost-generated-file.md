In short:

- A drawing written or imported through the MCP with a `generatedFile` that is not there gets its HDL file, and says so,
  as the interface does when it reads the project.

In detail:

- **A drawing whose HDL file is missing (#5764):** `adoptDrawing` (core/drawing-sync.js: the MCP's `write_file`,
  `import_source`, `import_project`) takes a drawing whose `generatedFile` is not in the project folder, or not in the
  project, as one without it, as the interface's (#231): its HDL file made next to it, the message naming the file it
  had (`src/control.vhd generated from src/control.asm.json (its HDL file … is no longer in the project folder)`); a
  file still in the folder but removed from the project is left as it is, with the interface's warning (Generate HDL
  File… or Add to Project).
