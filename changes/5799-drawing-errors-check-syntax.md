In short:

- Check Syntax fails on a drawing with errors that has no HDL file yet (a schematic whose net has two drivers), saying its
  errors on it, instead of compiling its HDL and passing; the MCP's `write_file` and `import_source` say why such a
  drawing has no HDL file.

In detail:

- **A drawing with errors whose HDL is still made (#5799):** Check Syntax (the interface's `web/js/processes.js`, the
  MCP's `check_syntax` through `server/mcp-util.js` `viewSourcesOf`) leaves out the HDL of a drawing with errors and no
  HDL file and says its errors on the drawing, as for a drawing that makes no module (#3934): the top, or an instance an
  HDL top needs. `adoptDrawing` (core/drawing-sync.js) says why it made no HDL file (`WARNING: … has no HDL file yet: it
  has errors: …`; a design project's, its module), not for a new empty drawing of `new_source`.
