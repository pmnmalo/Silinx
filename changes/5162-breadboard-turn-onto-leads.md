In short:

- A breadboard turned or dragged onto the leads of the parts beside it, or a part dropped on another's leads, is
  refused, with a message in the console that names the parts in the way, instead of joining them in a short circuit.

In detail:

- **Circuit: a part moved or turned onto other parts' leads refused (#5162):** a breadboard turned (R) with its parts
  on it could put its holes under the leads of the parts beside it (the button's, the clock's, the switch's), joining
  them to its strips with no word (Check then said a short circuit). A move or a turn (core/circuit-edit.js, the
  editor's and the MCP server's `edit_circuit`'s) is now refused when a lead it moves, or a breadboard's hole, would
  land on the lead of a part it does not carry: "BB1 cannot be turned: it would land on the leads of B1, joining
  them". A part dragged there stays at the last place it could, the message said on release; translated in
  Portuguese.
