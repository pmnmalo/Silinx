In detail:

- **Usability tests: the breadboard (#5148, its third part):** `test/usability/circuit-build.test.js`: an IC placed from
  the parts panel on the breadboard example, powered with two wires to the rails, linked to another IC's output (Check's
  warnings exactly); the breadboard dragged with all on it (the wires follow, the nets kept); a short circuit and a
  floating input made on purpose, said, undone; and `circuit-random.test.js`: random sequences of ICs placed, powered,
  linked, moved along the row and deleted, wires deleted, Undo and Redo, with a fixed seed. After every step the
  circuit's invariants (its check's errors, the wires still attached, the new wires' loose ends) and its HDL in VHDL and
  Verilog; Undo back to the start and Redo. The bug they found is an issue of its own: #5162 (a breadboard turned lands
  its holes under the leads of the parts beside it), its scenario marked to do.
