In short:

- **IEC gate symbols:** Settings ▸ Schematic Symbols draws the schematics' gates in IEEE Std 91-1984's distinctive
  shapes (the default) or as IEC 60617-12's rectangles, `&`, `≥1`, `=1` and `1`.

In detail:

- **Settings ▸ Schematic Symbols (#4113):** a preference beside Boolean Notation (View ▸ in the ISE style interface),
  kept in the browser: IEEE Std 91-1984 (distinctive shapes), as before, or IEC 60617-12 (rectangular), a box with
  its qualifier inside it and the type under it, a negation the negation circle (a bubble), not the polarity
  indicator. The schematic editor and its read-only views, the palette's and Symbol Info's drawings, and the RTL and
  technology schematics follow it, drawn again when it changes, and so do their printing and their PNG / SVG export;
  every pin stays where it is, so the wires stay connected, and the saved schematic, its netlist, its HDL and its ISE
  export do not change (core/symbol-standard.js, its boxes' geometry tested against the distinctive shapes' pins). The
  circuit editor's Show inside keeps its IEC boxes, now with the same table of qualifiers. The MCP server's
  `set_schematic_symbols` (ieee, iec) sets it for its user, as `set_notation` the notation. Portuguese
  ("Símbolos Esquemáticos").
