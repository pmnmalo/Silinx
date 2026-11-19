In detail:

- **Co-design: the system co-simulation scheduler (#4696, phase 1 of #4695):** `core/system-sim.js` simulates the nodes
  of a system together on one global time in ps, each engine behind an adapter (`advanceTo`, `setPin`, its pins'
  changes with their times, `nextEventTime`), the links exchanged pin by pin in windows: a conservative
  synchronisation with an adaptive quantum (a sixteenth of a UART bit while a link is active, wide while the links are
  idle), each burst of a link's changes delivered with one lag so that its waveform keeps its shape; a link with a fixed
  latency is exact (the same run at every quantum). Deterministic, synchronous, no SharedArrayBuffer: the whole system
  in one Web Worker (`core/system-sim-remote.js`). The adapters of Silinx's compiled engine
  (`core/system-sim-compiled.js`, one per FPGA node with its own clock; the engine's `watch.pins` records the pins'
  changes with their cycles) and of the event-driven simulator (`core/system-sim-event.js`, its waveforms).
  `scripts/bench-system-sim.mjs` measures two `uart` example nodes linked by a UART both ways, against the quantum
  (the AVR node's hook for #4698).
