In short:
- A drawing saved with errors (an ASM chart's too) says so in the console in the same words as the MCP server's
  `write_file`, and a drawing saved while a Rename runs gets its HDL made again once the Rename is done.

In detail:
- The editors (schematic, ASM chart, state diagram, truth table, Petri net, circuit) make their HDL again through
  core/drawing-sync.js `syncDrawing`, the MCP server's, over the page's project store (web/js/page-store.js): one
  implementation, one set of messages, a drawing in another language than its file's included (#4750).
- `S.syncing`, a flag set and cleared across awaits that skipped a drawing's sync while it was set, is replaced by one
  queue (`serialDrawings`) for what rewrites drawings or their HDL files: a drawing's sync, Rename, Convert to Schematic
  (#4750).
