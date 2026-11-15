In short:

- The circuit editor's ⋮ menu draws the wires **Direct**, **Orthogonal** or **Curved**, as the schematic's.

In detail:

- **The circuit's wire styles (#4080):** the ⋮ menu's Curved wires tick box becomes a choice, **Wires**: Direct (a
  straight line from point to point, the default, today's wires), Orthogonal (horizontal and vertical segments) and
  Curved; the circuit's `wireStyle` (`direct`, `orthogonal`, `curved`; direct not written), an edit undone by Undo; the
  MCP's `edit_circuit` `{ op: "wires", style }` takes the three: the schematic's styles and their labels (`core/wire-style.js`, #4085, its default here `direct`),
  drawn by `core/circuit-wires.js` (`orthoPoints`).
  Tests: `circuit-wires` (every orthogonal step horizontal or vertical, through the same points), `mcp-circuit`, UI
  `circuit-look` in both interfaces and Portuguese.
