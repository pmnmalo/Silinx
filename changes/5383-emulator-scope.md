In short:

- **An oscilloscope in the Board Emulator:** two channels on the design's signals, with the time base (now from 10 ns a
  division), trigger, cursors and measurements of the circuits' oscilloscope.

In detail:

- **The Board Emulator's oscilloscope (part of #5383, #5387):** web/js/emulator-scope.js, a box of the side panel: two
  channels, each a one-bit signal of the design at the board's 3.3 V, its waveform recorded from when it is chosen (the
  emulator records only its outputs' otherwise), drawn as the circuits' oscilloscope (circuit-draw-scope.js) with its
  knobs, cursors and measurements, refreshed while it is seen; on the compiled engine, which keeps no waveforms, it says
  it needs the event-driven one. core/scope.js: the knobs (turnKnob, the circuit editor's too) and a waveform as a trace
  (waveTrace); the time bases from 10 ns a division. Portuguese. Tests: scope (the knobs, a waveform as a trace); the
  UI's emu-scope (a signal's frequency and duty cycle measured) in both interfaces and Portuguese.
