In detail:

- **Check Syntax: a bus's I/O marker joined to its bits by name (#4846):** a marker (A, 8 bits) on a short wire of its
  own, its bits named on other wires as ISE names them (A(7:4), A(3:0), #1688), was reported "I/O marker 'A' is not
  connected" though its HDL connected them; it is connected to them, no warning.
