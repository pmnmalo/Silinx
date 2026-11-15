In short:

- The circuit editor keeps the wires connected when a part moves or turns (Keep connections, in the toolbar), a
  breadboard carries the parts plugged into it, every part turns (a breadboard too), and parts are copied and pasted.

In detail:

- **Moves that keep the connections (#4059):** a breadboard moved carries the parts with a pin in its holes and the wires
  between them; the toolbar's **Keep connections** (as the schematic's, remembered, on by default) has the ends of the
  other wires on the moved pins and holes follow them, shown while dragging. `core/circuit-edit.js` `movePart` and
  `rotatePart` (`{ keep }`), the MCP server's `edit_circuit` move and rotate (`keep: false`). Tests:
  `test/circuit-edit.test.js` (the connections against the circuit's nets before the edit), `test/mcp-circuit.test.js`,
  UI `circuit-moves`.
- **Every part turned (#4065):** a breadboard too, its holes and the parts on it with it, drawn turned.
- **Copy and paste (#4066):** Ctrl+C / Ctrl+X / Ctrl+V and Edit ▸ Cut, Copy, Paste copy the selected part (a breadboard
  with its parts and the wires between them), pasted 2 steps right and down, further each time, new ids given, a label
  another part has left out (`copyParts`, `pasteParts`; `edit_circuit`'s `copy`).
