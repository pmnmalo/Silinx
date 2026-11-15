In short:

- A design link with Try it (Share Project… or Share Module…, `view=try`) opens a circuit in its Try it, as it does a
  schematic.

In detail:

- **A view=try link on a circuit (#4119):** `core/design-link.js`'s `TRY_DRAWING` takes the circuit (`.circ.json`), so
  a circuit's module has a Try it link (its name, or its generated HDL's module); the link opens the circuit and starts
  its live simulation (`web/js/link-open.js`, through the circuit editor's `toggleSim`), and Share Module… on a
  circuit's row chooses Try it. The message of a module with no Try it names the circuit too (in Portuguese as well);
  the MCP server's `project_link` says it. Tests: `design-link` (the breadboard example's circuit), `mcp-link`
  (`project_link` and `open_link` on it), UI `design-link` (the link opens the circuit's Try it; Share Module…) in both
  interfaces.
