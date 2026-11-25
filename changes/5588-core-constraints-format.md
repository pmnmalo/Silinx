In detail:

- **readPins and writePins moved to `core/constraints-format.js` (#5588):** they read and write a constraints file's pins
  in its family's format. The move changes nothing; `web/js/constraints-format.js` re-exports them. They now run in the
  MCP server too, for the System's FPGA nodes (#5581).
