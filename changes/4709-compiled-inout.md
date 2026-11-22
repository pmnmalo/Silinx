In short:

- The Board Emulator and the co-design's simulation run a design with an `inout` port (a bidirectional bus, an
  open-drain line) on the compiled engine, tens of times faster than before.

In detail:

- **The compiled engine's tristate pins (#4709, roadmap #4695):** a top-level `inout` port, or an output port driven
  with `'Z'`, is a pad of the compiled design (`core/compiled-inout.js`): an inout port's input (`set('p', v)`, the
  level the outside drives), its output (`get('p')`, 0 where the design does not drive it) and its enable
  (`get('p:en')`), read from Yosys's tristate multiplexers and `$tribuf` cells; what the design reads of the port is
  the pin's level, its own output where it drives it, the outside's elsewhere. Such a design was refused (an inout
  port) or compiled with a warning ('Z' as 0, a tristate output); now neither. A tristate inside the design is
  compiled as before, and one that drives a pin and the design's own nets is refused with its reason. Before the
  co-design's I²C links: an FPGA's I²C slave on the compiled engine.
