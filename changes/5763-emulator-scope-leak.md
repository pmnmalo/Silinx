In short:

- A closed Board Emulator no longer stays in memory.

In detail:

- **The Board Emulator's oscilloscope stopped with the emulator (#5763):** its redraw timer, held once its box was no
  longer seen, never looked at its box again, and its watcher kept every closed emulator's page in memory (about 300 KB,
  1500 nodes and 80 listeners each time); the emulator's `destroy()` now stops it. The nightly's stale UI tests brought up
  to date: the circuit editor's Try it bar (its ngspice button hidden for a digital circuit) and its Portuguese
  categories (Analog), the emulator's Watch list read from the Watch's box (the oscilloscope's channels have their
  own), the event-driven engine's Timing heading with the browser's digit grouping. Tests: memory (the regression),
  circuit, emulator-parts, print-emulator, sim-emu, in both interfaces.
