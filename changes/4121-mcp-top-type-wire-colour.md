In detail:

- **The MCP server's new_project takes the Top-Level Source Type, and edit_circuit sets a wire's colour, as the
  interface does (#4121):** `new_project` takes `top_source_type` and `language`, as New Project's Top-Level Source Type
  and Preferred Language: the project starts with its top document and the top module `top` (a diagram's with its HDL
  module, generated from it), the files the wizard writes, made by the same function (`core/top-source.js`'s `topSourceFiles`); a design and simulation project's top a drawing's. `edit_circuit`'s `set`
  sets a wire's colour, through `setWireProps` of `core/circuit-edit.js`, which the wire's Properties' Colour calls
  now too (an unknown wire, colour or property refused with its message).
