In short:

- **Simulation: an inout pin connected to a bit of a vector** (`.p(a[1])`) reads the vector's bit and drives it,
  resolved; its value was lost.

In detail:

- **An inout port connected to a part of a signal, both ways (#4360):** an inout whose actual is a bit or a slice of
  a signal (a place & route netlist's I/O cell on a bit of the top's port) was connected one way only, the port
  driving the actual: its driver, even Z, overrode the parent's bit, and the child never read it. It now has two
  glues, each carrying the other side's drivers resolved without its own (no loop through the connection). A
  Verilog reg's initializer (`reg c = 1`) also counts as its procedural driver's value when another driver (an
  inout's) resolves with it.
