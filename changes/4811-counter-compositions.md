In short:

- The counters of the schematic palette can be pushed into too: CB8CE is a register of 8 bits and an incrementer,
  INC8 two INC4, INC4 four half adders. Pushed into during a Try it, a counter shows the symbol's count and its
  incrementer the next value, following the clock.

In detail:

- **The compositions of the counters (#4811, part of #4806):** `core/symlib-cnt.js`.
  - A counter is a register (FD, FDE, FDCE or FDRE, as its enable and its reset ask) and an incrementer, Q ← Q + 1.
  - INC n is a chain of half adders (HA: XOR2, AND2), drawn as the adder's chain (`chain` of `core/symlib-add.js` now
    takes another block), its carry in 1.
  - A down counter's DEC n is a chain of half subtractors (HS: XOR2, INV, AND2).
  - Pins per bit are taps of the count's bus.
- **Tests:** every width, enable, reset and direction is proved equivalent to the symbol's own HDL by Yosys's
  structural proof (sequential, VHDL and Verilog) and simulated clock edge by clock edge against a model. They are
  views: the HDL generated for the symbol is unchanged.
- **Opened from a Try it, a counter's composition shows the symbol's count:** its outputs are forced
  (`core/symlib-live.js` `forceOutputs`), since its own register starts at 0, and the levels below take it.
- **MCP:** `symbol_composition` takes a counter's count Q among its inputs.
