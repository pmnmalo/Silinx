In short:

- **The reset's arrow can be moved:** drag it around the initial state of a state diagram, off the arrows of its other
  transitions.

In detail:

- **The reset's arrow dragged around the initial state (#4903):** the arrow into the initial state, and the reset's
  name with it, can be dragged around the state in steps of 5°, like a self-loop. Its direction is saved with the
  diagram (`entryAngle`; none: the left, as before), shared live, undone and redone; Arrange puts it back on the left,
  and a self-loop's default direction avoids it. The HDL is unchanged.
