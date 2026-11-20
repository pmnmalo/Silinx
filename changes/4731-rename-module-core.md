In short:

- **Rename of a Petri net's or a circuit's module:** its HDL is made again from the Petri net or the circuit, as the
  MCP server's `rename_module` does.

In detail:

- **Rename Module: one implementation (#4731):** `server/rename-module.js` moved to `core/rename-module.js`, over a
  project store; the interface's Rename of a module calls it through its page store, as the MCP's `rename_module` does.
  The interface made a renamed drawing's HDL again with the schematic's generator for anything not an ASM chart, a
  truth table or a state diagram, its error swallowed (a Petri net, a circuit); the drawing's own kind makes it now
  (core/drawing-sync.js), and its messages are in the console. Its files move all or nothing, as the MCP's.
