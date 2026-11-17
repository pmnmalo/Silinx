In detail:

- **The exports nothing used and the identifier rules' copies left by #3543 / #3545, cleaned up (#3599):** the names
  of the drawings' parsers, Silinx HLS, live sharing, the MCP server and the 7-series in the browser that only their own
  module used are no longer exported, `LANGS` (core/asm.js) and `typeName` (core/c-types.js), used nowhere, are removed,
  and core/asm.js, asm-gen.js, logic.js, c-pragma.js and the MCP server's new_source, test bench and wizards take the
  identifier rules from core/ident.js; test/unused-exports.test.js's and test/ident-escape.test.js's exceptions keep
  only their reviewed ones. No change in behaviour.
