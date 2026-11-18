In short:

- **Circuit editor:** Show inside draws the 4023, 4025, 4073 and 4075's gates too, and the latches show a latch's symbol
  in the Parts panel.

In detail:

- **The 4023 family inside, with one crossing (#4505):** their first gate (1A, 1B from the lower row, 1C from the upper
  one past 1Y) lies in the body's middle, 1C's line over it crossing 1Y's once at a right angle, drawn as the circuit's
  wires cross (⋮ Wire crossings: a hop-over, or plain; no dot), `core/circuit-inside-cross.js`. The ICs a crossing is
  allowed in are listed by name (`CROSSING_ICS`); the test holds every other IC to none, and these to right-angle
  crossings only.
- **The latches' symbol in the Parts panel (#4505):** the 7475, 7477, 74375, 74279, 74373 and 74573 (and any latch added
  later, by its title) show a level-enabled storage box instead of a bare DIP.
