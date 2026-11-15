In short:

- The circuit editor's Try it has its own bar, as the schematic's, with Reset and Stop; the toolbar has no Reset and no
  Waveforms button any more: a circuit's waveforms are those of its test bench's simulation.

In detail:

- **The circuit's Try it bar (#4067):** while trying a circuit, a green bar above the canvas (as the schematic's): Try it,
  its Reset (the simulation again from time 0) and its Stop (Esc too); the time in the status line. The toolbar's Reset
  goes. UI tests `circuit` (Reset, Esc, Portuguese) and `try-it-body` (the bar's green, Stop) in both interfaces.
- **No circuit waveforms of their own (#4068):** the Waveforms button, the Try it replayed in SSim
  (`core/circuit-replay.js`, `web/js/circuit-waves.js`) and `simulate_drawing`'s `waveforms` option go; a circuit's
  waveforms are its test bench's, simulated as any module's. Tests: `mcp-circuit` (the option refused),
  `circuit-probe`.
