In short:

- **Circuit editor, Show inside:** the three-state buffers and transceivers with an enable a buffer (the 74125, 74126,
  74240, 74241, 74244, 74367, 74368, 74242, 74243) are drawn as their datasheets' connection diagrams.

In detail:

- **The three-state ICs inside (#4505):** `core/circuit-inside-tri.js` lays a buffer whose input and output are on one
  row flat beside them, facing its output, and one across the body standing between its rows, pointing to its output's
  row (a transceiver's two directions side by side, its pin's two lines joined by a dot); each enable pin's bus feeds its
  buffers' sides, a bubble where it is active low, a dot where it branches. The buses cross the data lines at right
  angles, drawn as the circuit's wires cross (⋮ Wire crossings), never with a dot; these ICs join `CROSSING_ICS` by
  name. The test asserts a dot at every T of one pin's lines and none on a crossing. The ICs with combined enables
  (74365, 74366, 74540, 74541, 74245) keep their pins named for now.
