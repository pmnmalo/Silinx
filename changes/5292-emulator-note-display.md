In short:

- The Board Emulator's note in the console speaks of the display's digits only for a design that drives the display.

In detail:

- **The Board Emulator's note on the display (#5292):** the sentence on the 7-segment display's persistence (each digit
  keeps the last pattern it showed between its refreshes) is said only when a digit's anode is on a pin of the
  constraints, on the compiled engine and the event-driven one; the vga example's note, or a design of LEDs and
  switches, no longer speaks of a display it does not have (`web/js/emulator-side.js`). Tests: the UI's emu-note (a
  design with the display, one without, both engines, in Portuguese), emulator-board-ucf; usability emulator (#5292's
  todo a real test).
