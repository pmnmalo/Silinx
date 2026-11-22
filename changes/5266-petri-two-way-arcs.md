In short:

- **A Petri net's two arcs each way:** two arcs between a place and a transition, one each way, are drawn apart, each
  bent to its side, so that each can be clicked, given its weight (shown by it) and deleted.

In detail:

- **Two-way arcs drawn apart (#5266):** the two arcs were drawn on one straight line, rim to rim, so a click always
  selected the later one, and one's weight hid the other's. The arcs' geometry moved to `core/petri-geometry.js`
  (out of `web/js/petri-draw.js`): an arc with one back between the same two nodes is a quadratic curve bent to its
  left (the arc back to the other side), its ends on the nodes' rims toward the bend, an inhibitor's circle at its
  end, its weight beside its own curve; an arc alone stays a straight line. The PNML and the HDL are unchanged.
