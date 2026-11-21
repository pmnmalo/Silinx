In short:

- **Schematic: another case of a dangling stub after dragging a wire, gone:** the stub left when a wire's segment is
  dragged onto a point where the wire under it was split (as deleting a wire that ended there leaves it).

In detail:

- **Schematic, wires drawn twice over: doubled pieces of the same length (#5042):** #4920's clean-up
  (`core/schwire-fold.js`) tried only the first wire in the document as the one to trim when the two doubled end
  segments were equally long. When that wire could not be trimmed (the other piece's end on its bend), the stub stayed,
  depending on the wires' order in the file. Both are now tried: the stub piece is removed, and the result is the same
  whatever the wires' order.
