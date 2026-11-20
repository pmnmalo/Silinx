In short:

- A drawing saved by a newer Silinx opens read-only, with a warning, rather than being saved again in the older
  format and losing what the newer Silinx added.

In detail:

- **Documents a newer Silinx saved (#4756):** `core/doc-format.js` knows each kind of drawing's format (schematic 7,
  state diagram, ASM chart, truth table, Petri net and circuit 1) and silinx.json's (1). A drawing whose version is
  greater opens read-only ("Read-only, saved by a newer Silinx" at the end of its toolbar), and the console's warning
  says why; a project a newer Silinx saved is said when it opens. A write that would put a newer drawing back in an
  older format is refused, with why, by the local server (a 409: the interface, the MCP server) and by the browser
  edition's stores, so that nothing that newer Silinx added is dropped; the drawing written in its own format, or a
  newer one, is written as before.
