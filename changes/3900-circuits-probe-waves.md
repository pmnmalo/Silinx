In short:

- **Digital circuits, a logic probe:** a logic probe shows its net's level while trying a circuit (H, L, open, X).

In detail:

- **The logic probe of the digital circuits (#3900, part of #3897):** a logic probe part (no port of the HDL; the net it
  watches a signal of it), its level in the MCP's `simulate_drawing`'s steps; a clock's ticks moving the time on by its
  half period (`advance`). (Its waveforms of a Try it replayed in SSim went before a release, #4068: a circuit's
  waveforms are its test bench's simulation's.)
