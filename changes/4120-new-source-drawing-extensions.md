In short:

- **New Source:** a file name typed with its drawing's extension, `x.circ.json` too, is accepted (it was refused: *Enter a
  valid file name*), and the Summary page shows it once (not `x.fsm.json.fsm.json`).

In detail:

- **New Source: one list of the sources' extensions taken off a typed name (#4120):** `sourceBase` (core/ident.js), used by
  the wizard's File Name page, its Summary page and the MCP server's new_source, which each had their own list:
  `.circ.json` was in none of them, and the Summary's missed `.fsm.json`, `.pn.json`, `.lab.json`, `.c` and `.cpp` too.
