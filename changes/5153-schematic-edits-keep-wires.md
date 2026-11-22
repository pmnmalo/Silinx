In short:

- Schematic: a gate's inputs changed in Properties (AND4 to AND2), Rotate and Mirror keep the symbol's wires on its
  pins; a net name on a moved symbol's pin goes with it; a wire's segment dragged onto another net's wire is moved clear
  of it; a change in Properties right after a wire was drawn is no longer lost.

In detail:

- **Schematic: a symbol's type changed in Properties keeps its wires (#5153):** a gate's inputs (OR4 to OR2), its
  inverted inputs, a multiplexer's select bits and a flip-flop's inputs set the symbol's type and left the wires where
  its old pins were. They now re-pin it as a COMP's comparisons do (#1555, `repinSymbol`): the wires on the pins that stay
  follow them, those of the pins that go are dropped, in one Undo step.
- **Schematic: a net name on a moved symbol's pin moves with it (#5154):** a gate whose output's wire carries its
  net's name at the pin (the gates example's `or_sum`, `prime_sop`) moved left the name behind, off every wire: the net
  lost its name and its connection by name. With Keep connections, the name now moves with the pin, on the wire's end.
- **Schematic: a segment dragged onto another net's wire is nudged clear of it (#5155):** as a wire drawn there (#948),
  the wire is routed between its ends along the path dragged, leaving it only where it must; not when that would change
  the connections.
- **Schematic: Rotate and Mirror keep the wires on the symbol's pins (#5156):** with Keep connections, the wires, I/O
  markers and net names on the pins of a symbol turned or flipped follow them (`followPins`, which now also follows a
  pin that moves both ways), routed around what they then run over.
- **Schematic: a Properties change after a wire was drawn is kept (#5159):** drawing a wire replaced the document but
  left the Properties panel editing the selected symbol's old copy; the panel is now drawn again for the document's own.
- **Usability tests: the schematic's place step in Portuguese (#5187):** the point clicked is measured once the symbol
  is chosen (its toolbar options move the sheet).
