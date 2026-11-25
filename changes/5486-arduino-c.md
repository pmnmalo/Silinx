In detail:

- **The synchronous reactive model's C for the Arduino (#5486):** `core/reactive-c.js` writes a model (a state
  diagram's, an ASM chart's, a Petri net's, a truth table's) as an Arduino sketch a student would write, its HAL the
  Arduino API (pinMode, digitalRead, digitalWrite, millis): one function per tick (`stepMachine`, every `TICK_MS`
  milliseconds of `loop()`), a switch on the state, the states and the pins named constants, and only the masks and
  casts the widths need, the same on the AVR and on a computer. `core/reactive-c-pins.js` maps the ports to the
  board's pins (the user's, then D2 to D13 and A0 to A5; D0 and D1 warned about); a port named as a word of C or of the
  Arduino API is renamed with a warning. Tests: each sketch compiled with the computer's C compiler, as C and as C++,
  against a mock of the Arduino API, with no warning, and run tick by tick against the model (the examples' drawings,
  edge cases, 20- and 32-bit values, a timer); golden files of the examples' sketches; the pins, the names, the errors
  and the warnings.
